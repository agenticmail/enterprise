/**
 * Engine Database Schema
 *
 * SQL DDL for all engine tables. Used by SQLite, Postgres, MySQL, Turso.
 * MongoDB/DynamoDB use their own collection/table designs.
 */

export const ENGINE_TABLES = `
-- Managed agents (the deployed AI employees)
CREATE TABLE IF NOT EXISTS managed_agents (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  config JSON NOT NULL,
  health JSON NOT NULL DEFAULT '{}',
  usage JSON NOT NULL DEFAULT '{}',
  permission_profile_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  last_deployed_at TEXT,
  last_health_check_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_managed_agents_org ON managed_agents(org_id);
CREATE INDEX IF NOT EXISTS idx_managed_agents_state ON managed_agents(state);

-- State transition history
CREATE TABLE IF NOT EXISTS agent_state_history (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  reason TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES managed_agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_state_history_agent ON agent_state_history(agent_id);
CREATE INDEX IF NOT EXISTS idx_state_history_time ON agent_state_history(created_at);

-- Permission profiles
CREATE TABLE IF NOT EXISTS permission_profiles (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  config JSON NOT NULL,
  is_preset INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_permission_profiles_org ON permission_profiles(org_id);

-- Organizations (tenants)
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  limits JSON NOT NULL DEFAULT '{}',
  usage JSON NOT NULL DEFAULT '{}',
  settings JSON NOT NULL DEFAULT '{}',
  sso_config JSON,
  allowed_domains JSON NOT NULL DEFAULT '[]',
  billing JSON,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Knowledge bases
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  agent_ids JSON NOT NULL DEFAULT '[]',
  config JSON NOT NULL DEFAULT '{}',
  stats JSON NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_org ON knowledge_bases(org_id);

-- Knowledge base documents
CREATE TABLE IF NOT EXISTS kb_documents (
  id TEXT PRIMARY KEY,
  knowledge_base_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_url TEXT,
  mime_type TEXT NOT NULL DEFAULT 'text/plain',
  size INTEGER NOT NULL DEFAULT 0,
  metadata JSON NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'processing',
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_kb_documents_kb ON kb_documents(knowledge_base_id);

-- Knowledge base chunks (for RAG)
CREATE TABLE IF NOT EXISTS kb_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  embedding BLOB,
  metadata JSON NOT NULL DEFAULT '{}',
  FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc ON kb_chunks(document_id);

-- Tool call records (activity tracking)
CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  session_id TEXT,
  tool_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  parameters JSON,
  result JSON,
  timing JSON NOT NULL,
  cost JSON,
  permission JSON NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tool_calls_agent ON tool_calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_org ON tool_calls(org_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_time ON tool_calls(created_at);
CREATE INDEX IF NOT EXISTS idx_tool_calls_tool ON tool_calls(tool_id);

-- Activity events (real-time stream)
CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  session_id TEXT,
  type TEXT NOT NULL,
  data JSON NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_agent ON activity_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_activity_org ON activity_events(org_id);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_events(type);
CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_events(created_at);

-- Conversation entries
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  channel TEXT,
  token_count INTEGER NOT NULL DEFAULT 0,
  tool_calls JSON,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);

-- Approval requests
CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  org_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  side_effects JSON NOT NULL DEFAULT '[]',
  parameters JSON,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decision JSON,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_approvals_org ON approval_requests(org_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approvals_agent ON approval_requests(agent_id);

-- Approval policies
CREATE TABLE IF NOT EXISTS approval_policies (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  triggers JSON NOT NULL,
  approvers JSON NOT NULL,
  timeout JSON NOT NULL,
  notify JSON NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_approval_policies_org ON approval_policies(org_id);
`;

/**
 * Postgres-compatible version (uses JSONB instead of JSON, SERIAL, etc.)
 */
export const ENGINE_TABLES_POSTGRES = ENGINE_TABLES
  .replace(/JSON/g, 'JSONB')
  .replace(/INTEGER NOT NULL DEFAULT 0/g, 'INTEGER NOT NULL DEFAULT 0')
  .replace(/datetime\('now'\)/g, "NOW()")
  .replace(/INTEGER NOT NULL DEFAULT 1/g, 'BOOLEAN NOT NULL DEFAULT TRUE')
  .replace(/is_preset INTEGER NOT NULL DEFAULT 0/g, 'is_preset BOOLEAN NOT NULL DEFAULT FALSE');

