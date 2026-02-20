/**
 * OAuth Provider Registry & Consent Flow State Management
 *
 * Defines OAuth provider configurations for major SaaS platforms,
 * manages pending authorization states, and provides helpers for
 * the full OAuth 2.0 authorization code flow (including PKCE).
 */

import { randomBytes, createHash } from 'crypto';

// ─── Types ──────────────────────────────────────────────

export interface OAuthProviderDefinition {
  id: string;
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  defaultScopes: string[];
  supportsPkce: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

export interface OAuthPendingState {
  skillId: string;
  orgId: string;
  provider: string;
  codeVerifier?: string;
  redirectUri: string;
  createdAt: number;
}

// ─── Provider Registry ──────────────────────────────────

export const OAUTH_PROVIDERS: Record<string, OAuthProviderDefinition> = {
  google: {
    id: 'google',
    name: 'Google',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    defaultScopes: ['openid', 'email', 'profile'],
    supportsPkce: true,
  },
  slack: {
    id: 'slack',
    name: 'Slack',
    authorizationUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    revokeUrl: 'https://slack.com/api/auth.revoke',
    defaultScopes: ['channels:read', 'chat:write', 'users:read'],
    supportsPkce: false,
  },
  microsoft: {
    id: 'microsoft',
    name: 'Microsoft',
    authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    revokeUrl: undefined,
    defaultScopes: ['openid', 'email', 'profile', 'offline_access'],
    supportsPkce: true,
  },
  notion: {
    id: 'notion',
    name: 'Notion',
    authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    revokeUrl: undefined,
    defaultScopes: [],
    supportsPkce: false,
  },
  salesforce: {
    id: 'salesforce',
    name: 'Salesforce',
    authorizationUrl: 'https://login.salesforce.com/services/oauth2/authorize',
    tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
    revokeUrl: 'https://login.salesforce.com/services/oauth2/revoke',
    defaultScopes: ['api', 'refresh_token', 'id'],
    supportsPkce: true,
  },
  hubspot: {
    id: 'hubspot',
    name: 'HubSpot',
    authorizationUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    revokeUrl: undefined,
    defaultScopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'],
    supportsPkce: false,
  },
  zoom: {
    id: 'zoom',
    name: 'Zoom',
    authorizationUrl: 'https://zoom.us/oauth/authorize',
    tokenUrl: 'https://zoom.us/oauth/token',
    revokeUrl: 'https://zoom.us/oauth/revoke',
    defaultScopes: ['meeting:read', 'meeting:write', 'user:read'],
    supportsPkce: false,
  },
  dropbox: {
    id: 'dropbox',
    name: 'Dropbox',
    authorizationUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    revokeUrl: 'https://api.dropboxapi.com/2/auth/token/revoke',
    defaultScopes: ['files.content.read', 'files.content.write'],
    supportsPkce: true,
  },
  figma: {
    id: 'figma',
    name: 'Figma',
    authorizationUrl: 'https://www.figma.com/oauth',
    tokenUrl: 'https://www.figma.com/api/oauth/token',
    revokeUrl: undefined,
    defaultScopes: ['file_read'],
    supportsPkce: false,
  },
  canva: {
    id: 'canva',
    name: 'Canva',
    authorizationUrl: 'https://www.canva.com/api/oauth/authorize',
    tokenUrl: 'https://api.canva.com/rest/v1/oauth/token',
    revokeUrl: 'https://api.canva.com/rest/v1/oauth/revoke',
    defaultScopes: ['design:content:read', 'design:content:write'],
    supportsPkce: true,
  },
  docusign: {
    id: 'docusign',
    name: 'DocuSign',
    authorizationUrl: 'https://account.docusign.com/oauth/auth',
    tokenUrl: 'https://account.docusign.com/oauth/token',
    revokeUrl: 'https://account.docusign.com/oauth/revoke',
    defaultScopes: ['signature', 'extended'],
    supportsPkce: true,
  },
  asana: {
    id: 'asana',
    name: 'Asana',
    authorizationUrl: 'https://app.asana.com/-/oauth_authorize',
    tokenUrl: 'https://app.asana.com/-/oauth_token',
    revokeUrl: undefined,
    defaultScopes: ['default'],
    supportsPkce: false,
  },
  atlassian: {
    id: 'atlassian',
    name: 'Atlassian',
    authorizationUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    revokeUrl: undefined,
    defaultScopes: ['read:jira-work', 'write:jira-work', 'read:confluence-content.all'],
    supportsPkce: true,
  },
  github: {
    id: 'github',
    name: 'GitHub',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    revokeUrl: undefined,
    defaultScopes: ['repo', 'read:user', 'read:org'],
    supportsPkce: false,
  },
};

// ─── Pending State Management ───────────────────────────

export const pendingOAuthStates = new Map<string, OAuthPendingState>();

/**
 * Periodically clean up expired pending states (older than 10 minutes).
 * The timer is unref'd so it does not prevent Node.js from exiting.
 */
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, state] of pendingOAuthStates) {
    if (now - state.createdAt > STATE_TTL_MS) {
      pendingOAuthStates.delete(key);
    }
  }
}, 60_000); // check every minute

cleanupInterval.unref();

// ─── Helper Functions ───────────────────────────────────

/**
 * Generate a cryptographically random state parameter (32 bytes, hex-encoded).
 */
export function generateOAuthState(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Generate a PKCE code verifier (32 random bytes, base64url-encoded).
 */
export function generateCodeVerifier(): string {
  return randomBytes(32)
    .toString('base64url');
}

/**
 * Generate a PKCE code challenge from a code verifier (SHA-256, base64url).
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

/**
 * Build the full authorization URL for a given provider.
 */
export function buildAuthorizationUrl(
  provider: OAuthProviderDefinition,
  params: {
    clientId: string;
    redirectUri: string;
    state: string;
    scopes?: string[];
    codeChallenge?: string;
  },
): string {
  const url = new URL(provider.authorizationUrl);

  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);

  const scopes = params.scopes && params.scopes.length > 0
    ? params.scopes
    : provider.defaultScopes;

  if (scopes.length > 0) {
    url.searchParams.set('scope', scopes.join(' '));
  }

  if (params.codeChallenge && provider.supportsPkce) {
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }

  return url.toString();
}

/**
 * Exchange an authorization code for tokens by POSTing to the provider's token URL.
 */
export async function exchangeCodeForTokens(
  provider: OAuthProviderDefinition,
  params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    codeVerifier?: string;
  },
): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', params.code);
  body.set('client_id', params.clientId);
  body.set('client_secret', params.clientSecret);
  body.set('redirect_uri', params.redirectUri);

  if (params.codeVerifier && provider.supportsPkce) {
    body.set('code_verifier', params.codeVerifier);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
  };

  const response = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OAuth token exchange failed (${response.status}): ${errorText}`,
    );
  }

  const data = await response.json() as Record<string, unknown>;

  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string | undefined,
    expires_in: data.expires_in as number | undefined,
    token_type: data.token_type as string | undefined,
    scope: data.scope as string | undefined,
  };
}
