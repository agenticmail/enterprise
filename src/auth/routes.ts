/**
 * Authentication Routes
 * 
 * Handles login (email/password), JWT issuance, SAML, and OIDC callbacks.
 * Uses httpOnly secure cookies for session management (enterprise-grade security).
 * Also supports Bearer token + API key auth for programmatic access.
 */

import { Hono } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import type { DatabaseAdapter } from '../db/adapter.js';

const COOKIE_NAME = 'em_session';
const REFRESH_COOKIE = 'em_refresh';
const CSRF_COOKIE = 'em_csrf';
const TOKEN_TTL = '24h';
const REFRESH_TTL = '7d';

function cookieOpts(maxAge: number, isSecure: boolean) {
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'Lax' as const,
    path: '/',
    maxAge,
  };
}

function generateCsrf(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function createAuthRoutes(db: DatabaseAdapter, jwtSecret: string) {
  const auth = new Hono();

  const isSecure = () => {
    // In production (HTTPS), set Secure flag. For localhost dev, don't require it.
    return process.env.NODE_ENV === 'production' || process.env.SECURE_COOKIES === '1';
  };

  async function issueTokens(userId: string, email: string, role: string) {
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode(jwtSecret);

    const token = await new SignJWT({ sub: userId, email, role })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(TOKEN_TTL)
      .sign(secret);

    const refreshToken = await new SignJWT({ sub: userId, type: 'refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(REFRESH_TTL)
      .sign(secret);

    return { token, refreshToken };
  }

  // Helper: extract JWT from cookie OR Authorization header
  async function extractToken(c: any): Promise<string | null> {
    // 1. httpOnly cookie (preferred — most secure)
    const cookieToken = getCookie(c, COOKIE_NAME);
    if (cookieToken) return cookieToken;

    // 2. Bearer token header (for programmatic/API access)
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);

    return null;
  }

  // ─── Email/Password Login ───────────────────────────────

  auth.post('/login', async (c) => {
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: 'Email and password required' }, 400);
    }

    const user = await db.getUserByEmail(email);
    if (!user || !user.passwordHash) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const { default: bcrypt } = await import('bcryptjs');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const { token, refreshToken } = await issueTokens(user.id, user.email, user.role);
    const csrf = generateCsrf();
    const secure = isSecure();

    // Set httpOnly cookies
    setCookie(c, COOKIE_NAME, token, cookieOpts(86400, secure));         // 24h
    setCookie(c, REFRESH_COOKIE, refreshToken, cookieOpts(604800, secure)); // 7d
    // CSRF token — readable by JS (not httpOnly) so the frontend can include it in headers
    setCookie(c, CSRF_COOKIE, csrf, { ...cookieOpts(86400, secure), httpOnly: false });

    // Update last login
    await db.updateUser(user.id, { lastLoginAt: new Date() } as any);
    await db.logEvent({
      actor: user.id, actorType: 'user', action: 'auth.login',
      resource: `user:${user.id}`, details: { method: 'password' },
      ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
    });

    // Also return token in body for programmatic clients
    return c.json({
      token,
      refreshToken,
      csrf,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  });

  // ─── Token Refresh ──────────────────────────────────────

  auth.post('/refresh', async (c) => {
    // Try cookie first, then body/header
    const refreshJwt = getCookie(c, REFRESH_COOKIE) || c.req.header('Authorization')?.slice(7);
    if (!refreshJwt) {
      return c.json({ error: 'Refresh token required' }, 401);
    }

    try {
      const { jwtVerify } = await import('jose');
      const secret = new TextEncoder().encode(jwtSecret);
      const { payload } = await jwtVerify(refreshJwt, secret);

      if (payload.type !== 'refresh') return c.json({ error: 'Invalid token type' }, 401);

      const user = await db.getUser(payload.sub as string);
      if (!user) return c.json({ error: 'User not found' }, 401);

      const { token, refreshToken } = await issueTokens(user.id, user.email, user.role);
      const csrf = generateCsrf();
      const secure = isSecure();

      setCookie(c, COOKIE_NAME, token, cookieOpts(86400, secure));
      setCookie(c, REFRESH_COOKIE, refreshToken, cookieOpts(604800, secure));
      setCookie(c, CSRF_COOKIE, csrf, { ...cookieOpts(86400, secure), httpOnly: false });

      return c.json({ token, csrf });
    } catch {
      return c.json({ error: 'Invalid or expired refresh token' }, 401);
    }
  });

  // ─── Current User ───────────────────────────────────────

  auth.get('/me', async (c) => {
    const token = await extractToken(c);
    if (!token) return c.json({ error: 'Authentication required' }, 401);

    try {
      const { jwtVerify } = await import('jose');
      const secret = new TextEncoder().encode(jwtSecret);
      const { payload } = await jwtVerify(token, secret);
      const user = await db.getUser(payload.sub as string);
      if (!user) return c.json({ error: 'User not found' }, 404);
      const { passwordHash, ...safe } = user;
      return c.json(safe);
    } catch {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }
  });

  // ─── Logout ─────────────────────────────────────────────

  auth.post('/logout', (c) => {
    const secure = isSecure();
    deleteCookie(c, COOKIE_NAME, { path: '/' });
    deleteCookie(c, REFRESH_COOKIE, { path: '/' });
    deleteCookie(c, CSRF_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  // ─── SAML 2.0 (Placeholder) ────────────────────────────

  auth.post('/saml/callback', async (c) => {
    return c.json({ error: 'SAML not yet configured' }, 501);
  });

  auth.get('/saml/metadata', async (c) => {
    return c.json({ error: 'SAML not yet configured' }, 501);
  });

  // ─── OIDC (Placeholder) ────────────────────────────────

  auth.get('/oidc/authorize', async (c) => {
    return c.json({ error: 'OIDC not yet configured' }, 501);
  });

  auth.get('/oidc/callback', async (c) => {
    return c.json({ error: 'OIDC not yet configured' }, 501);
  });

  return auth;
}
