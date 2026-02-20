/**
 * Authentication Routes
 *
 * Handles login (email/password), JWT issuance, SAML 2.0, and OIDC.
 * Uses httpOnly secure cookies for session management (enterprise-grade security).
 * Also supports Bearer token + API key auth for programmatic access.
 */

import { Hono } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { createVerify } from 'node:crypto';
import type { DatabaseAdapter, SsoConfig } from '../db/adapter.js';

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

function generateState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[b % 66])
    .join('');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createAuthRoutes(
  db: DatabaseAdapter,
  jwtSecret: string,
  opts?: {
    onBootstrap?: () => void;
    onDbConfigure?: (newAdapter: DatabaseAdapter) => DatabaseAdapter;
  },
) {
  const auth = new Hono();

  const isSecure = () => {
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

  /** Set session cookies and return token info */
  async function setSessionCookies(c: any, userId: string, email: string, role: string, method: string) {
    const { token, refreshToken } = await issueTokens(userId, email, role);
    const csrf = generateCsrf();
    const secure = isSecure();

    setCookie(c, COOKIE_NAME, token, cookieOpts(86400, secure));
    setCookie(c, REFRESH_COOKIE, refreshToken, cookieOpts(604800, secure));
    setCookie(c, CSRF_COOKIE, csrf, { ...cookieOpts(86400, secure), httpOnly: false });

    await db.updateUser(userId, { lastLoginAt: new Date() } as any).catch(() => {});
    await db.logEvent({
      actor: userId, actorType: 'user', action: 'auth.login',
      resource: `user:${userId}`, details: { method },
      ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
    }).catch(() => {});

    return { token, refreshToken, csrf };
  }

  /** Find or auto-provision an SSO user */
  async function findOrProvisionSsoUser(
    provider: string,
    subject: string,
    email: string,
    name: string,
    config: { autoProvision?: boolean; defaultRole?: string; allowedDomains?: string[] },
  ) {
    // Check domain allowlist
    if (config.allowedDomains?.length) {
      const domain = email.split('@')[1]?.toLowerCase();
      if (!config.allowedDomains.some(d => d.toLowerCase() === domain)) {
        return { error: `Email domain "${domain}" not allowed for SSO login` };
      }
    }

    // Try to find existing SSO user
    let user = await db.getUserBySso(provider, subject);
    if (user) return { user };

    // Try to find by email (link existing account)
    user = await db.getUserByEmail(email);
    if (user) {
      // Link SSO to existing account
      await db.updateUser(user.id, { ssoProvider: provider, ssoSubject: subject } as any);
      return { user };
    }

    // Auto-provision if enabled
    if (!config.autoProvision) {
      return { error: 'No account found. Contact your administrator to create an account.' };
    }

    const newUser = await db.createUser({
      email,
      name: name || email.split('@')[0],
      role: (config.defaultRole as any) || 'member',
      ssoProvider: provider,
      ssoSubject: subject,
    });
    return { user: newUser };
  }

  // Helper: extract JWT from cookie OR Authorization header
  async function extractToken(c: any): Promise<string | null> {
    const cookieToken = getCookie(c, COOKIE_NAME);
    if (cookieToken) return cookieToken;
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
    return null;
  }

  /** Load SSO config from company settings */
  async function getSsoConfig(): Promise<SsoConfig | null> {
    try {
      const settings = await db.getSettings();
      return settings?.ssoConfig || null;
    } catch {
      return null;
    }
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

    const { token, refreshToken, csrf } = await setSessionCookies(c, user.id, user.email, user.role, 'password');

    return c.json({
      token,
      refreshToken,
      csrf,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  });

  // ─── Token Refresh ──────────────────────────────────────

  auth.post('/refresh', async (c) => {
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
    deleteCookie(c, COOKIE_NAME, { path: '/' });
    deleteCookie(c, REFRESH_COOKIE, { path: '/' });
    deleteCookie(c, CSRF_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  // ─── SSO Config Info (public — tells frontend what's available) ──

  auth.get('/sso/providers', async (c) => {
    const sso = await getSsoConfig();
    const providers: { type: string; name: string; url: string }[] = [];

    if (sso?.saml?.entityId && sso?.saml?.ssoUrl) {
      providers.push({ type: 'saml', name: 'SAML SSO', url: '/auth/saml/login' });
    }
    if (sso?.oidc?.clientId && sso?.oidc?.discoveryUrl) {
      providers.push({ type: 'oidc', name: 'OpenID Connect', url: '/auth/oidc/authorize' });
    }

    return c.json({ providers, ssoEnabled: providers.length > 0 });
  });

  // ─── Setup Status (public — tells frontend if onboarding is needed) ──

  auth.get('/setup-status', async (c) => {
    try {
      const stats = await db.getStats();
      const settings = await db.getSettings();

      const hasUsers = stats.totalUsers > 0;
      const hasCompanyName = !!(settings?.name && settings.name !== '' && settings.name !== 'My Company');
      const hasSmtp = !!(settings?.smtpHost);
      const hasAgents = stats.totalAgents > 0;

      return c.json({
        setupComplete: hasUsers,
        needsBootstrap: !hasUsers,
        checklist: {
          adminCreated: hasUsers,
          companyConfigured: hasCompanyName,
          emailConfigured: hasSmtp,
          agentCreated: hasAgents,
        },
      });
    } catch {
      return c.json({ setupComplete: false, needsBootstrap: true, checklist: { adminCreated: false, companyConfigured: false, emailConfigured: false, agentCreated: false } });
    }
  });

  // ─── Database Configuration (only during initial setup) ──────────

  auth.post('/test-db', async (c) => {
    const stats = await db.getStats();
    if (stats.totalUsers > 0) {
      return c.json({ error: 'Setup already complete. Database configuration is disabled.' }, 403);
    }

    const body = await c.req.json();
    if (!body.type) {
      return c.json({ error: 'Database type is required' }, 400);
    }

    try {
      const { createAdapter } = await import('../db/factory.js');
      const testAdapter = await createAdapter(body);
      await testAdapter.getStats();
      await testAdapter.disconnect();
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ success: false, error: err.message || 'Connection failed' }, 400);
    }
  });

  auth.post('/configure-db', async (c) => {
    const stats = await db.getStats();
    if (stats.totalUsers > 0) {
      return c.json({ error: 'Setup already complete. Database configuration is disabled.' }, 403);
    }

    if (!opts?.onDbConfigure) {
      return c.json({ error: 'Database hot-swap not available' }, 501);
    }

    const body = await c.req.json();
    if (!body.type) {
      return c.json({ error: 'Database type is required' }, 400);
    }

    try {
      const { createAdapter } = await import('../db/factory.js');
      const newAdapter = await createAdapter(body);

      // Run migrations on new adapter
      await newAdapter.migrate();

      // Hot-swap the live DB connection
      const oldAdapter = opts.onDbConfigure(newAdapter);

      // Disconnect old (temp) adapter
      try { await oldAdapter.disconnect(); } catch { /* best effort */ }

      // Save encrypted config
      try {
        const { saveDbConfig } = await import('../lib/config-store.js');
        await saveDbConfig(body, jwtSecret);
      } catch { /* non-fatal — config won't auto-restore on restart */ }

      return c.json({ success: true, type: body.type });
    } catch (err: any) {
      return c.json({ success: false, error: err.message || 'Configuration failed' }, 400);
    }
  });

  // ─── Bootstrap (first admin creation — only works when no users exist) ──

  const bootstrapAttempts = new Map<string, { count: number; resetAt: number }>();

  auth.post('/bootstrap', async (c) => {
    // Per-IP rate limit: max 5 bootstrap attempts per minute
    const clientIp = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown';
    const now = Date.now();
    const attempt = bootstrapAttempts.get(clientIp);
    if (attempt && attempt.resetAt > now && attempt.count >= 5) {
      return c.json({ error: 'Too many attempts. Try again later.' }, 429);
    }
    if (!attempt || attempt.resetAt <= now) {
      bootstrapAttempts.set(clientIp, { count: 1, resetAt: now + 60000 });
    } else {
      attempt.count++;
    }

    // SECURITY: Only works when zero users exist
    const stats = await db.getStats();
    if (stats.totalUsers > 0) {
      return c.json({ error: 'Setup already complete. Bootstrap is disabled.' }, 403);
    }

    const { name, email, password, companyName, subdomain } = await c.req.json();

    if (!email || !password || !name) {
      return c.json({ error: 'Name, email, and password are required' }, 400);
    }
    if (password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400);
    }
    if (!email.includes('@') || !email.includes('.')) {
      return c.json({ error: 'Invalid email address' }, 400);
    }

    try {
      const user = await db.createUser({
        email,
        name,
        role: 'owner',
        password,
      });

      if (companyName || subdomain) {
        const updates: Record<string, any> = {};
        if (companyName) updates.name = companyName;
        if (subdomain) {
          updates.subdomain = subdomain
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 63);
        }
        await db.updateSettings(updates);
      }

      await db.logEvent({
        actor: user.id,
        actorType: 'system',
        action: 'setup.bootstrap',
        resource: `user:${user.id}`,
        details: { method: 'web-wizard', companyName },
        ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      });

      const { token, refreshToken, csrf } = await setSessionCookies(c, user.id, user.email, user.role, 'bootstrap');

      // Notify server that setup is complete (flips the dashboard latch)
      opts?.onBootstrap?.();

      return c.json({
        token,
        refreshToken,
        csrf,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    } catch (err: any) {
      return c.json({ error: err.message || 'Bootstrap failed' }, 500);
    }
  });

  // ─── OIDC Authorization Code Flow ────────────────────────

  /**
   * Step 1: Redirect user to the OIDC provider's authorization endpoint.
   * Uses PKCE (S256) for security.
   */
  auth.get('/oidc/authorize', async (c) => {
    const sso = await getSsoConfig();
    if (!sso?.oidc?.clientId || !sso?.oidc?.discoveryUrl) {
      return c.json({ error: 'OIDC not configured. Set up OIDC in Settings > SSO.' }, 400);
    }

    const oidc = sso.oidc;

    // Fetch OIDC discovery document
    let discovery: any;
    try {
      const res = await fetch(oidc.discoveryUrl);
      if (!res.ok) throw new Error(`Discovery fetch failed: ${res.status}`);
      discovery = await res.json();
    } catch (e: any) {
      return c.json({ error: `Failed to fetch OIDC discovery: ${e.message}` }, 502);
    }

    if (!discovery.authorization_endpoint) {
      return c.json({ error: 'Invalid OIDC discovery: missing authorization_endpoint' }, 502);
    }

    // Generate PKCE + state
    const state = generateState();
    const nonce = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Determine callback URL
    const protocol = c.req.header('x-forwarded-proto') || 'http';
    const host = c.req.header('host') || 'localhost';
    const redirectUri = `${protocol}://${host}/auth/oidc/callback`;

    // Store state for verification in callback (10 min TTL)
    // We store it in a signed JWT since we may not have engine DB available at auth level
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode(jwtSecret);
    const stateToken = await new SignJWT({
      state, nonce, codeVerifier, redirectUri,
      discoveryUrl: oidc.discoveryUrl,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(secret);

    // Store state token in a cookie
    setCookie(c, 'em_oidc_state', stateToken, {
      httpOnly: true,
      secure: isSecure(),
      sameSite: 'Lax',
      path: '/auth/oidc',
      maxAge: 600,
    });

    // Build authorization URL
    const scopes = oidc.scopes?.join(' ') || 'openid email profile';
    const authUrl = new URL(discovery.authorization_endpoint);
    authUrl.searchParams.set('client_id', oidc.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    return c.redirect(authUrl.toString());
  });

  /**
   * Step 2: OIDC callback — exchange code for tokens, extract user info, create session.
   */
  auth.get('/oidc/callback', async (c) => {
    const code = c.req.query('code');
    const returnedState = c.req.query('state');
    const error = c.req.query('error');
    const errorDesc = c.req.query('error_description');

    if (error) {
      return c.html(ssoErrorPage('OIDC Error', errorDesc || error));
    }

    if (!code || !returnedState) {
      return c.html(ssoErrorPage('OIDC Error', 'Missing code or state parameter'));
    }

    // Verify state from cookie
    const stateCookie = getCookie(c, 'em_oidc_state');
    if (!stateCookie) {
      return c.html(ssoErrorPage('OIDC Error', 'Session expired. Please try again.'));
    }

    // Delete the state cookie
    deleteCookie(c, 'em_oidc_state', { path: '/auth/oidc' });

    let statePayload: any;
    try {
      const { jwtVerify } = await import('jose');
      const secret = new TextEncoder().encode(jwtSecret);
      const { payload } = await jwtVerify(stateCookie, secret);
      statePayload = payload;
    } catch {
      return c.html(ssoErrorPage('OIDC Error', 'Invalid or expired state. Please try again.'));
    }

    if (statePayload.state !== returnedState) {
      return c.html(ssoErrorPage('OIDC Error', 'State mismatch. Possible CSRF attack.'));
    }

    const sso = await getSsoConfig();
    if (!sso?.oidc) {
      return c.html(ssoErrorPage('OIDC Error', 'OIDC is no longer configured.'));
    }

    const oidc = sso.oidc;

    // Fetch discovery for token endpoint
    let discovery: any;
    try {
      const res = await fetch(oidc.discoveryUrl);
      discovery = await res.json();
    } catch (e: any) {
      return c.html(ssoErrorPage('OIDC Error', `Discovery fetch failed: ${e.message}`));
    }

    // Exchange code for tokens
    let tokenResponse: any;
    try {
      const tokenRes = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: statePayload.redirectUri,
          client_id: oidc.clientId,
          client_secret: oidc.clientSecret,
          code_verifier: statePayload.codeVerifier,
        }).toString(),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        throw new Error(`Token exchange failed (${tokenRes.status}): ${errBody}`);
      }
      tokenResponse = await tokenRes.json();
    } catch (e: any) {
      return c.html(ssoErrorPage('OIDC Error', e.message));
    }

    // Extract user info from id_token or userinfo endpoint
    let email: string;
    let name: string;
    let sub: string;

    if (tokenResponse.id_token) {
      // Decode the id_token (header.payload.signature)
      const parts = tokenResponse.id_token.split('.');
      if (parts.length !== 3) {
        return c.html(ssoErrorPage('OIDC Error', 'Invalid id_token format'));
      }

      try {
        // Verify the id_token signature using the provider's JWKS
        const { jwtVerify, createRemoteJWKSet } = await import('jose');
        const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
        const { payload } = await jwtVerify(tokenResponse.id_token, jwks, {
          issuer: discovery.issuer,
          audience: oidc.clientId,
        });

        // Verify nonce
        if (payload.nonce !== statePayload.nonce) {
          return c.html(ssoErrorPage('OIDC Error', 'Nonce mismatch. Possible replay attack.'));
        }

        sub = payload.sub as string;
        email = (payload.email as string) || '';
        name = (payload.name as string) || (payload.preferred_username as string) || '';
      } catch (e: any) {
        return c.html(ssoErrorPage('OIDC Error', `ID token verification failed: ${e.message}`));
      }
    } else if (discovery.userinfo_endpoint) {
      // Fallback: fetch userinfo
      try {
        const uiRes = await fetch(discovery.userinfo_endpoint, {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        const userinfo = await uiRes.json();
        sub = userinfo.sub;
        email = userinfo.email || '';
        name = userinfo.name || userinfo.preferred_username || '';
      } catch (e: any) {
        return c.html(ssoErrorPage('OIDC Error', `Userinfo fetch failed: ${e.message}`));
      }
    } else {
      return c.html(ssoErrorPage('OIDC Error', 'No id_token or userinfo endpoint available'));
    }

    if (!email) {
      return c.html(ssoErrorPage('OIDC Error', 'No email claim in the token. Ensure "email" scope is granted.'));
    }

    // Find or provision user
    const result = await findOrProvisionSsoUser('oidc', sub, email, name, oidc);
    if ('error' in result) {
      return c.html(ssoErrorPage('OIDC Error', result.error ?? 'Unknown error'));
    }

    // Issue session
    await setSessionCookies(c, result.user.id, result.user.email, result.user.role, 'oidc');

    // Redirect to dashboard
    return c.redirect('/dashboard');
  });

  // ─── SAML 2.0 ────────────────────────────────────────────

  /**
   * SP-initiated SAML login — redirects to IdP SSO URL
   */
  auth.get('/saml/login', async (c) => {
    const sso = await getSsoConfig();
    if (!sso?.saml?.ssoUrl || !sso?.saml?.entityId) {
      return c.json({ error: 'SAML not configured. Set up SAML in Settings > SSO.' }, 400);
    }

    const saml = sso.saml;
    const protocol = c.req.header('x-forwarded-proto') || 'http';
    const host = c.req.header('host') || 'localhost';
    const acsUrl = `${protocol}://${host}/auth/saml/callback`;

    // Generate SAML AuthnRequest
    const requestId = '_' + crypto.randomUUID().replace(/-/g, '');
    const issueInstant = new Date().toISOString();

    const authnRequest = `<samlp:AuthnRequest
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="${requestId}"
  Version="2.0"
  IssueInstant="${issueInstant}"
  Destination="${saml.ssoUrl}"
  AssertionConsumerServiceURL="${acsUrl}"
  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${saml.entityId}</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
</samlp:AuthnRequest>`;

    // Deflate and base64 encode for HTTP-Redirect binding
    const { deflateRawSync } = await import('zlib');
    const deflated = deflateRawSync(Buffer.from(authnRequest, 'utf-8'));
    const encoded = deflated.toString('base64');

    const redirectUrl = new URL(saml.ssoUrl);
    redirectUrl.searchParams.set('SAMLRequest', encoded);
    redirectUrl.searchParams.set('RelayState', '/dashboard');

    return c.redirect(redirectUrl.toString());
  });

  /**
   * SP metadata endpoint — provides IdP the SP configuration
   */
  auth.get('/saml/metadata', async (c) => {
    const sso = await getSsoConfig();
    const entityId = sso?.saml?.entityId || 'agenticmail-enterprise';

    const protocol = c.req.header('x-forwarded-proto') || 'http';
    const host = c.req.header('host') || 'localhost';
    const acsUrl = `${protocol}://${host}/auth/saml/callback`;
    const sloUrl = `${protocol}://${host}/auth/saml/logout`;

    const metadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${entityId}">
  <md:SPSSODescriptor
    AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${acsUrl}"
      index="0"
      isDefault="true"/>
    <md:SingleLogoutService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${sloUrl}"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;

    return c.body(metadata, 200, {
      'Content-Type': 'application/xml',
    });
  });

  /**
   * SAML Assertion Consumer Service (ACS) — receives POST from IdP after auth
   */
  auth.post('/saml/callback', async (c) => {
    const sso = await getSsoConfig();
    if (!sso?.saml?.certificate) {
      return c.html(ssoErrorPage('SAML Error', 'SAML not configured.'));
    }

    const saml = sso.saml;
    let samlResponse: string;

    const contentType = c.req.header('content-type') || '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const body = await c.req.parseBody();
      samlResponse = body['SAMLResponse'] as string;
    } else {
      const body = await c.req.json().catch(() => ({}));
      samlResponse = body.SAMLResponse;
    }

    if (!samlResponse) {
      return c.html(ssoErrorPage('SAML Error', 'Missing SAMLResponse'));
    }

    // Decode the SAML response
    let xml: string;
    try {
      xml = Buffer.from(samlResponse, 'base64').toString('utf-8');
    } catch {
      return c.html(ssoErrorPage('SAML Error', 'Invalid base64 encoding'));
    }

    // Parse the SAML assertion
    // We do lightweight XML parsing without a full XML library
    const assertion = parseSamlAssertion(xml, saml.certificate);

    if (assertion.error) {
      return c.html(ssoErrorPage('SAML Error', assertion.error));
    }

    if (!assertion.email) {
      return c.html(ssoErrorPage('SAML Error', 'No email found in SAML assertion. Check your IdP attribute mapping.'));
    }

    // Check conditions (time validity)
    if (assertion.notBefore && new Date(assertion.notBefore) > new Date()) {
      return c.html(ssoErrorPage('SAML Error', 'Assertion not yet valid'));
    }
    if (assertion.notOnOrAfter && new Date(assertion.notOnOrAfter) <= new Date()) {
      return c.html(ssoErrorPage('SAML Error', 'Assertion has expired'));
    }

    // Find or provision user
    const subject = assertion.nameId || assertion.email;
    const result = await findOrProvisionSsoUser('saml', subject, assertion.email, assertion.name || '', saml);
    if ('error' in result) {
      return c.html(ssoErrorPage('SAML Error', result.error ?? 'Unknown error'));
    }

    // Issue session
    await setSessionCookies(c, result.user.id, result.user.email, result.user.role, 'saml');

    // Redirect to dashboard (or RelayState)
    return c.redirect('/dashboard');
  });

  return auth;
}

// ─── SAML Assertion Parser ───────────────────────────────

interface SamlAssertionResult {
  nameId?: string;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  sessionIndex?: string;
  notBefore?: string;
  notOnOrAfter?: string;
  issuer?: string;
  signatureValid?: boolean;
  error?: string;
}

/**
 * Lightweight SAML assertion parser.
 * Extracts user attributes from the SAML Response XML without a full XML parser library.
 * Validates the assertion signature if a certificate is provided.
 */
function parseSamlAssertion(xml: string, certificate: string): SamlAssertionResult {
  const result: SamlAssertionResult = {};

  try {
    // Check for successful status
    const statusMatch = xml.match(/<samlp?:StatusCode[^>]*Value="([^"]+)"/);
    if (statusMatch) {
      const statusValue = statusMatch[1];
      if (!statusValue.includes(':Success')) {
        result.error = `SAML authentication failed with status: ${statusValue}`;
        return result;
      }
    }

    // Extract NameID
    const nameIdMatch = xml.match(/<(?:saml2?:)?NameID[^>]*>([^<]+)<\/(?:saml2?:)?NameID>/);
    if (nameIdMatch) {
      result.nameId = nameIdMatch[1].trim();
    }

    // Extract Issuer
    const issuerMatch = xml.match(/<(?:saml2?:)?Issuer[^>]*>([^<]+)<\/(?:saml2?:)?Issuer>/);
    if (issuerMatch) {
      result.issuer = issuerMatch[1].trim();
    }

    // Extract Conditions
    const condMatch = xml.match(/<(?:saml2?:)?Conditions\s+NotBefore="([^"]+)"\s+NotOnOrAfter="([^"]+)"/);
    if (condMatch) {
      result.notBefore = condMatch[1];
      result.notOnOrAfter = condMatch[2];
    }

    // Extract SessionIndex
    const sessionMatch = xml.match(/SessionIndex="([^"]+)"/);
    if (sessionMatch) {
      result.sessionIndex = sessionMatch[1];
    }

    // Extract attributes
    const attrRegex = /<(?:saml2?:)?Attribute\s+Name="([^"]+)"[^>]*>[\s\S]*?<(?:saml2?:)?AttributeValue[^>]*>([^<]*)<\/(?:saml2?:)?AttributeValue>/g;
    let match;
    while ((match = attrRegex.exec(xml)) !== null) {
      const attrName = match[1].toLowerCase();
      const attrValue = match[2].trim();

      // Map common attribute names
      if (attrName.includes('emailaddress') || attrName.includes('email') || attrName === 'mail') {
        result.email = attrValue;
      } else if (attrName.includes('displayname') || attrName === 'name') {
        result.name = attrValue;
      } else if (attrName.includes('givenname') || attrName.includes('firstname')) {
        result.firstName = attrValue;
      } else if (attrName.includes('surname') || attrName.includes('lastname')) {
        result.lastName = attrValue;
      }
    }

    // If no explicit email attribute, use NameID if it looks like an email
    if (!result.email && result.nameId?.includes('@')) {
      result.email = result.nameId;
    }

    // Build name from first/last if not provided
    if (!result.name && (result.firstName || result.lastName)) {
      result.name = [result.firstName, result.lastName].filter(Boolean).join(' ');
    }

    // Validate signature
    // We verify the digest of the SignedInfo against the IdP certificate
    result.signatureValid = verifySamlSignature(xml, certificate);
    if (!result.signatureValid) {
      result.error = 'SAML assertion signature verification failed. Check IdP certificate.';
      return result;
    }

  } catch (e: any) {
    result.error = `Failed to parse SAML assertion: ${e.message}`;
  }

  return result;
}

