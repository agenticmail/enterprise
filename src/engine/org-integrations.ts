/**
 * Organization Integrations Manager
 * 
 * Manages per-organization integration credentials (Google Workspace, Microsoft 365,
 * custom OAuth, API keys). Each organization has its own set of credentials that
 * agents in that org use when accessing external services.
 * 
 * Security: credentials are stored encrypted in the database via the vault.
 * The `credentials` column stores vault secret IDs, not raw secrets.
 */

import type { EngineDatabase } from './db-adapter.js';
import type { SecureVault } from './vault.js';

// ─── Types ──────────────────────────────────────────────

export interface OrgIntegration {
  id: string;
  orgId: string;
  provider: string;           // 'google' | 'microsoft' | 'smtp' | 'custom'
  providerType: string;       // 'oauth2' | 'service_account' | 'api_key' | 'smtp'
  displayName?: string;
  config: OrgIntegrationConfig;
  scopes?: string;
  domain?: string;
  status: string;             // 'active' | 'inactive' | 'error'
  isDefault: boolean;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface OrgIntegrationConfig {
  // OAuth2
  clientId?: string;
  clientSecret?: string;      // Stored as vault secret ID
  redirectUri?: string;
  authUrl?: string;
  tokenUrl?: string;
  
  // Tokens (stored as vault secret IDs)
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: string;
  
  // Service Account (Google)
  serviceAccountEmail?: string;
  serviceAccountKey?: string;  // vault secret ID
  delegatedUser?: string;
  
  // SMTP / IMAP
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;          // vault secret ID
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPass?: string;          // vault secret ID
  imapTls?: boolean;
  
  // API Key
  apiKey?: string;            // vault secret ID
  
  // Microsoft-specific
  tenantId?: string;
  
  // General
  email?: string;             // primary email for this integration
  delegatedUsers?: string[];  // users this integration can act as
  
  [key: string]: any;
}

// Fields that are vault-encrypted (stored as vault secret IDs, not plaintext)
const SENSITIVE_FIELDS = new Set([
  'clientSecret', 'accessToken', 'refreshToken', 'serviceAccountKey',
  'smtpPass', 'imapPass', 'apiKey',
]);

// ─── Manager ────────────────────────────────────────────

export class OrgIntegrationManager {
  private db: EngineDatabase | null = null;
  private vault: SecureVault | null = null;
  // In-memory cache keyed by orgId → provider → integration
  private cache = new Map<string, Map<string, OrgIntegration>>();
  // Lifecycle reference for pushing credential updates to running agents
  lifecycle: any = null;

  setDb(db: EngineDatabase) { this.db = db; }
  setVault(vault: SecureVault) { this.vault = vault; }
  setLifecycle(lifecycle: any) { this.lifecycle = lifecycle; }

  /**
   * Push resolved email credentials to all running agents in an org.
   * Called when org credentials are created/updated or an agent is assigned to an org.
   * This updates the in-memory config of running agents so they pick up changes immediately.
   */
  async pushCredentialsToOrgAgents(orgId: string): Promise<{ updated: string[] }> {
    if (!this.lifecycle) return { updated: [] };
    const updated: string[] = [];
    try {
      const agents = this.lifecycle.listAgents?.() || [];
      for (const agent of agents) {
        const agentOrgId = agent.client_org_id || agent.clientOrgId;
        if (agentOrgId !== orgId) continue;
        
        try {
          const agentEmailCfg = agent.config?.emailConfig?._fromOrgIntegration ? null : agent.config?.emailConfig;
          const resolved = await this.resolveEmailConfig(orgId, agentEmailCfg);
          if (resolved && (resolved.oauthAccessToken || resolved.smtpHost)) {
            if (!agent.config) agent.config = {};
            agent.config.emailConfig = { ...resolved, _fromOrgIntegration: true };
            updated.push(agent.id);
          }
        } catch { /* skip individual agent errors */ }
      }
    } catch { /* best effort */ }
    return { updated };
  }

