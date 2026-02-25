/**
 * OAuth Token Provider
 *
 * Shared abstraction for getting valid OAuth access tokens for agent tools.
 * Handles token refresh automatically when tokens expire.
 * Used by both Google Workspace and Microsoft Graph tool suites.
 */

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string; // ISO timestamp
  provider: 'google' | 'microsoft';
  clientId: string;
  clientSecret: string;
  scopes?: string[];
}

export interface TokenProvider {
  /** Get a valid access token, refreshing if necessary */
  getAccessToken(): Promise<string>;
  /** Get the provider type */
  getProvider(): 'google' | 'microsoft';
  /** Get the agent's email */
  getEmail(): string | undefined;
}

export interface TokenProviderConfig {
  getTokens: () => OAuthTokens | null;
  saveTokens: (tokens: Partial<OAuthTokens>) => void;
  getEmail?: () => string | undefined;
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry

export function createTokenProvider(config: TokenProviderConfig): TokenProvider {
  return {
    async getAccessToken(): Promise<string> {
      const tokens = config.getTokens();
      if (!tokens) throw new Error('No OAuth tokens configured. Connect email via the agent Email tab first.');
      if (!tokens.accessToken) throw new Error('No access token available. Re-authorize via the Email tab.');

      // Check if token is expired or about to expire
      if (tokens.expiresAt) {
        const expiresAt = new Date(tokens.expiresAt).getTime();
        if (Date.now() > expiresAt - TOKEN_REFRESH_BUFFER_MS) {
          // Need to refresh
          if (!tokens.refreshToken) throw new Error('Access token expired and no refresh token available. Re-authorize via the Email tab.');
          return await refreshAccessToken(tokens, config);
        }
      }

      return tokens.accessToken;
    },

    getProvider(): 'google' | 'microsoft' {
      const tokens = config.getTokens();
      return tokens?.provider || 'google';
    },

    getEmail(): string | undefined {
      return config.getEmail?.();
    },
  };
}

async function refreshAccessToken(tokens: OAuthTokens, config: TokenProviderConfig): Promise<string> {
  const tokenUrl = tokens.provider === 'google'
    ? 'https://oauth2.googleapis.com/token'
    : `https://login.microsoftonline.com/common/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: tokens.clientId,
    client_secret: tokens.clientSecret,
    refresh_token: tokens.refreshToken!,
    grant_type: 'refresh_token',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${errText}`);
  }

  const data = await res.json() as any;
  const newTokens: Partial<OAuthTokens> = {
    accessToken: data.access_token,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : undefined,
  };
  if (data.refresh_token) newTokens.refreshToken = data.refresh_token;

  config.saveTokens(newTokens);
  return data.access_token;
}
