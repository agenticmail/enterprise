/**
 * Organization Integration Routes
 * 
 * CRUD endpoints for managing per-org integrations (Google, Microsoft, SMTP, custom).
 * Mounted at /org-integrations/* on the engine sub-app.
 */

import { Hono } from 'hono';
import type { OrgIntegrationManager } from './org-integrations.js';

// Providers that support OAuth connect flow
const OAUTH_PROVIDERS: Record<string, { authUrl: string; tokenUrl: string; defaultScopes: string }> = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    defaultScopes: 'openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/chat.messages',
  },
  microsoft: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    defaultScopes: 'openid email profile offline_access Mail.ReadWrite Mail.Send Calendars.ReadWrite Files.ReadWrite.All Contacts.Read Chat.ReadWrite',
  },
};

export function createOrgIntegrationRoutes(manager: OrgIntegrationManager) {
  const router = new Hono();

  // ─── List integrations for an org ─────────────────────
  router.get('/', async (c) => {
    const orgId = c.req.query('orgId');
    if (!orgId) return c.json({ error: 'orgId is required' }, 400);
    try {
      const integrations = await manager.listByOrg(orgId);
      // Strip sensitive credential refs from response
      const safe = integrations.map(i => ({
        ...i,
        config: sanitizeConfig(i.config),
      }));
      return c.json({ integrations: safe });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── Get single integration ───────────────────────────
  router.get('/:id', async (c) => {
    try {
      const integration = await manager.getById(c.req.param('id'));
      if (!integration) return c.json({ error: 'Integration not found' }, 404);
      return c.json({ integration: { ...integration, config: sanitizeConfig(integration.config) } });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── Create integration ───────────────────────────────
  router.post('/', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.orgId) return c.json({ error: 'orgId is required' }, 400);
      if (!body.provider) return c.json({ error: 'provider is required' }, 400);
      
      // Validate provider
      const validProviders = ['google', 'microsoft', 'smtp', 'imap', 'custom'];
      const isLlmProvider = body.provider?.startsWith('llm_');
      if (!validProviders.includes(body.provider) && !isLlmProvider) {
        return c.json({ error: `Invalid provider. Must be one of: ${validProviders.join(', ')} or llm_<provider>` }, 400);
      }

      // Merge credentials into config for vault encryption
      const mergedConfig = { ...(body.config || {}), ...(body.credentials || {}) };

      const integration = await manager.create(body.orgId, {
        provider: body.provider,
        providerType: body.providerType || (isLlmProvider ? 'api_key' : body.provider === 'smtp' ? 'smtp' : 'oauth2'),
        displayName: body.displayName || body.provider,
        config: mergedConfig,
        scopes: body.scopes || OAUTH_PROVIDERS[body.provider]?.defaultScopes || '',
        domain: body.domain,
        isDefault: body.isDefault ?? true,
        metadata: body.metadata || {},
      }, body.createdBy);

      // Push credentials to all running agents in this org
      const pushResult = await manager.pushCredentialsToOrgAgents(body.orgId).catch(() => ({ updated: [] }));

      return c.json({ integration: { ...integration, config: sanitizeConfig(integration.config) }, agentsUpdated: pushResult.updated.length }, 201);
    } catch (e: any) {
      if (e.message?.includes('UNIQUE constraint') || e.message?.includes('duplicate key')) {
        return c.json({ error: 'Integration already exists for this org/provider/domain combination' }, 409);
      }
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── Update integration ───────────────────────────────
  router.put('/:id', async (c) => {
    try {
      const body = await c.req.json();
      const updated = await manager.update(c.req.param('id'), {
        displayName: body.displayName,
        config: body.config,
        scopes: body.scopes,
        domain: body.domain,
        status: body.status,
        isDefault: body.isDefault,
        metadata: body.metadata,
      });
      if (!updated) return c.json({ error: 'Integration not found' }, 404);

      // Push updated credentials to all running agents in this org
      const pushResult = await manager.pushCredentialsToOrgAgents(updated.orgId).catch(() => ({ updated: [] }));

      return c.json({ integration: { ...updated, config: sanitizeConfig(updated.config) }, agentsUpdated: pushResult.updated.length });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── Delete integration ───────────────────────────────
  router.delete('/:id', async (c) => {
    try {
      const deleted = await manager.delete(c.req.param('id'));
      if (!deleted) return c.json({ error: 'Integration not found' }, 404);
      return c.json({ ok: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── Test connection ──────────────────────────────────
  router.post('/:id/test', async (c) => {
    try {
      const integration = await manager.getById(c.req.param('id'));
      if (!integration) return c.json({ error: 'Integration not found' }, 404);

      if (integration.provider === 'google') {
        // Test Google OAuth by getting user info
        const creds = await (manager as any).decryptCredentials(integration);
        if (!creds.accessToken && !creds.refreshToken) {
          return c.json({ success: false, error: 'No OAuth tokens configured' });
        }
        // Try to get user info
        let token = creds.accessToken;
        if (!token && creds.refreshToken) {
          const refreshed = await (manager as any).refreshOAuthToken(creds, 'google');
          token = refreshed.accessToken;
        }
        const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const info = await res.json() as any;
          return c.json({ success: true, email: info.email, name: info.name });
        }
        return c.json({ success: false, error: `Google API returned ${res.status}` });
      }

      if (integration.provider === 'microsoft') {
        const creds = await (manager as any).decryptCredentials(integration);
        if (!creds.accessToken && !creds.refreshToken) {
          return c.json({ success: false, error: 'No OAuth tokens configured' });
        }
        let token = creds.accessToken;
        if (!token && creds.refreshToken) {
          const refreshed = await (manager as any).refreshOAuthToken(creds, 'microsoft');
          token = refreshed.accessToken;
        }
        const res = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const info = await res.json() as any;
          return c.json({ success: true, email: info.mail || info.userPrincipalName, name: info.displayName });
        }
        return c.json({ success: false, error: `Microsoft Graph returned ${res.status}` });
      }

      return c.json({ success: true, message: 'Connection type does not support test' });
    } catch (e: any) {
      return c.json({ success: false, error: e.message });
    }
  });

  // ─── Resolve credentials for an agent ─────────────────
  router.get('/resolve/:agentId', async (c) => {
    try {
      const agentId = c.req.param('agentId');
      const provider = c.req.query('provider') || 'google';
      const orgId = c.req.query('orgId') || null;
      
      const creds = await manager.resolveForAgent(orgId, provider);
      if (!creds) return c.json({ resolved: false });
      
      return c.json({
        resolved: true,
        provider: creds.provider,
        email: creds.email,
        hasAccessToken: !!creds.accessToken,
        hasRefreshToken: !!creds.refreshToken,
        integrationId: creds._integrationId,
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── OAuth flow: initiate ─────────────────────────────
  router.post('/oauth/authorize', async (c) => {
    try {
      const { orgId, provider, clientId, clientSecret, scopes, redirectUri, tenantId } = await c.req.json();
      if (!orgId || !provider) return c.json({ error: 'orgId and provider required' }, 400);
      
      const oauthDef = OAUTH_PROVIDERS[provider];
      if (!oauthDef) return c.json({ error: `OAuth not supported for provider: ${provider}` }, 400);

      // Generate state token
      const state = crypto.randomUUID();
      const finalScopes = scopes || oauthDef.defaultScopes;
      const finalRedirect = redirectUri || `${c.req.url.replace(/\/org-integrations.*/, '/org-integrations/oauth/callback')}`;

      // Store pending state (in-memory, expires in 10 min)
      pendingOAuthStates.set(state, {
        orgId, provider, clientId, clientSecret, scopes: finalScopes,
        redirectUri: finalRedirect, tenantId,
        expiresAt: Date.now() + 600000,
      });

      // Build auth URL
      let authUrl = oauthDef.authUrl;
      if (provider === 'microsoft' && tenantId) {
        authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
      }

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: finalRedirect,
        response_type: 'code',
        scope: finalScopes,
        state,
        access_type: 'offline',
        prompt: 'consent',
      });

      return c.json({ authUrl: `${authUrl}?${params}` });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── OAuth flow: callback ─────────────────────────────
  router.get('/oauth/callback', async (c) => {
    try {
      const code = c.req.query('code');
      const state = c.req.query('state');
      const error = c.req.query('error');

      if (error) {
        return c.html(`<script>window.opener?.postMessage({type:'org-oauth-result',status:'error',message:'${error}'},'*');window.close();</script>`);
      }

      if (!state || !pendingOAuthStates.has(state)) {
        return c.html(`<script>window.opener?.postMessage({type:'org-oauth-result',status:'error',message:'Invalid state'},'*');window.close();</script>`);
      }

      const pending = pendingOAuthStates.get(state)!;
      pendingOAuthStates.delete(state);

      if (pending.expiresAt < Date.now()) {
        return c.html(`<script>window.opener?.postMessage({type:'org-oauth-result',status:'error',message:'State expired'},'*');window.close();</script>`);
      }

      // Exchange code for tokens
      const tokenUrl = pending.provider === 'microsoft'
        ? `https://login.microsoftonline.com/${pending.tenantId || 'common'}/oauth2/v2.0/token`
        : 'https://oauth2.googleapis.com/token';

      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code!,
          redirect_uri: pending.redirectUri,
          client_id: pending.clientId,
          client_secret: pending.clientSecret,
        }).toString(),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return c.html(`<script>window.opener?.postMessage({type:'org-oauth-result',status:'error',message:'Token exchange failed: ${tokenRes.status}'},'*');window.close();</script>`);
      }

      const tokens = await tokenRes.json() as any;

      // Get user email
      let email = '';
      try {
        if (pending.provider === 'google') {
          const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (infoRes.ok) {
            const info = await infoRes.json() as any;
            email = info.email;
          }
        } else if (pending.provider === 'microsoft') {
          const infoRes = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (infoRes.ok) {
            const info = await infoRes.json() as any;
            email = info.mail || info.userPrincipalName;
          }
        }
      } catch { /* ok */ }

      // Create or update org integration
      const existing = await manager.getByOrgAndProvider(pending.orgId, pending.provider);
      const tokenExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
      
      if (existing) {
        await manager.update(existing.id, {
          config: {
            clientId: pending.clientId,
            clientSecret: pending.clientSecret,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || undefined,
            tokenExpiry,
            email: email || existing.config.email,
            tenantId: pending.tenantId,
          },
          scopes: pending.scopes,
          status: 'active',
        });
      } else {
        await manager.create(pending.orgId, {
          provider: pending.provider,
          providerType: 'oauth2',
          displayName: `${pending.provider === 'google' ? 'Google Workspace' : 'Microsoft 365'} (${email || pending.orgId})`,
          config: {
            clientId: pending.clientId,
            clientSecret: pending.clientSecret,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            tokenExpiry,
            email,
            tenantId: pending.tenantId,
          },
          scopes: pending.scopes,
          isDefault: true,
        });
      }

      // Push credentials to all running agents in this org immediately
      await manager.pushCredentialsToOrgAgents(pending.orgId).catch(() => {});

      return c.html(`<script>window.opener?.postMessage({type:'org-oauth-result',status:'success',email:'${email}',provider:'${pending.provider}'},'*');window.close();</script>`);
    } catch (e: any) {
      return c.html(`<script>window.opener?.postMessage({type:'org-oauth-result',status:'error',message:'${e.message}'},'*');window.close();</script>`);
    }
  });

  return router;
}

// In-memory pending OAuth states
const pendingOAuthStates = new Map<string, {
  orgId: string;
  provider: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  redirectUri: string;
  tenantId?: string;
  expiresAt: number;
}>();

// Strip sensitive fields from config before sending to client
function sanitizeConfig(config: any): any {
  if (!config) return {};
  const safe = { ...config };
  delete safe.clientSecret;
  delete safe.accessToken;
  delete safe.refreshToken;
  delete safe.serviceAccountKey;
  delete safe.smtpPass;
  delete safe.imapPass;
  delete safe.apiKey;
  // Indicate presence without exposing values
  if (config.clientSecret) safe._hasClientSecret = true;
  if (config.accessToken) safe._hasAccessToken = true;
  if (config.refreshToken) safe._hasRefreshToken = true;
  if (config.smtpPass) safe._hasSmtpPass = true;
  if (config.imapPass) safe._hasImapPass = true;
  if (config.apiKey) safe._hasApiKey = true;
  return safe;
}