// ─── Versioned Migration System ────────────────────────

/**
 * Migration tracking table — created first, tracks which migrations have run.
 */
export const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS engine_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const MIGRATIONS_TABLE_POSTGRES = MIGRATIONS_TABLE
  .replace(/datetime\('now'\)/g, "NOW()");

/**
 * Each migration has a version number, name, and per-dialect SQL.
 * The engine runs migrations in order, skipping already-applied ones.
 *
 * For MongoDB/DynamoDB: provide the `nosql` callback instead of SQL.
 */
export interface Migration {
  version: number;
  name: string;
  /** SQL statements (SQLite/Turso compatible) */
  sql?: string;
  /** Postgres-specific SQL (if different from sql) */
  postgres?: string;
  /** MySQL-specific SQL (if different from sql) */
  mysql?: string;
  /** NoSQL migration callback (MongoDB, DynamoDB) — receives the raw driver handle */
  nosql?: (db: any, dialect: string) => Promise<void>;
}

/**
 * Core migrations — the initial schema is migration 1.
 * Add new migrations here as the schema evolves.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: ENGINE_TABLES,
    postgres: ENGINE_TABLES_POSTGRES,
  },
  {
    version: 2,
    name: 'sso_and_deploy_credentials',
    sql: `
-- SSO integrations (SAML, OIDC configs per org)
CREATE TABLE IF NOT EXISTS sso_integrations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  config JSON NOT NULL DEFAULT '{}',
  metadata_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sso_org ON sso_integrations(org_id);
CREATE INDEX IF NOT EXISTS idx_sso_type ON sso_integrations(provider_type);

-- Deploy credentials (encrypted tokens for Docker/SSH/Fly/Railway)
CREATE TABLE IF NOT EXISTS deploy_credentials (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_type TEXT NOT NULL,
  config JSON NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deploy_creds_org ON deploy_credentials(org_id);
CREATE INDEX IF NOT EXISTS idx_deploy_creds_type ON deploy_credentials(target_type);

-- OIDC state tracking (prevents replay attacks)
CREATE TABLE IF NOT EXISTS oidc_states (
  state TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  redirect_uri TEXT,
  nonce TEXT,
  code_verifier TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
    `,
    postgres: `
CREATE TABLE IF NOT EXISTS sso_integrations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}',
  metadata_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sso_org ON sso_integrations(org_id);
CREATE INDEX IF NOT EXISTS idx_sso_type ON sso_integrations(provider_type);

CREATE TABLE IF NOT EXISTS deploy_credentials (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deploy_creds_org ON deploy_credentials(org_id);
CREATE INDEX IF NOT EXISTS idx_deploy_creds_type ON deploy_credentials(target_type);

CREATE TABLE IF NOT EXISTS oidc_states (
  state TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  redirect_uri TEXT,
  nonce TEXT,
  code_verifier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
    `,
  },
  {
    version: 3,
    name: 'autonomous_employee_trust',
    sql: `
-- Per-agent budget config (extends managed_agents)
ALTER TABLE managed_agents ADD COLUMN budget_config JSON DEFAULT '{}';

-- Budget alerts log
CREATE TABLE IF NOT EXISTS budget_alerts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  budget_type TEXT NOT NULL,
  current_value REAL NOT NULL,
  limit_value REAL NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_org ON budget_alerts(org_id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_agent ON budget_alerts(agent_id);

-- Escalation chains (multi-level approval workflows)
CREATE TABLE IF NOT EXISTS escalation_chains (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  levels JSON NOT NULL,
  fallback_action TEXT NOT NULL DEFAULT 'deny',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_escalation_org ON escalation_chains(org_id);

-- Escalation tracking on approval requests
ALTER TABLE approval_requests ADD COLUMN escalation_chain_id TEXT;
ALTER TABLE approval_requests ADD COLUMN escalation_level INTEGER DEFAULT 0;
ALTER TABLE approval_requests ADD COLUMN escalation_history JSON DEFAULT '[]';

-- DLP rules
CREATE TABLE IF NOT EXISTS dlp_rules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  pattern_type TEXT NOT NULL,
  pattern TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'block',
  applies_to TEXT NOT NULL DEFAULT 'both',
  severity TEXT NOT NULL DEFAULT 'high',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dlp_rules_org ON dlp_rules(org_id);

-- DLP violations log
CREATE TABLE IF NOT EXISTS dlp_violations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  match_context TEXT,
  direction TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dlp_violations_org ON dlp_violations(org_id);
CREATE INDEX IF NOT EXISTS idx_dlp_violations_agent ON dlp_violations(agent_id);

-- Agent-to-agent messages
CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  from_agent_id TEXT NOT NULL,
  to_agent_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'message',
  subject TEXT,
  content TEXT NOT NULL,
  metadata JSON NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  parent_id TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_messages_org ON agent_messages(org_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_to ON agent_messages(to_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_from ON agent_messages(from_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_status ON agent_messages(status);

-- Interventions (pause/resume/kill records)
CREATE TABLE IF NOT EXISTS interventions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  type TEXT NOT NULL,
  reason TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  metadata JSON NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_interventions_org ON interventions(org_id);
CREATE INDEX IF NOT EXISTS idx_interventions_agent ON interventions(agent_id);

-- Anomaly detection rules
CREATE TABLE IF NOT EXISTS anomaly_rules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL,
  config JSON NOT NULL,
  action TEXT NOT NULL DEFAULT 'alert',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_anomaly_rules_org ON anomaly_rules(org_id);

-- Action journal (for rollback)
CREATE TABLE IF NOT EXISTS action_journal (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT,
  tool_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  forward_data JSON NOT NULL,
  reverse_data JSON,
  reversible INTEGER NOT NULL DEFAULT 0,
  reversed INTEGER NOT NULL DEFAULT 0,
  reversed_at TEXT,
  reversed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_action_journal_org ON action_journal(org_id);
CREATE INDEX IF NOT EXISTS idx_action_journal_agent ON action_journal(agent_id);
CREATE INDEX IF NOT EXISTS idx_action_journal_reversible ON action_journal(reversible);

-- Compliance reports
CREATE TABLE IF NOT EXISTS compliance_reports (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  parameters JSON NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'generating',
  data JSON,
  format TEXT NOT NULL DEFAULT 'json',
  generated_by TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_org ON compliance_reports(org_id);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_type ON compliance_reports(type);
    `,
  },
  {
    version: 4,
    name: 'communication_topology',
    sql: `
-- Add direction and channel columns to agent_messages for traffic classification
ALTER TABLE agent_messages ADD COLUMN direction TEXT DEFAULT 'internal';
ALTER TABLE agent_messages ADD COLUMN channel TEXT DEFAULT 'direct';
CREATE INDEX IF NOT EXISTS idx_agent_messages_direction ON agent_messages(direction);
CREATE INDEX IF NOT EXISTS idx_agent_messages_channel ON agent_messages(channel);
    `,
  },
  {
    version: 5,
    name: 'communication_task_fields_and_compliance',
    sql: `
-- Add task lifecycle columns to agent_messages
ALTER TABLE agent_messages ADD COLUMN deadline TEXT;
ALTER TABLE agent_messages ADD COLUMN claimed_at TEXT;
ALTER TABLE agent_messages ADD COLUMN completed_at TEXT;

-- Add completed_at to compliance reports
ALTER TABLE compliance_reports ADD COLUMN completed_at TEXT;
    `,
  },
  {
    version: 6,
    name: 'community_skill_registry',
    sql: `
-- Community skill index (global marketplace catalog)
CREATE TABLE IF NOT EXISTS community_skill_index (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  author TEXT NOT NULL,
  repository TEXT NOT NULL,
  license TEXT NOT NULL DEFAULT 'MIT',
  category TEXT,
  risk TEXT DEFAULT 'medium',
  icon TEXT,
  tags JSON NOT NULL DEFAULT '[]',
  tools JSON NOT NULL DEFAULT '[]',
  config_schema JSON NOT NULL DEFAULT '{}',
  min_engine_version TEXT,
  homepage TEXT,
  downloads INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_csi_category ON community_skill_index(category);
CREATE INDEX IF NOT EXISTS idx_csi_author ON community_skill_index(author);
CREATE INDEX IF NOT EXISTS idx_csi_featured ON community_skill_index(featured);
CREATE INDEX IF NOT EXISTS idx_csi_verified ON community_skill_index(verified);
CREATE INDEX IF NOT EXISTS idx_csi_downloads ON community_skill_index(downloads);

-- Per-org installed community skills
CREATE TABLE IF NOT EXISTS community_skill_installed (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  version TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  config JSON NOT NULL DEFAULT '{}',
  installed_by TEXT NOT NULL,
  installed_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_csinst_org ON community_skill_installed(org_id);
CREATE INDEX IF NOT EXISTS idx_csinst_skill ON community_skill_installed(skill_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_csinst_org_skill ON community_skill_installed(org_id, skill_id);

-- Reviews and ratings for community skills (global, not org-scoped)
CREATE TABLE IF NOT EXISTS community_skill_reviews (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  org_id TEXT NOT NULL DEFAULT 'global',
  user_id TEXT NOT NULL,
  user_name TEXT,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_csrev_skill ON community_skill_reviews(skill_id);
    `,
  },
  {
    version: 7,
    name: 'domain_registration',
    sql: `
ALTER TABLE company_settings ADD COLUMN deployment_key_hash TEXT;
ALTER TABLE company_settings ADD COLUMN domain_registration_id TEXT;
ALTER TABLE company_settings ADD COLUMN domain_dns_challenge TEXT;
ALTER TABLE company_settings ADD COLUMN domain_verified_at TEXT;
ALTER TABLE company_settings ADD COLUMN domain_registered_at TEXT;
ALTER TABLE company_settings ADD COLUMN domain_status TEXT DEFAULT 'unregistered';
    `,
    postgres: `
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS deployment_key_hash TEXT;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS domain_registration_id TEXT;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS domain_dns_challenge TEXT;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS domain_verified_at TIMESTAMPTZ;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS domain_registered_at TIMESTAMPTZ;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS domain_status TEXT DEFAULT 'unregistered';
    `,
    mysql: `
ALTER TABLE company_settings ADD COLUMN deployment_key_hash TEXT;
ALTER TABLE company_settings ADD COLUMN domain_registration_id VARCHAR(255);
ALTER TABLE company_settings ADD COLUMN domain_dns_challenge TEXT;
ALTER TABLE company_settings ADD COLUMN domain_verified_at DATETIME;
ALTER TABLE company_settings ADD COLUMN domain_registered_at DATETIME;
ALTER TABLE company_settings ADD COLUMN domain_status VARCHAR(20) DEFAULT 'unregistered';
    `,
    nosql: async () => {
      // MongoDB and DynamoDB are schema-less; new fields added dynamically via updateSettings()
    },
  },
  {
    version: 8,
    name: 'workforce_management',
    sql: `
-- Work schedules (per-agent shift configuration)
CREATE TABLE IF NOT EXISTS work_schedules (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL UNIQUE,
  org_id TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  schedule_type TEXT NOT NULL DEFAULT 'standard',
  config JSON NOT NULL DEFAULT '{}',
  enforce_clock_in INTEGER NOT NULL DEFAULT 1,
  enforce_clock_out INTEGER NOT NULL DEFAULT 1,
  auto_wake_enabled INTEGER NOT NULL DEFAULT 1,
  off_hours_action TEXT NOT NULL DEFAULT 'pause',
  grace_period_minutes INTEGER NOT NULL DEFAULT 5,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_work_schedules_agent ON work_schedules(agent_id);
CREATE INDEX IF NOT EXISTS idx_work_schedules_org ON work_schedules(org_id);

-- Clock records (audit trail for clock-in/out events)
CREATE TABLE IF NOT EXISTS clock_records (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  type TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  scheduled_at TEXT,
  actual_at TEXT NOT NULL,
  reason TEXT,
  metadata JSON NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clock_records_agent ON clock_records(agent_id);
CREATE INDEX IF NOT EXISTS idx_clock_records_org ON clock_records(org_id);
CREATE INDEX IF NOT EXISTS idx_clock_records_type ON clock_records(type);
CREATE INDEX IF NOT EXISTS idx_clock_records_time ON clock_records(created_at);

-- Task queue (work continuity between sessions)
CREATE TABLE IF NOT EXISTS task_queue (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'continue',
  title TEXT NOT NULL,
  description TEXT,
  context JSON NOT NULL DEFAULT '{}',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'queued',
  source TEXT NOT NULL DEFAULT 'system',
  scheduled_for TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_queue_agent ON task_queue(agent_id);
CREATE INDEX IF NOT EXISTS idx_task_queue_org ON task_queue(org_id);
CREATE INDEX IF NOT EXISTS idx_task_queue_status ON task_queue(status);
    `,
    postgres: `
CREATE TABLE IF NOT EXISTS work_schedules (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL UNIQUE,
  org_id TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  schedule_type TEXT NOT NULL DEFAULT 'standard',
  config JSONB NOT NULL DEFAULT '{}',
  enforce_clock_in BOOLEAN NOT NULL DEFAULT TRUE,
  enforce_clock_out BOOLEAN NOT NULL DEFAULT TRUE,
  auto_wake_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  off_hours_action TEXT NOT NULL DEFAULT 'pause',
  grace_period_minutes INTEGER NOT NULL DEFAULT 5,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_work_schedules_agent ON work_schedules(agent_id);
CREATE INDEX IF NOT EXISTS idx_work_schedules_org ON work_schedules(org_id);

CREATE TABLE IF NOT EXISTS clock_records (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  type TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  actual_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clock_records_agent ON clock_records(agent_id);
CREATE INDEX IF NOT EXISTS idx_clock_records_org ON clock_records(org_id);
CREATE INDEX IF NOT EXISTS idx_clock_records_type ON clock_records(type);
CREATE INDEX IF NOT EXISTS idx_clock_records_time ON clock_records(created_at);

CREATE TABLE IF NOT EXISTS task_queue (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'continue',
  title TEXT NOT NULL,
  description TEXT,
  context JSONB NOT NULL DEFAULT '{}',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'queued',
  source TEXT NOT NULL DEFAULT 'system',
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_queue_agent ON task_queue(agent_id);
CREATE INDEX IF NOT EXISTS idx_task_queue_org ON task_queue(org_id);
CREATE INDEX IF NOT EXISTS idx_task_queue_status ON task_queue(status);
    `,
  },
  {
    version: 9,
    name: 'guardrails_policies_memory_onboarding',
    sql: `
-- Organization policies (the "employee handbook" for AI agents)
CREATE TABLE IF NOT EXISTS org_policies (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  enforcement TEXT NOT NULL DEFAULT 'mandatory',
  applies_to JSON NOT NULL DEFAULT '["*"]',
  tags JSON NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_org_policies_org ON org_policies(org_id);
CREATE INDEX IF NOT EXISTS idx_org_policies_category ON org_policies(category);

-- Agent memory entries (persistent learning and growth)
CREATE TABLE IF NOT EXISTS agent_memory (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'interaction',
  importance TEXT NOT NULL DEFAULT 'normal',
  confidence REAL NOT NULL DEFAULT 1.0,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  expires_at TEXT,
  tags JSON NOT NULL DEFAULT '[]',
  metadata JSON NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent ON agent_memory(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_org ON agent_memory(org_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_category ON agent_memory(category);

-- Onboarding records (tracking policy acknowledgment per agent)
CREATE TABLE IF NOT EXISTS onboarding_records (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  acknowledged_at TEXT,
  memory_entry_id TEXT,
  verification_hash TEXT,
  metadata JSON NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_onboarding_agent ON onboarding_records(agent_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_policy ON onboarding_records(policy_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_agent_policy ON onboarding_records(agent_id, policy_id);

-- Extended guardrail rules (superset of anomaly_rules with more categories)
CREATE TABLE IF NOT EXISTS guardrail_rules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  conditions JSON NOT NULL DEFAULT '{}',
  action TEXT NOT NULL DEFAULT 'alert',
  severity TEXT NOT NULL DEFAULT 'medium',
  cooldown_minutes INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TEXT,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_guardrail_rules_org ON guardrail_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_guardrail_rules_category ON guardrail_rules(category);
    `,
    postgres: `
CREATE TABLE IF NOT EXISTS org_policies (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  enforcement TEXT NOT NULL DEFAULT 'mandatory',
  applies_to JSONB NOT NULL DEFAULT '["*"]',
  tags JSONB NOT NULL DEFAULT '[]',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_policies_org ON org_policies(org_id);
CREATE INDEX IF NOT EXISTS idx_org_policies_category ON org_policies(category);

CREATE TABLE IF NOT EXISTS agent_memory (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'interaction',
  importance TEXT NOT NULL DEFAULT 'normal',
  confidence REAL NOT NULL DEFAULT 1.0,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  tags JSONB NOT NULL DEFAULT '[]',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent ON agent_memory(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_org ON agent_memory(org_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_category ON agent_memory(category);

CREATE TABLE IF NOT EXISTS onboarding_records (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  acknowledged_at TIMESTAMPTZ,
  memory_entry_id TEXT,
  verification_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_agent ON onboarding_records(agent_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_policy ON onboarding_records(policy_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_agent_policy ON onboarding_records(agent_id, policy_id);

CREATE TABLE IF NOT EXISTS guardrail_rules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}',
  action TEXT NOT NULL DEFAULT 'alert',
  severity TEXT NOT NULL DEFAULT 'medium',
  cooldown_minutes INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guardrail_rules_org ON guardrail_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_guardrail_rules_category ON guardrail_rules(category);
    `,
  },
  {
    version: 10,
    name: 'vault_storage_policy_import',
    sql: `
-- Vault entries (encrypted secrets at rest)
CREATE TABLE IF NOT EXISTS vault_entries (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  encrypted_value TEXT NOT NULL,
  metadata JSON NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  rotated_at TEXT,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_vault_org ON vault_entries(org_id);
CREATE INDEX IF NOT EXISTS idx_vault_category ON vault_entries(category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_org_name ON vault_entries(org_id, name);

-- Vault audit log (tracks every secret access for compliance)
CREATE TABLE IF NOT EXISTS vault_audit_log (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  vault_entry_id TEXT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  ip TEXT,
  metadata JSON NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vault_audit_org ON vault_audit_log(org_id);
CREATE INDEX IF NOT EXISTS idx_vault_audit_entry ON vault_audit_log(vault_entry_id);

-- Org storage configurations
CREATE TABLE IF NOT EXISTS org_storage_config (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  storage_type TEXT NOT NULL DEFAULT 'local',
  config JSON NOT NULL DEFAULT '{}',
  vault_credential_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_storage_org ON org_storage_config(org_id);

-- Storage objects metadata
CREATE TABLE IF NOT EXISTS storage_objects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  related_type TEXT,
  related_id TEXT,
  metadata JSON NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_storage_objects_org ON storage_objects(org_id);
CREATE INDEX IF NOT EXISTS idx_storage_objects_related ON storage_objects(related_type, related_id);

-- Policy import job tracking
CREATE TABLE IF NOT EXISTS policy_import_jobs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  format TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress JSON NOT NULL DEFAULT '{}',
  errors JSON NOT NULL DEFAULT '[]',
  policy_ids JSON NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_import_jobs_org ON policy_import_jobs(org_id);
    `,
    postgres: `
CREATE TABLE IF NOT EXISTS vault_entries (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  encrypted_value TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_vault_org ON vault_entries(org_id);
CREATE INDEX IF NOT EXISTS idx_vault_category ON vault_entries(category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_org_name ON vault_entries(org_id, name);

CREATE TABLE IF NOT EXISTS vault_audit_log (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  vault_entry_id TEXT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  ip TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vault_audit_org ON vault_audit_log(org_id);
CREATE INDEX IF NOT EXISTS idx_vault_audit_entry ON vault_audit_log(vault_entry_id);

CREATE TABLE IF NOT EXISTS org_storage_config (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  storage_type TEXT NOT NULL DEFAULT 'local',
  config JSONB NOT NULL DEFAULT '{}',
  vault_credential_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_storage_org ON org_storage_config(org_id);

CREATE TABLE IF NOT EXISTS storage_objects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  related_type TEXT,
  related_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_storage_objects_org ON storage_objects(org_id);
CREATE INDEX IF NOT EXISTS idx_storage_objects_related ON storage_objects(related_type, related_id);

CREATE TABLE IF NOT EXISTS policy_import_jobs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  format TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress JSONB NOT NULL DEFAULT '{}',
  errors JSONB NOT NULL DEFAULT '[]',
  policy_ids JSONB NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_import_jobs_org ON policy_import_jobs(org_id);
    `,
  },
  {
    version: 11,
    name: 'reviews_global_add_user_name',
    sql: `ALTER TABLE community_skill_reviews ADD COLUMN user_name TEXT;`,
    postgres: `ALTER TABLE community_skill_reviews ADD COLUMN IF NOT EXISTS user_name TEXT;`,
  },
  {
    version: 12,
    name: 'tool_security_config',
    sql: `ALTER TABLE company_settings ADD COLUMN tool_security_config TEXT DEFAULT '{}';`,
    postgres: `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tool_security_config TEXT DEFAULT '{}';`,
    mysql: `ALTER TABLE company_settings ADD COLUMN tool_security_config TEXT DEFAULT '{}';`,
    nosql: async () => {
      // MongoDB and DynamoDB are schema-less; new fields added dynamically via updateSettings()
    },
  },
  {
    version: 13,
    name: 'firewall_config',
    sql: `ALTER TABLE company_settings ADD COLUMN firewall_config TEXT DEFAULT '{}';`,
    postgres: `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS firewall_config TEXT DEFAULT '{}';`,
    mysql: `ALTER TABLE company_settings ADD COLUMN firewall_config TEXT DEFAULT '{}';`,
    nosql: async () => {},
  },
  {
    version: 14,
    name: 'agent_runtime_sessions',
    sql: `
-- Agent runtime sessions (standalone agent execution)
CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  org_id TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'active',
  token_count INTEGER DEFAULT 0,
  turn_count INTEGER DEFAULT 0,
  parent_session_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent ON agent_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_parent ON agent_sessions(parent_session_id);

-- Agent session messages (conversation history per session)
CREATE TABLE IF NOT EXISTS agent_session_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls TEXT,
  tool_results TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_session_messages_session ON agent_session_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_session_messages_time ON agent_session_messages(created_at);
    `,
    postgres: `
CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  org_id TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'active',
  token_count INTEGER DEFAULT 0,
  turn_count INTEGER DEFAULT 0,
  parent_session_id TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent ON agent_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_parent ON agent_sessions(parent_session_id);

CREATE TABLE IF NOT EXISTS agent_session_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls TEXT,
  tool_results TEXT,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_session_messages_session ON agent_session_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_session_messages_time ON agent_session_messages(created_at);
    `,
  },
  {
    version: 15,
    name: 'long_running_sessions',
    sql: `
-- Add heartbeat tracking to agent sessions
ALTER TABLE agent_sessions ADD COLUMN last_heartbeat_at INTEGER;
ALTER TABLE agent_sessions ADD COLUMN cost_usd REAL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_agent_sessions_heartbeat ON agent_sessions(last_heartbeat_at);

-- Persistent follow-ups (survive restarts)
CREATE TABLE IF NOT EXISTS agent_followups (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT,
  message TEXT NOT NULL,
  execute_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_followups_status ON agent_followups(status);
CREATE INDEX IF NOT EXISTS idx_agent_followups_execute ON agent_followups(execute_at);
CREATE INDEX IF NOT EXISTS idx_agent_followups_agent ON agent_followups(agent_id);
    `,
    postgres: `
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS last_heartbeat_at BIGINT;
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS cost_usd DOUBLE PRECISION DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_agent_sessions_heartbeat ON agent_sessions(last_heartbeat_at);

CREATE TABLE IF NOT EXISTS agent_followups (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT,
  message TEXT NOT NULL,
  execute_at BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_followups_status ON agent_followups(status);
CREATE INDEX IF NOT EXISTS idx_agent_followups_execute ON agent_followups(execute_at);
CREATE INDEX IF NOT EXISTS idx_agent_followups_agent ON agent_followups(agent_id);
    `,
    mysql: `
ALTER TABLE agent_sessions ADD COLUMN last_heartbeat_at BIGINT;
ALTER TABLE agent_sessions ADD COLUMN cost_usd DOUBLE DEFAULT 0;
CREATE INDEX idx_agent_sessions_heartbeat ON agent_sessions(last_heartbeat_at);

CREATE TABLE IF NOT EXISTS agent_followups (
  id VARCHAR(255) PRIMARY KEY,
  agent_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255),
  message TEXT NOT NULL,
  execute_at BIGINT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at BIGINT NOT NULL
);
CREATE INDEX idx_agent_followups_status ON agent_followups(status);
CREATE INDEX idx_agent_followups_execute ON agent_followups(execute_at);
CREATE INDEX idx_agent_followups_agent ON agent_followups(agent_id);
    `,
  },
  {
    version: 16,
    name: 'model_pricing_config',
    sql: `ALTER TABLE company_settings ADD COLUMN model_pricing_config TEXT DEFAULT '{}';`,
    postgres: `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS model_pricing_config TEXT DEFAULT '{}';`,
    mysql: `ALTER TABLE company_settings ADD COLUMN model_pricing_config TEXT DEFAULT '{}';`,
    nosql: async () => {},
  },
];

// ─── Dynamic Table Definitions ─────────────────────────

/**
 * Schema for a dynamically-registered table.
 * Plugins, skills, or the engine itself can register new tables at runtime.
 */
