/**
 * Database Adapter Interface
 * 
 * All enterprise storage goes through this interface.
 * Implementations exist for Postgres, MySQL, MongoDB, SQLite,
 * Turso, DynamoDB, CockroachDB, PlanetScale, Supabase, Neon.
 */

// ─── Types ───────────────────────────────────────────────────

export type DatabaseType = 
  | 'postgres' | 'mysql' | 'mongodb' | 'sqlite'
  | 'turso' | 'dynamodb' | 'cockroachdb'
  | 'planetscale' | 'supabase' | 'neon';

export interface DatabaseConfig {
  type: DatabaseType;
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  /** DynamoDB-specific */
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Turso-specific */
  authToken?: string;
  /** Extra driver options */
  options?: Record<string, unknown>;
}

export interface Agent {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'archived' | 'suspended';
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface AgentInput {
  id?: string;
  name: string;
  email?: string;
  role?: string;
  metadata?: Record<string, unknown>;
  createdBy: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  passwordHash?: string;
  ssoProvider?: string;
  ssoSubject?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface UserInput {
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  password?: string;
  ssoProvider?: string;
  ssoSubject?: string;
}

export interface AuditEvent {
  id: string;
  timestamp: Date;
  actor: string;       // user ID or 'system'
  actorType: 'user' | 'agent' | 'system';
  action: string;      // e.g. 'agent.create', 'email.send', 'rule.update'
  resource: string;    // e.g. 'agent:abc123'
  details?: Record<string, unknown>;
  ip?: string;
}

export interface AuditFilters {
  actor?: string;
  action?: string;
  resource?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface ApiKey {
  id: string;
  name: string;
  keyHash: string;
  keyPrefix: string;   // First 8 chars for display
  scopes: string[];
  createdBy: string;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
  revoked: boolean;
}

export interface ApiKeyInput {
  name: string;
  scopes: string[];
  createdBy: string;
  expiresAt?: Date;
}

export interface EmailRule {
  id: string;
  name: string;
  agentId?: string;    // null = applies to all agents
  conditions: {
    fromContains?: string;
    subjectContains?: string;
    subjectRegex?: string;
    toContains?: string;
    hasAttachment?: boolean;
  };
  actions: {
    moveTo?: string;
    markRead?: boolean;
    delete?: boolean;
    addTags?: string[];
    forwardTo?: string;
    autoReply?: string;
  };
  priority: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetentionPolicy {
  enabled: boolean;
  retainDays: number;      // Delete emails older than N days
  excludeTags?: string[];  // Don't delete emails with these tags
  archiveFirst: boolean;   // Archive before delete
}

export interface SsoConfig {
  saml?: {
    entityId: string;
    ssoUrl: string;
    certificate: string;
    signatureAlgorithm?: string;
    /** Auto-create users on first SSO login */
    autoProvision?: boolean;
    /** Default role for SSO-provisioned users */
    defaultRole?: 'admin' | 'member' | 'viewer';
    /** Only allow users from these email domains */
    allowedDomains?: string[];
  };
  oidc?: {
    clientId: string;
    clientSecret: string;
    discoveryUrl: string;
    /** Scopes to request (default: openid email profile) */
    scopes?: string[];
    autoProvision?: boolean;
    defaultRole?: 'admin' | 'member' | 'viewer';
    allowedDomains?: string[];
  };
}

export interface CompanySettings {
  id: string;
  name: string;
  domain?: string;
  subdomain: string;       // <subdomain>.agenticmail.io
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  dkimPrivateKey?: string;
  logoUrl?: string;
  primaryColor?: string;
  ssoConfig?: SsoConfig;
  plan: 'free' | 'team' | 'enterprise' | 'self-hosted';
  // Domain Registration & Verification
  deploymentKeyHash?: string;
  domainRegistrationId?: string;
  domainDnsChallenge?: string;
  domainVerifiedAt?: string;
  domainRegisteredAt?: string;
  domainStatus?: 'unregistered' | 'pending_dns' | 'verified' | 'failed';
  toolSecurityConfig?: Record<string, any>;
  firewallConfig?: FirewallConfig;
  modelPricingConfig?: ModelPricingConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface FirewallConfig {
  ipAccess?: {
    enabled?: boolean;
    mode?: 'allowlist' | 'blocklist';
    allowlist?: string[];
    blocklist?: string[];
    bypassPaths?: string[];
  };
  egress?: {
    enabled?: boolean;
    mode?: 'allowlist' | 'blocklist';
    allowedHosts?: string[];
    blockedHosts?: string[];
    allowedPorts?: number[];
    blockedPorts?: number[];
  };
  proxy?: {
    httpProxy?: string;
    httpsProxy?: string;
    noProxy?: string[];
  };
  trustedProxies?: {
    enabled?: boolean;
    ips?: string[];
  };
  network?: {
    corsOrigins?: string[];
    rateLimit?: {
      enabled?: boolean;
      requestsPerMinute?: number;
      skipPaths?: string[];
    };
    httpsEnforcement?: {
      enabled?: boolean;
      excludePaths?: string[];
    };
    securityHeaders?: {
      hsts?: boolean;
      hstsMaxAge?: number;
      xFrameOptions?: 'DENY' | 'SAMEORIGIN' | 'ALLOW';
      xContentTypeOptions?: boolean;
      referrerPolicy?: string;
      permissionsPolicy?: string;
    };
  };
}

export interface ModelPricingEntry {
  provider: string;       // 'anthropic' | 'openai' | 'google' | custom
  modelId: string;        // e.g. 'claude-sonnet-4-5-20250929'
  displayName: string;    // e.g. 'Claude Sonnet 4.5'
  inputCostPerMillion: number;   // USD per 1M input tokens
  outputCostPerMillion: number;  // USD per 1M output tokens
  contextWindow?: number;        // max tokens
  notes?: string;
}

export interface ModelPricingConfig {
  models: ModelPricingEntry[];
  defaultProvider?: string;
  currency?: string;  // default 'USD'
  updatedAt?: string;
  customProviders?: Array<{
    id: string;
    name: string;
    baseUrl: string;
    apiType: 'anthropic' | 'openai-compatible' | 'google' | 'ollama';
    apiKeyEnvVar?: string;
    headers?: Record<string, string>;
    models?: Array<{ id: string; name: string; contextWindow?: number }>;
  }>;
}

// ─── Abstract Adapter ────────────────────────────────────────

export abstract class DatabaseAdapter {
  abstract readonly type: DatabaseType;

  // Connection lifecycle
  abstract connect(config: DatabaseConfig): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract migrate(): Promise<void>;
  abstract isConnected(): boolean;

  // Company
  abstract getSettings(): Promise<CompanySettings>;
  abstract updateSettings(updates: Partial<CompanySettings>): Promise<CompanySettings>;

  // Agents
  abstract createAgent(input: AgentInput): Promise<Agent>;
  abstract getAgent(id: string): Promise<Agent | null>;
  abstract getAgentByName(name: string): Promise<Agent | null>;
  abstract listAgents(options?: { status?: Agent['status']; limit?: number; offset?: number }): Promise<Agent[]>;
  abstract updateAgent(id: string, updates: Partial<Agent>): Promise<Agent>;
  abstract archiveAgent(id: string): Promise<void>;
  abstract deleteAgent(id: string): Promise<void>;
  abstract countAgents(status?: Agent['status']): Promise<number>;

  // Users
  abstract createUser(input: UserInput): Promise<User>;
  abstract getUser(id: string): Promise<User | null>;
  abstract getUserByEmail(email: string): Promise<User | null>;
  abstract getUserBySso(provider: string, subject: string): Promise<User | null>;
  abstract listUsers(options?: { limit?: number; offset?: number }): Promise<User[]>;
  abstract updateUser(id: string, updates: Partial<User>): Promise<User>;
  abstract deleteUser(id: string): Promise<void>;

  // Audit
  abstract logEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void>;
  abstract queryAudit(filters: AuditFilters): Promise<{ events: AuditEvent[]; total: number }>;

  // API Keys
  abstract createApiKey(input: ApiKeyInput): Promise<{ key: ApiKey; plaintext: string }>;
  abstract getApiKey(id: string): Promise<ApiKey | null>;
  abstract validateApiKey(plaintext: string): Promise<ApiKey | null>;
  abstract listApiKeys(options?: { createdBy?: string }): Promise<ApiKey[]>;
  abstract revokeApiKey(id: string): Promise<void>;

  // Email Rules
  abstract createRule(rule: Omit<EmailRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<EmailRule>;
  abstract getRules(agentId?: string): Promise<EmailRule[]>;
  abstract updateRule(id: string, updates: Partial<EmailRule>): Promise<EmailRule>;
  abstract deleteRule(id: string): Promise<void>;

  // Retention
  abstract getRetentionPolicy(): Promise<RetentionPolicy>;
  abstract setRetentionPolicy(policy: RetentionPolicy): Promise<void>;

  // Stats
  abstract getStats(): Promise<{
    totalAgents: number;
    activeAgents: number;
    totalUsers: number;
    totalEmails: number;
    totalAuditEvents: number;
  }>;

  // ─── Engine Integration ────────────────────────────────

  /**
   * Returns a raw SQL execution interface for the engine subsystem.
   * Override in SQL-compatible adapters. Returns null for NoSQL backends
   * (MongoDB, DynamoDB) which don't support raw SQL queries.
   */
  getEngineDB(): {
    run(sql: string, params?: any[]): Promise<void>;
    get<T = any>(sql: string, params?: any[]): Promise<T | undefined>;
    all<T = any>(sql: string, params?: any[]): Promise<T[]>;
  } | null {
    return null;
  }

  /**
   * Returns the SQL dialect identifier for the engine database.
   * Maps to EngineDatabase dialect: 'sqlite' | 'postgres' | 'mysql' | 'turso' | 'mongodb' | 'dynamodb'
   */
  getDialect(): string {
    return this.type;
  }
}