  /**
   * Push credentials to a single agent by resolving from its org.
   */
  async pushCredentialsToAgent(agentId: string, orgId: string): Promise<boolean> {
    if (!this.lifecycle) return false;
    try {
      const agent = this.lifecycle.getAgent?.(agentId);
      if (!agent) return false;
      const agentEmailCfg = agent.config?.emailConfig?._fromOrgIntegration ? null : agent.config?.emailConfig;
      const resolved = await this.resolveEmailConfig(orgId, agentEmailCfg);
      if (resolved && (resolved.oauthAccessToken || resolved.smtpHost)) {
        if (!agent.config) agent.config = {};
        agent.config.emailConfig = { ...resolved, _fromOrgIntegration: true };
        return true;
      }
    } catch { /* best effort */ }
    return false;
  }

  /**
   * Clear org-inherited email config from an agent (used when unassigning from org).
   */
  clearOrgCredentialsFromAgent(agentId: string): boolean {
    if (!this.lifecycle) return false;
    try {
      const agent = this.lifecycle.getAgent?.(agentId);
      if (!agent?.config?.emailConfig) return false;
      if (agent.config.emailConfig._fromOrgIntegration) {
        agent.config.emailConfig = null;
        return true;
      }
    } catch { /* best effort */ }
    return false;
  }

  // ─── CRUD ─────────────────────────────────────────────

  async create(orgId: string, data: Partial<OrgIntegration> & { provider: string }, createdBy?: string): Promise<OrgIntegration> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    
    // Encrypt sensitive fields
    const config = { ...(data.config || {}) };
    const credentialRefs: Record<string, string> = {};
    for (const field of SENSITIVE_FIELDS) {
      if (config[field]) {
        const secretName = `org-int:${id}:${field}`;
        const entry = await this.vault!.storeSecret(orgId, secretName, 'org_integration', config[field]);
        credentialRefs[field] = entry.id;
        delete config[field]; // Don't store raw value
      }
    }

    const integration: OrgIntegration = {
      id,
      orgId,
      provider: data.provider,
      providerType: data.providerType || 'oauth2',
      displayName: data.displayName || data.provider,
      config,
      scopes: data.scopes || '',
      domain: data.domain || null as any,
      status: data.status || 'active',
      isDefault: data.isDefault ?? false,
      metadata: data.metadata || {},
      createdAt: now,
      updatedAt: now,
      createdBy: createdBy,
    };