export interface DynamicTableDef {
  /** Table name (must be unique, will be prefixed with `ext_` to avoid collisions) */
  name: string;
  /** SQL CREATE TABLE statement (SQLite/Turso syntax) */
  sql: string;
  /** Postgres-specific DDL (optional, falls back to sql with auto-conversion) */
  postgres?: string;
  /** MySQL-specific DDL (optional) */
  mysql?: string;
  /** MongoDB collection setup callback */
  mongoSetup?: (db: any) => Promise<void>;
  /** DynamoDB table setup callback */
  dynamoSetup?: (client: any) => Promise<void>;
  /** Indexes to create (SQL only) */
  indexes?: string[];
}

/**
 * Convert SQLite-style DDL to Postgres-compatible DDL (best-effort).
 */
export function sqliteToPostgres(sql: string): string {
  return sql
    .replace(/JSON/g, 'JSONB')
    .replace(/datetime\('now'\)/g, "NOW()")
    .replace(/INTEGER NOT NULL DEFAULT 1(?!\d)/g, 'BOOLEAN NOT NULL DEFAULT TRUE')
    .replace(/INTEGER NOT NULL DEFAULT 0(?!\d)/g, 'INTEGER NOT NULL DEFAULT 0');
}

/**
 * Convert SQLite-style DDL to MySQL-compatible DDL (best-effort).
 */
export function sqliteToMySQL(sql: string): string {
  return sql
    .replace(/TEXT PRIMARY KEY/g, 'VARCHAR(255) PRIMARY KEY')
    .replace(/TEXT NOT NULL UNIQUE/g, 'VARCHAR(255) NOT NULL UNIQUE')
    .replace(/TEXT NOT NULL DEFAULT/g, 'VARCHAR(255) NOT NULL DEFAULT')
    .replace(/BLOB/g, 'LONGBLOB')
    .replace(/datetime\('now'\)/g, "NOW()")
    .replace(/INTEGER NOT NULL DEFAULT 1/g, 'TINYINT(1) NOT NULL DEFAULT 1')
    .replace(/ON CONFLICT\(.*?\) DO UPDATE SET/g, 'ON DUPLICATE KEY UPDATE');
}
