/**
 * OAuth Connect Routes
 *
 * Provides endpoints for initiating OAuth consent flows, handling callbacks,
 * checking connection status, and disconnecting OAuth-linked skills.
 *
 * Mounted at /oauth/* on the engine sub-app.
 */

import { Hono } from 'hono';
import type { SecureVault } from './vault.js';
import {
  OAUTH_PROVIDERS,
  pendingOAuthStates,
  generateOAuthState,
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
} from './oauth-connect.js';
import type { OAuthProviderDefinition, OAuthPendingState } from './oauth-connect.js';

// ─── Skill-to-Provider Mapping (auto-generated from integration catalog) ──

import { INTEGRATION_CATALOG } from '../mcp/integration-catalog.js';

/**
 * Maps skillId → OAuth provider key. Built from catalog's oauthProvider field.
 * Skills without oauthProvider return undefined (use token auth).
 */
const SKILL_PROVIDER_MAP: Record<string, string | null> = Object.fromEntries(
  INTEGRATION_CATALOG
    .filter(e => e.authType === 'oauth2' && e.oauthProvider)
    .map(e => [e.skillId, e.oauthProvider!])
);

// ─── Helper: find vault entry by name ───────────────────

async function findVaultEntryByName(
  vault: SecureVault,
  orgId: string,
  name: string,
): Promise<{ id: string; decrypted: string } | null> {
  const entries = await vault.getSecretsByOrg(orgId);
  const match = entries.find((e) => e.name === name);
  if (!match) return null;
  const result = await vault.getSecret(match.id);
  if (!result) return null;
  return { id: match.id, decrypted: result.decrypted };
}

// ─── Route Factory ──────────────────────────────────────