    if (this.db) {
      await this.db.execute(
        `INSERT INTO organization_integrations (id, org_id, provider, provider_type, display_name, config, credentials, scopes, domain, status, is_default, metadata, created_at, updated_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [id, orgId, integration.provider, integration.providerType, integration.displayName,
         JSON.stringify(config), JSON.stringify(credentialRefs), integration.scopes,
         integration.domain, integration.status, integration.isDefault,
         JSON.stringify(integration.metadata), now, now, createdBy || null]
      );
    }

    // Update cache
    if (!this.cache.has(orgId)) this.cache.set(orgId, new Map());
    this.cache.get(orgId)!.set(this.cacheKey(integration), integration);

    return integration;
  }

  async update(id: string, updates: Partial<OrgIntegration>): Promise<OrgIntegration | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const config = updates.config ? { ...existing.config, ...updates.config } : existing.config;
    
    // Re-encrypt any updated sensitive fields
    let credentialRefs = await this.getCredentialRefs(id);
    if (updates.config) {
      for (const field of SENSITIVE_FIELDS) {
        if (updates.config[field]) {
          // Update or create vault secret
          if (credentialRefs[field]) {
            await this.vault!.updateSecret(credentialRefs[field], updates.config[field]);
          } else {
            const secretName = `org-int:${id}:${field}`;
            const entry = await this.vault!.storeSecret(existing.orgId, secretName, 'org_integration', updates.config[field]);
            credentialRefs[field] = entry.id;
          }
          delete config[field]; // Don't store raw value in config column
        }
      }
    }

    const now = new Date().toISOString();
    if (this.db) {
      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;
      
      if (updates.displayName !== undefined) { fields.push(`display_name = $${idx++}`); values.push(updates.displayName); }
      if (updates.config) { fields.push(`config = $${idx++}`); values.push(JSON.stringify(config)); }
      if (updates.scopes !== undefined) { fields.push(`scopes = $${idx++}`); values.push(updates.scopes); }
      if (updates.domain !== undefined) { fields.push(`domain = $${idx++}`); values.push(updates.domain); }
      if (updates.status !== undefined) { fields.push(`status = $${idx++}`); values.push(updates.status); }
      if (updates.isDefault !== undefined) { fields.push(`is_default = $${idx++}`); values.push(updates.isDefault); }
      if (updates.metadata !== undefined) { fields.push(`metadata = $${idx++}`); values.push(JSON.stringify(updates.metadata)); }
      
      // Always update credentials refs and timestamp
      fields.push(`credentials = $${idx++}`); values.push(JSON.stringify(credentialRefs));
      fields.push(`updated_at = $${idx++}`); values.push(now);
      values.push(id);
      
      await this.db.execute(
        `UPDATE organization_integrations SET ${fields.join(', ')} WHERE id = $${idx}`,
        values
      );
    }

    const updated: OrgIntegration = {
      ...existing,
      ...updates,
      config,
      updatedAt: now,
    };

    // Update cache
    if (!this.cache.has(existing.orgId)) this.cache.set(existing.orgId, new Map());
    this.cache.get(existing.orgId)!.set(this.cacheKey(updated), updated);

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;

    // Delete vault secrets
    const refs = await this.getCredentialRefs(id);
    for (const secretId of Object.values(refs)) {
      try { await this.vault!.deleteSecret(secretId); } catch { /* ok */ }
    }

    if (this.db) {
      await this.db.execute('DELETE FROM organization_integrations WHERE id = $1', [id]);
    }

    // Remove from cache
    const orgCache = this.cache.get(existing.orgId);
    if (orgCache) orgCache.delete(this.cacheKey(existing));

    return true;
  }

  // ─── Queries ──────────────────────────────────────────

  async getById(id: string): Promise<OrgIntegration | null> {
    if (!this.db) return null;
    const row = await this.db.get<any>('SELECT * FROM organization_integrations WHERE id = $1', [id]);
    return row ? this.mapRow(row) : null;
  }

  async listByOrg(orgId: string): Promise<OrgIntegration[]> {
    if (!this.db) return [];
    const rows = await this.db.query<any>(
      'SELECT * FROM organization_integrations WHERE org_id = $1 ORDER BY provider, display_name', [orgId]
    );
    return rows.map(r => this.mapRow(r));
  }

  async getByOrgAndProvider(orgId: string, provider: string, domain?: string): Promise<OrgIntegration | null> {
    if (!this.db) return null;
    let row: any;
    if (domain) {
      row = await this.db.get<any>(
        'SELECT * FROM organization_integrations WHERE org_id = $1 AND provider = $2 AND domain = $3 AND status = $4',
        [orgId, provider, domain, 'active']
      );
    } else {
      row = await this.db.get<any>(
        'SELECT * FROM organization_integrations WHERE org_id = $1 AND provider = $2 AND status = $3 ORDER BY is_default DESC LIMIT 1',
        [orgId, provider, 'active']
      );
    }
    return row ? this.mapRow(row) : null;
  }

  async getDefaultForOrg(orgId: string, provider: string): Promise<OrgIntegration | null> {
    if (!this.db) return null;
    const row = await this.db.get<any>(
      'SELECT * FROM organization_integrations WHERE org_id = $1 AND provider = $2 AND is_default = $3 AND status = $4',
      [orgId, provider, true, 'active']
    );
    return row ? this.mapRow(row) : null;
  }

  // ─── Credential Resolution (for agent runtime) ───────

  /**
   * Resolve decrypted credentials for an agent based on its org.
   * This is the main entry point for agent runtime credential resolution.
   * 
   * Resolution order:
   * 1. Agent's own org integration (if agent has client_org_id)
   * 2. Internal/default org integration
   * 3. null (no credentials available)
   */
  async resolveForAgent(agentOrgId: string | null, provider: string): Promise<ResolvedCredentials | null> {
    // Try agent's org first
    if (agentOrgId) {
      const orgInt = await this.getByOrgAndProvider(agentOrgId, provider);
      if (orgInt) return this.decryptCredentials(orgInt);
    }
    
    // Fall back to internal/default org
    const defaultInt = await this.getByOrgAndProvider('internal', provider)
      || await this.getByOrgAndProvider('default', provider);
    if (defaultInt) return this.decryptCredentials(defaultInt);
    
    return null;
  }

  /**
   * Resolve email config for an agent. Merges org integration with any agent-specific overrides.
   */
  async resolveEmailConfig(agentOrgId: string | null, agentEmailConfig: any): Promise<any> {
    // If agent has its own complete email config, use it
    if (agentEmailConfig?.oauthAccessToken || agentEmailConfig?.smtpHost) {
      return agentEmailConfig;
    }

    // Try to resolve from org integrations
    const googleCreds = await this.resolveForAgent(agentOrgId, 'google');
    if (googleCreds) {
      return {
        email: googleCreds.email || agentEmailConfig?.email,
        provider: 'google',
        oauthAccessToken: googleCreds.accessToken,
        oauthRefreshToken: googleCreds.refreshToken,
        oauthTokenExpiry: googleCreds.tokenExpiry,
        oauthClientId: googleCreds.clientId,
        oauthClientSecret: googleCreds.clientSecret,
        oauthProvider: 'google',
        ...agentEmailConfig, // agent-specific overrides take precedence
      };
    }

    const microsoftCreds = await this.resolveForAgent(agentOrgId, 'microsoft');
    if (microsoftCreds) {
      return {
        email: microsoftCreds.email || agentEmailConfig?.email,
        provider: 'microsoft',
        oauthAccessToken: microsoftCreds.accessToken,
        oauthRefreshToken: microsoftCreds.refreshToken,
        oauthTokenExpiry: microsoftCreds.tokenExpiry,
        oauthClientId: microsoftCreds.clientId,
        oauthClientSecret: microsoftCreds.clientSecret,
        oauthProvider: 'microsoft',
        tenantId: microsoftCreds.tenantId,
        ...agentEmailConfig,
      };
    }

    // Try SMTP
    const smtpCreds = await this.resolveForAgent(agentOrgId, 'smtp');
    if (smtpCreds) {
      return {
        email: smtpCreds.email || agentEmailConfig?.email,
        smtpHost: smtpCreds.smtpHost,
        smtpPort: smtpCreds.smtpPort,
        smtpUser: smtpCreds.smtpUser,
        smtpPass: smtpCreds.smtpPass,
        imapHost: smtpCreds.imapHost,
        imapPort: smtpCreds.imapPort,
        imapUser: smtpCreds.imapUser,
        imapPass: smtpCreds.imapPass,
        ...agentEmailConfig,
      };
    }

    return agentEmailConfig || null;
  }

  /**
   * Create a TokenProvider for an agent based on its org's credentials.
   * Used by Google Workspace and Microsoft tools at runtime.
   */
  async createTokenProviderForAgent(
    agentId: string,
    agentOrgId: string | null,
    provider: 'google' | 'microsoft',
    onTokenRefresh?: (tokens: any) => void
  ): Promise<{ getAccessToken: () => Promise<string>; getProvider: () => string; getEmail: () => string } | null> {
    const creds = await this.resolveForAgent(agentOrgId, provider);
    if (!creds || !creds.refreshToken) return null;

    let currentAccessToken = creds.accessToken || '';
    let currentExpiry = creds.tokenExpiry || '';

    const self = this;
    return {
      getAccessToken: async () => {
        // Check if token is expired (with 5min buffer)
        const expiryTime = currentExpiry ? new Date(currentExpiry).getTime() : 0;
        if (currentAccessToken && expiryTime > Date.now() + 300000) {
          return currentAccessToken;
        }
        // Refresh
        const newToken = await self.refreshOAuthToken(creds, provider);
        currentAccessToken = newToken.accessToken;
        currentExpiry = newToken.expiresAt;
        // Persist refreshed token back to vault
        if (creds._integrationId) {
          try {
            await self.update(creds._integrationId, {
              config: { accessToken: newToken.accessToken, tokenExpiry: newToken.expiresAt },
            });
          } catch { /* non-fatal */ }
        }
        if (onTokenRefresh) onTokenRefresh(newToken);
        return currentAccessToken;
      },
      getProvider: () => provider,
      getEmail: () => creds.email || '',
    };
  }

  // ─── Private helpers ──────────────────────────────────

  private async refreshOAuthToken(creds: ResolvedCredentials, provider: string): Promise<{ accessToken: string; expiresAt: string }> {
    const tokenUrl = provider === 'microsoft'
      ? `https://login.microsoftonline.com/${creds.tenantId || 'common'}/oauth2/v2.0/token`
      : 'https://oauth2.googleapis.com/token';

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken!,
      client_id: creds.clientId!,
      client_secret: creds.clientSecret!,
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Token refresh failed (${provider}): ${res.status} ${err}`);
    }

    const data = await res.json() as any;
    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
    };
  }

  private async decryptCredentials(integration: OrgIntegration): Promise<ResolvedCredentials> {
    const refs = await this.getCredentialRefs(integration.id);
    const result: ResolvedCredentials = {
      _integrationId: integration.id,
      provider: integration.provider,
      providerType: integration.providerType,
      email: integration.config.email,
      domain: integration.domain || undefined,
      tenantId: integration.config.tenantId,
      // SMTP fields from config (non-sensitive)
      smtpHost: integration.config.smtpHost,
      smtpPort: integration.config.smtpPort,
      smtpUser: integration.config.smtpUser,
      imapHost: integration.config.imapHost,
      imapPort: integration.config.imapPort,
      imapUser: integration.config.imapUser,
      imapTls: integration.config.imapTls,
      // Non-sensitive config
      clientId: integration.config.clientId,
      redirectUri: integration.config.redirectUri,
      serviceAccountEmail: integration.config.serviceAccountEmail,
      delegatedUser: integration.config.delegatedUser,
      delegatedUsers: integration.config.delegatedUsers,
      scopes: integration.scopes,
    };

    // Decrypt sensitive fields from vault
    for (const [field, secretId] of Object.entries(refs)) {
      if (secretId) {
        try {
          const secret = await this.vault!.getSecret(secretId);
          if (secret) (result as any)[field] = secret.decrypted;
        } catch { /* secret may have been deleted */ }
      }
    }

    return result;
  }

  private async getCredentialRefs(integrationId: string): Promise<Record<string, string>> {
    if (!this.db) return {};
    const row = await this.db.get<any>('SELECT credentials FROM organization_integrations WHERE id = $1', [integrationId]);
    if (!row) return {};
    try {
      return typeof row.credentials === 'string' ? JSON.parse(row.credentials) : (row.credentials || {});
    } catch { return {}; }
  }

  private cacheKey(integration: OrgIntegration): string {
    return `${integration.provider}:${integration.domain || '_default'}`;
  }

  private mapRow(row: any): OrgIntegration {
    return {
      id: row.id,
      orgId: row.org_id,
      provider: row.provider,
      providerType: row.provider_type,
      displayName: row.display_name,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {}),
      scopes: row.scopes,
      domain: row.domain,
      status: row.status,
      isDefault: !!row.is_default,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
    };
  }
}

// ─── Resolved credentials type ──────────────────────────

export interface ResolvedCredentials {
  _integrationId: string;
  provider: string;
  providerType: string;
  email?: string;
  domain?: string;
  // OAuth
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: string;
  redirectUri?: string;
  // Microsoft
  tenantId?: string;
  // Service Account
  serviceAccountEmail?: string;
  serviceAccountKey?: string;
  delegatedUser?: string;
  delegatedUsers?: string[];
  scopes?: string;
  // SMTP/IMAP
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPass?: string;
  imapTls?: boolean;
  // API Key
  apiKey?: string;
}
