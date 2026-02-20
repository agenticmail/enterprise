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

// ─── Skill-to-Provider Mapping ──────────────────────────

/**
 * Maps skillId identifiers to their underlying OAuth provider key.
 * Skills that do not use OAuth (e.g. bot-token or API-key auth) are
 * mapped to `null` and skipped during the authorize flow.
 */
const SKILL_PROVIDER_MAP: Record<string, string | null> = {
  'slack-notifications': 'slack',
  'github-repos': 'github',
  'jira-project-management': 'atlassian',
  'notion': 'notion',
  'google-drive': 'google',
  'google-analytics': 'google',
  'google-ads': 'google',
  'discord-communication': null,        // uses bot token, not OAuth
  'salesforce-crm': 'salesforce',
  'linear-issues': null,                // uses API key
  'microsoft-teams': 'microsoft',
  'hubspot-crm': 'hubspot',
  'zoom-meetings': 'zoom',
  'dropbox-storage': 'dropbox',
  'figma-design': 'figma',
  'canva-design': 'canva',
  'docusign-esign': 'docusign',
  'asana-tasks': 'asana',
  'confluence-wiki': 'atlassian',
  'airtable-databases': null,           // uses API key / PAT
  'todoist-tasks': null,                // uses API key
};

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

export function createOAuthConnectRoutes(vault: SecureVault) {
  const router = new Hono();

  // ─── GET /authorize/:skillId — Start OAuth flow ─────

  router.get('/authorize/:skillId', async (c) => {
    try {
      const skillId = c.req.param('skillId');
      const orgId = c.req.query('orgId') || 'default';
      const redirectUri =
        c.req.query('redirectUri') || '/api/engine/oauth/callback';

      // Resolve provider
      const providerKey = SKILL_PROVIDER_MAP[skillId];
      if (providerKey === undefined) {
        return c.json({ error: `Unknown skill: ${skillId}` }, 404);
      }
      if (providerKey === null) {
        return c.json(
          { error: `Skill "${skillId}" does not use OAuth. Configure it with an API key or bot token instead.` },
          400,
        );
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

      // Validate state
      const pending = pendingOAuthStates.get(state);
      if (!pending) {
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