export function createOAuthConnectRoutes(vault: SecureVault, lifecycle?: any) {
  const router = new Hono();

  // ─── GET /authorize/:skillId — Start OAuth flow ─────

  router.get('/authorize/:skillId', async (c) => {
    try {
      const skillId = c.req.param('skillId');
      const orgId = c.req.query('orgId') || 'default';
      // Build absolute redirect URI from request origin (supports any deployment subdomain)
      const reqUrl = new URL(c.req.url, `${c.req.header('x-forwarded-proto') || 'https'}://${c.req.header('host') || 'localhost'}`);
      const defaultRedirect = `${reqUrl.origin}/api/engine/oauth/callback`;
      const redirectUri = c.req.query('redirectUri') || defaultRedirect;

      // Resolve provider
      const providerKey = SKILL_PROVIDER_MAP[skillId];
      if (providerKey === undefined || providerKey === null) {
        // Skill doesn't use OAuth — instruct client to use token-based auth (POST /authorize/:skillId)
        return c.json({
          error: `Skill "${skillId}" uses API key authentication, not OAuth. Use the token input to save your API key.`,
          authType: 'token',
          skillId,
        }, 200);
      }

      const provider: OAuthProviderDefinition | undefined =
        OAUTH_PROVIDERS[providerKey];
      if (!provider) {
        return c.json({ error: `OAuth provider "${providerKey}" is not registered` }, 500);
      }

      // Load client_id from vault
      const clientIdEntry = await findVaultEntryByName(
        vault,
        orgId,
        `oauth_provider:${providerKey}:client_id`,
      );
      if (!clientIdEntry) {
        return c.json(
          {
            error: `No client_id configured for provider "${providerKey}". ` +
              `Store it in the vault as "oauth_provider:${providerKey}:client_id".`,
          },
          400,
        );
      }

      // Generate state & optional PKCE
      const state = generateOAuthState();
      let codeVerifier: string | undefined;
      let codeChallenge: string | undefined;

      if (provider.supportsPkce) {
        codeVerifier = generateCodeVerifier();
        codeChallenge = await generateCodeChallenge(codeVerifier);
      }

      // Store pending state
      const pending: OAuthPendingState = {
        skillId,
        orgId,
        provider: providerKey,
        codeVerifier,
        redirectUri,
        createdAt: Date.now(),
      };
      pendingOAuthStates.set(state, pending);

      // Build authorization URL
      const authUrl = buildAuthorizationUrl(provider, {
        clientId: clientIdEntry.decrypted,
        redirectUri,
        state,
        codeChallenge,
      });

      return c.json({ authUrl, state, provider: providerKey });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── POST /authorize/:skillId — Save API key/token or multi-field credentials ─────

  router.post('/authorize/:skillId', async (c) => {
    try {
      const skillId = c.req.param('skillId');
      const orgId = c.req.query('orgId') || 'default';
      const body = await c.req.json();

      // Multi-field credentials: { credentials: { fieldName: value, ... } }
      if (body.credentials && typeof body.credentials === 'object') {
        const creds = body.credentials as Record<string, string>;
        const entries = Object.entries(creds).filter(([, v]) => typeof v === 'string' && v.trim());
        if (entries.length === 0) {
          return c.json({ error: 'At least one credential field is required' }, 400);
        }
        // Store each field separately: skill:{skillId}:{fieldName}
        for (const [field, value] of entries) {
          await vault.storeSecret(
            orgId,
            `skill:${skillId}:${field}`,
            'skill_credential',
            value.trim(),
            { provider: 'credentials', field, manualEntry: true },
            'dashboard',
          );
        }
        return c.json({ success: true, skillId, connected: true, fields: entries.length });
      }

      // Single token: { token: "..." }
      const { token } = body;
      if (!token || typeof token !== 'string' || !token.trim()) {
        return c.json({ error: 'A non-empty token value is required' }, 400);
      }

      // Store as access_token in vault (same format as OAuth tokens)
      await vault.storeSecret(
        orgId,
        `skill:${skillId}:access_token`,
        'skill_credential',
        token.trim(),
        { provider: 'api_key', manualEntry: true },
        'dashboard',
      );

      return c.json({ success: true, skillId, connected: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── GET /callback — Handle OAuth redirect ───────────

  router.get('/callback', async (c) => {
    try {
      const code = c.req.query('code');
      const state = c.req.query('state');
      const error = c.req.query('error');
      const errorDescription = c.req.query('error_description');

      // Handle provider-side errors
      if (error) {
        const message = errorDescription || error;
        return c.html(oauthResultPage(false, message));
      }

      if (!code || !state) {
        return c.html(oauthResultPage(false, 'Missing code or state parameter'));
      }

      // Validate state — check skill OAuth states first, then agent email OAuth
      const pending = pendingOAuthStates.get(state);
      if (!pending) {
        // Check if state is an agent ID (agent email OAuth flow)
        if (lifecycle) {
          const managed = lifecycle.getAgent(state);
          console.log(`[OAuth callback] state=${state}, lifecycle exists=${!!lifecycle}, agent found=${!!managed}, emailStatus=${managed?.config?.emailConfig?.status}`);
          if (managed?.config?.emailConfig?.status === 'awaiting_oauth' || managed?.config?.emailConfig?.status === 'connected') {
            return await handleAgentEmailOAuthCallback(c, state, code, managed, lifecycle);
          }
        } else {
          console.log(`[OAuth callback] state=${state}, lifecycle is null/undefined`);
        }
        return c.html(oauthResultPage(false, 'Invalid or expired OAuth state'));
      }

      // Clean up state immediately
      pendingOAuthStates.delete(state);

      const provider = OAUTH_PROVIDERS[pending.provider];
      if (!provider) {
        return c.html(oauthResultPage(false, `Unknown provider: ${pending.provider}`));
      }

      // Load client_id and client_secret from vault
      const clientIdEntry = await findVaultEntryByName(
        vault,
        pending.orgId,
        `oauth_provider:${pending.provider}:client_id`,
      );
      const clientSecretEntry = await findVaultEntryByName(
        vault,
        pending.orgId,
        `oauth_provider:${pending.provider}:client_secret`,
      );

      if (!clientIdEntry || !clientSecretEntry) {
        return c.html(
          oauthResultPage(false, `Missing OAuth credentials for provider "${pending.provider}"`),
        );
      }

      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(provider, {
        code,
        clientId: clientIdEntry.decrypted,
        clientSecret: clientSecretEntry.decrypted,
        redirectUri: pending.redirectUri,
        codeVerifier: pending.codeVerifier,
      });

      // Calculate expiration
      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : undefined;

      // Store access_token in vault
      await vault.storeSecret(
        pending.orgId,
        `skill:${pending.skillId}:access_token`,
        'skill_credential',
        tokens.access_token,
        { expiresAt, provider: pending.provider },
        'oauth-connect',
      );

      // Store refresh_token if present
      if (tokens.refresh_token) {
        await vault.storeSecret(
          pending.orgId,
          `skill:${pending.skillId}:refresh_token`,
          'skill_credential',
          tokens.refresh_token,
          { provider: pending.provider },
          'oauth-connect',
        );
      }

      return c.html(oauthResultPage(true, `Connected to ${provider.name} successfully`));
    } catch (e: any) {
      return c.html(oauthResultPage(false, e.message || 'Unknown error'));
    }
  });

  // ─── POST /app-config/:provider — Save OAuth app credentials (Client ID + Secret) ──

  router.post('/app-config/:provider', async (c) => {
    try {
      const provider = c.req.param('provider');
      const orgId = c.req.query('orgId') || 'default';
      const { clientId, clientSecret } = await c.req.json();

      if (!clientId?.trim() || !clientSecret?.trim()) {
        return c.json({ error: 'Both Client ID and Client Secret are required' }, 400);
      }

      // Store Client ID
      await vault.storeSecret(
        orgId,
        `oauth_provider:${provider}:client_id`,
        'oauth_app',
        clientId.trim(),
        { provider, manualEntry: true },
        'dashboard',
      );

      // Store Client Secret
      await vault.storeSecret(
        orgId,
        `oauth_provider:${provider}:client_secret`,
        'oauth_app',
        clientSecret.trim(),
        { provider, manualEntry: true },
        'dashboard',
      );

      return c.json({ success: true, provider, configured: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── GET /app-config/:provider — Check if OAuth app is configured ──

  router.get('/app-config/:provider', async (c) => {
    try {
      const provider = c.req.param('provider');
      const orgId = c.req.query('orgId') || 'default';

      const clientIdEntry = await findVaultEntryByName(vault, orgId, `oauth_provider:${provider}:client_id`);
      const clientSecretEntry = await findVaultEntryByName(vault, orgId, `oauth_provider:${provider}:client_secret`);

      return c.json({
        configured: !!(clientIdEntry && clientSecretEntry),
        provider,
        hasClientId: !!clientIdEntry,
        hasClientSecret: !!clientSecretEntry,
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── DELETE /app-config/:provider — Remove OAuth app credentials ──

  router.delete('/app-config/:provider', async (c) => {
    try {
      const provider = c.req.param('provider');
      const orgId = c.req.query('orgId') || 'default';

      const entries = await vault.getSecretsByOrg(orgId, 'oauth_app');
      const toDelete = entries.filter((e: any) => e.name.startsWith(`oauth_provider:${provider}:`));
      for (const e of toDelete) {
        await vault.deleteSecret(e.id);
      }

      return c.json({ success: true, removed: toDelete.length });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── GET /status/:skillId — Check connection status ──

  router.get('/status/:skillId', async (c) => {
    try {
      const skillId = c.req.param('skillId');
      const orgId = c.req.query('orgId') || 'default';

      const tokenName = `skill:${skillId}:access_token`;
      const entries = await vault.getSecretsByOrg(orgId, 'skill_credential');
      const match = entries.find((e) => e.name === tokenName);

      if (!match) {
        return c.json({ connected: false });
      }

      const providerKey = SKILL_PROVIDER_MAP[skillId] || undefined;

      return c.json({
        connected: true,
        provider: providerKey,
        expiresAt: match.metadata?.expiresAt || undefined,
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── DELETE /disconnect/:skillId — Remove tokens ─────

  router.delete('/disconnect/:skillId', async (c) => {
    try {
      const skillId = c.req.param('skillId');
      const orgId = c.req.query('orgId') || 'default';

      const entries = await vault.getSecretsByOrg(orgId, 'skill_credential');

      const accessTokenEntry = entries.find(
        (e) => e.name === `skill:${skillId}:access_token`,
      );
      const refreshTokenEntry = entries.find(
        (e) => e.name === `skill:${skillId}:refresh_token`,
      );

      if (accessTokenEntry) {
        await vault.deleteSecret(accessTokenEntry.id);
      }
      if (refreshTokenEntry) {
        await vault.deleteSecret(refreshTokenEntry.id);
      }

      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── GET /providers — List available providers ───────

  router.get('/providers', (c) => {
    const providers = Object.values(OAUTH_PROVIDERS).map((p) => ({
      id: p.id,
      name: p.name,
    }));
    return c.json({ providers });
  });

  return router;
}

// ─── Agent Email OAuth Callback Handler ─────────────────

async function handleAgentEmailOAuthCallback(c: any, agentId: string, code: string, managed: any, lifecycle: any) {
  const emailConfig = managed.config.emailConfig;
  try {
    if (emailConfig.oauthProvider === 'microsoft') {
      const tokenRes = await fetch(`https://login.microsoftonline.com/${emailConfig.oauthTenantId || 'common'}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: emailConfig.oauthClientId,
          client_secret: emailConfig.oauthClientSecret,
          code,
          redirect_uri: emailConfig.oauthRedirectUri,
          grant_type: 'authorization_code',
          scope: emailConfig.oauthScopes.join(' '),
        }),
      });
      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        return c.html(oauthResultPage(false, `Microsoft token exchange failed: ${errText}`));
      }
      const tokens = await tokenRes.json() as any;
      emailConfig.oauthAccessToken = tokens.access_token;
      if (tokens.refresh_token) {
        emailConfig.oauthRefreshToken = tokens.refresh_token;
      }
      emailConfig.oauthTokenExpiry = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

      // Get user email from Graph
      try {
        const profileRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,displayName', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (profileRes.ok) {
          const profile = await profileRes.json() as any;
          if (profile.mail) emailConfig.email = profile.mail;
        }
      } catch {}

    } else if (emailConfig.oauthProvider === 'google') {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: emailConfig.oauthClientId,
          client_secret: emailConfig.oauthClientSecret,
          code,
          redirect_uri: emailConfig.oauthRedirectUri,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        return c.html(oauthResultPage(false, `Google token exchange failed: ${errText}`));
      }
      const tokens = await tokenRes.json() as any;
      emailConfig.oauthAccessToken = tokens.access_token;
      // Only overwrite refresh_token if Google returned one (re-auth may not include it)
      if (tokens.refresh_token) {
        emailConfig.oauthRefreshToken = tokens.refresh_token;
      }
      emailConfig.oauthTokenExpiry = tokens.expires_in
        ? new Date(Date.now() + (tokens.expires_in * 1000)).toISOString()
        : undefined;

      // Get user email from Google
      try {
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (profileRes.ok) {
          const profile = await profileRes.json() as any;
          if (profile.email) emailConfig.email = profile.email;
        }
      } catch {}

    } else {
      return c.html(oauthResultPage(false, `Unknown OAuth provider: ${emailConfig.oauthProvider}`));
    }

    emailConfig.status = 'connected';
    emailConfig.configured = true;
    delete emailConfig.oauthAuthUrl;
    managed.config.emailConfig = emailConfig;
    managed.updatedAt = new Date().toISOString();
    await lifecycle.saveAgent(agentId);

    return c.html(oauthResultPage(true, `Email connected via ${emailConfig.oauthProvider === 'google' ? 'Google' : 'Microsoft'} OAuth`));
  } catch (e: any) {
    return c.html(oauthResultPage(false, e.message || 'OAuth token exchange failed'));
  }
}

// ─── HTML Callback Page ─────────────────────────────────

/**
 * Returns a minimal HTML page that posts a message to the parent window
 * (for popup-based flows) and then closes itself. If the window was not
 * opened as a popup it falls back to showing a status message.
 */
function oauthResultPage(success: boolean, message: string): string {
  const status = success ? 'success' : 'error';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>OAuth ${success ? 'Connected' : 'Error'}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb; }
    .card { text-align: center; padding: 2rem; border-radius: 8px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 400px; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    .message { color: #374151; margin-top: 0.5rem; }
    .status-success .icon { color: #10b981; }
    .status-error .icon { color: #ef4444; }
  </style>
</head>
<body>
  <div class="card status-${status}">
    <div class="icon">${success ? '&#10003;' : '&#10007;'}</div>
    <h2>${success ? 'Connected!' : 'Connection Failed'}</h2>
    <p class="message">${escapeHtml(message)}</p>
    <p style="color:#9ca3af;font-size:0.875rem;margin-top:1rem;">This window will close automatically.</p>
  </div>
  <script>
    (function() {
      var result = { type: 'oauth-result', status: '${status}', message: ${JSON.stringify(message)} };
      if (window.opener) {
        window.opener.postMessage(result, '*');
        setTimeout(function() { window.close(); }, 1500);
      } else if (window.parent !== window) {
        window.parent.postMessage(result, '*');
      }
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