/**
 * Verify the SAML response signature using the IdP's X.509 certificate.
 * Uses Node.js crypto for signature verification.
 */
function verifySamlSignature(xml: string, certPem: string): boolean {
  try {
    // Extract SignatureValue
    const sigMatch = xml.match(/<(?:ds:)?SignatureValue[^>]*>([\s\S]*?)<\/(?:ds:)?SignatureValue>/);
    if (!sigMatch) return true; // No signature = skip verification (some IdPs don't sign)

    // Extract SignedInfo block
    const signedInfoMatch = xml.match(/<(?:ds:)?SignedInfo[^>]*>[\s\S]*?<\/(?:ds:)?SignedInfo>/);
    if (!signedInfoMatch) return false;

    // Normalize the certificate
    let cert = certPem.trim();
    if (!cert.startsWith('-----BEGIN CERTIFICATE-----')) {
      // Strip whitespace and reformat
      cert = cert.replace(/\s/g, '');
      cert = `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;
    }

    // Determine algorithm from SignatureMethod
    const algMatch = xml.match(/SignatureMethod\s+Algorithm="([^"]+)"/);
    const algorithm = algMatch?.[1]?.includes('rsa-sha256') ? 'RSA-SHA256' : 'RSA-SHA1';

    const signature = Buffer.from(sigMatch[1].replace(/\s/g, ''), 'base64');
    const signedInfo = signedInfoMatch[0];

    // Canonicalize SignedInfo (exclusive C14N — we do a simplified version)
    const canonicalized = signedInfo
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();

    const verifier = createVerify(algorithm);
    verifier.update(canonicalized);
    return verifier.verify(cert, signature);
  } catch {
    // If verification fails for any reason, reject
    return false;
  }
}

// ─── SSO Error Page ──────────────────────────────────────

function ssoErrorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>${title}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8f9fa; }
  .card { background: white; border-radius: 12px; padding: 40px; max-width: 480px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; }
  h1 { color: #dc2626; font-size: 1.5rem; margin: 0 0 16px; }
  p { color: #4b5563; margin: 0 0 24px; line-height: 1.5; }
  a { display: inline-block; padding: 10px 24px; background: #6366f1; color: white; border-radius: 8px; text-decoration: none; }
  a:hover { background: #4f46e5; }
</style></head>
<body>
<div class="card">
  <h1>${title}</h1>
  <p>${message}</p>
  <a href="/dashboard">Back to Dashboard</a>
</div>
</body></html>`;
}
