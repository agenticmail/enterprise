/**
 * MCP Skill Framework — Credential Resolver
 *
 * Bridges the enterprise SecureVault to per-skill credentials.
 * Reads encrypted credentials from the vault, decrypts them, and builds
 * the appropriate auth headers for each auth type.
 *
 * Vault naming convention:
 *   skill:{skillId}:access_token   — OAuth2 access token
 *   skill:{skillId}:refresh_token  — OAuth2 refresh token
 *   skill:{skillId}:api_key        — API key
 *   skill:{skillId}:token          — Bearer/bot token
 *   skill:{skillId}:{fieldName}    — Multi-field credentials
 */

import type { SecureVault } from '../../engine/vault.js';
import type { AuthConfig, ResolvedCredentials } from './types.js';

export class CredentialResolver {
  constructor(private vault: SecureVault) {}

  /**
   * Resolve credentials for a skill from the vault.
   */
  async resolve(orgId: string, skillId: string, auth: AuthConfig): Promise<ResolvedCredentials> {
    const entries = await this.vault.getSecretsByOrg(orgId, 'skill_credential');
    const prefix = `skill:${skillId}`;
    const skillEntries = entries.filter(e => e.name.startsWith(prefix));

    switch (auth.type) {
      case 'oauth2': {
        const tokenEntry = skillEntries.find(e =>
          e.name === `${prefix}:access_token` || e.name === prefix
        );
        const refreshEntry = skillEntries.find(e => e.name === `${prefix}:refresh_token`);

        if (!tokenEntry) {
          throw new Error(`No OAuth2 credentials found for skill "${skillId}". Store an access_token in the vault.`);
        }

        const tokenResult = await this.vault.getSecret(tokenEntry.id);
        const refreshResult = refreshEntry ? await this.vault.getSecret(refreshEntry.id) : null;

        return {
          type: 'oauth2',
          accessToken: tokenResult!.decrypted,
          refreshToken: refreshResult?.decrypted,
          expiresAt: tokenEntry.metadata?.expiresAt
            ? new Date(tokenEntry.metadata.expiresAt)
            : undefined,
        };
      }

      case 'api_key': {
        const entry = skillEntries.find(e =>
          e.name === `${prefix}:api_key` || e.name === prefix
        );
        if (!entry) {
          throw new Error(`No API key found for skill "${skillId}". Store an api_key in the vault.`);
        }
        const result = await this.vault.getSecret(entry.id);
        return { type: 'api_key', apiKey: result!.decrypted };
      }

      case 'token': {
        const entry = skillEntries.find(e =>
          e.name === `${prefix}:token` || e.name === prefix
        );
        if (!entry) {
          throw new Error(`No token found for skill "${skillId}". Store a token in the vault.`);
        }
        const result = await this.vault.getSecret(entry.id);
        return { type: 'token', token: result!.decrypted };
      }

      case 'credentials': {
        const fields: Record<string, string> = {};
        for (const field of auth.fields || []) {
          const entry = skillEntries.find(e => e.name === `${prefix}:${field}`);
          if (!entry) {
            throw new Error(`Missing credential field "${field}" for skill "${skillId}".`);
          }
          const result = await this.vault.getSecret(entry.id);
          fields[field] = result!.decrypted;
        }
        return { type: 'credentials', fields };
      }

      default:
        throw new Error(`Unknown auth type: ${auth.type}`);
    }
  }

  /**
   * Build HTTP auth headers from resolved credentials.
   */
  buildHeaders(credentials: ResolvedCredentials, auth: AuthConfig): Record<string, string> {
    const headerName = auth.headerName || 'Authorization';
    const prefix = auth.headerPrefix ?? 'Bearer';

    switch (credentials.type) {
      case 'oauth2':
        return { [headerName]: `${prefix} ${credentials.accessToken}` };

      case 'api_key':
        return { [headerName]: `${prefix} ${credentials.apiKey}` };

      case 'token':
        return { [headerName]: `${prefix} ${credentials.token}` };

      case 'credentials':
        // Multi-field credentials are handled per-adapter (e.g. AWS signature, basic auth).
        // The adapter should read ctx.credentials.fields directly.
        return {};

      default:
        return {};
    }
  }

  /**
   * Check if credentials exist for a skill (without decrypting).
   */
  async hasCredentials(orgId: string, skillId: string): Promise<boolean> {
    const entries = await this.vault.getSecretsByOrg(orgId, 'skill_credential');
    return entries.some(e => e.name.startsWith(`skill:${skillId}`));
  }
}
