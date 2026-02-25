#!/usr/bin/env node
/**
 * AgenticMail Enterprise — Comprehensive Seed Data
 * Populates knowledge bases, policies, guardrails, DLP rules, and onboarding
 */

import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = 'postgresql://postgres.ziurzgoffaexxgjmfjph:MK6PHWIpjDO0cPwU@aws-1-us-east-2.pooler.supabase.com:5432/postgres';
const ORG_ID = 'default';

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });

function uid() { return crypto.randomUUID(); }
const now = new Date().toISOString();

async function run(sql, params = []) {
  const client = await pool.connect();
  try { await client.query(sql, params); }
  finally { client.release(); }
}

async function seed() {
  console.log('🌱 Seeding AgenticMail Enterprise database...\n');

  // ═══════════════════════════════════════════════════════
  // 1. KNOWLEDGE BASES + DOCUMENTS + CHUNKS
  // ═══════════════════════════════════════════════════════
  console.log('📚 Creating knowledge bases...');

  const kbData = [
    {
      id: uid(), name: 'AgenticMail Platform Guide',
      description: 'Comprehensive guide to the AgenticMail platform — architecture, features, API, configuration, deployment, and best practices for enterprise AI agent email infrastructure.',
      documents: [
        {
          name: 'Platform Overview',
          chunks: [
            'AgenticMail is an enterprise-grade AI agent identity and email infrastructure platform. It provides each AI agent with its own email address, enabling agents to send, receive, and manage emails autonomously. The platform supports multi-tenant organizations with role-based access control, audit logging, and compliance features.',
            'Core components include: (1) Agent Identity — unique email addresses per agent with DKIM/SPF/DMARC authentication; (2) Email Engine — full IMAP/SMTP stack with spam filtering and DLP; (3) Agent Runtime — managed execution environment for AI agents; (4) Dashboard — admin UI for monitoring, configuration, and management; (5) MCP Integration — Model Context Protocol adapters for 20+ enterprise tools.',
            'AgenticMail supports multiple database backends: PostgreSQL (recommended for production), SQLite (development), MySQL, Turso, MongoDB, and DynamoDB. The system uses a layered architecture with a core package (@agenticmail/core), API layer (@agenticmail/api), MCP server (@agenticmail/mcp), OpenClaw integration (@agenticmail/openclaw), and enterprise features (@agenticmail/enterprise).',
            'Deployment options include Docker, Fly.io, AWS (ECS/Lambda), Google Cloud Run, Railway, Render, and bare metal. The setup wizard guides administrators through database configuration, domain setup, SSL certificates, and initial agent provisioning. All data stays on your infrastructure — no phone-home after initial domain registration.',
          ]
        },
        {
          name: 'Agent Configuration Guide',
          chunks: [
            'Each managed agent has a lifecycle: provisioning → active → paused → decommissioned. Agents are configured with a SOUL.md (personality and behavior rules), system prompt, allowed tools, rate limits, and budget constraints. The agent runtime executes agent tasks using configured LLM providers (Anthropic, OpenAI, Google, or self-hosted models).',
            'Agent email addresses follow the format agent@yourdomain.com (custom domain mode) or yourname+agent@gmail.com (relay mode). Each agent has its own inbox, sent folder, drafts, and can be configured with auto-reply rules, email signatures, and forwarding policies.',
            'Tool security is managed through permission profiles. Each profile defines which tools an agent can use, with granular controls: allow, deny, or require-approval. Tools can be grouped by category (communication, file-system, web, database, etc.) with per-tool parameter restrictions.',
            'Budget management allows setting per-agent spending limits with alerts at configurable thresholds (e.g., 50%, 80%, 100%). When a budget is exhausted, the agent is automatically paused. Administrators receive notifications via the configured alert channels (email, Slack, webhook).',
          ]
        },
        {
          name: 'API Reference',
          chunks: [
            'The AgenticMail API uses REST with JSON payloads. Authentication supports JWT tokens (for dashboard users), API keys (for programmatic access), and SSO/OIDC (for enterprise identity providers). All requests include X-Request-Id headers for tracing.',
            'Core API endpoints: POST /api/agents (create agent), GET /api/agents (list agents), PATCH /api/agents/:id (update), DELETE /api/agents/:id (decommission). Agent email: GET /api/agents/:id/inbox, POST /api/agents/:id/send, GET /api/agents/:id/messages/:msgId.',
            'Engine API endpoints (under /api/engine/): /knowledge-bases (RAG knowledge management), /policies (governance policies), /guardrails (runtime safety rules), /dlp (data loss prevention), /compliance (audit reports), /vault (secrets management), /approvals (human-in-the-loop workflows).',
            'Webhook integrations: POST /api/webhooks/configure to set up event notifications. Supported events: agent.created, agent.paused, agent.error, email.received, email.sent, budget.alert, dlp.violation, approval.requested, compliance.report.generated.',
          ]
        },
        {
          name: 'Security & Compliance',
          chunks: [
            'AgenticMail implements defense-in-depth security: (1) Network layer — IP allowlisting, rate limiting, WAF integration; (2) Authentication — JWT with refresh tokens, API key rotation, SSO/OIDC; (3) Authorization — RBAC with owner/admin/member/viewer roles; (4) Data — AES-256-GCM encryption at rest for vault secrets, TLS 1.3 in transit.',
            'Data Loss Prevention (DLP) scans all outbound agent communications for: PII (emails, SSNs, credit cards, phone numbers), credentials (API keys, passwords, tokens), and custom patterns (regex or keyword-based). Violations can trigger block, alert, or quarantine actions with configurable severity levels.',
            'Compliance features include: SOC 2 Type II audit trail generation, GDPR data subject access requests, HIPAA-compatible audit logging, and custom compliance report templates. All agent actions are logged in the action journal with actor, action, resource, timestamp, and full request/response metadata.',
            'The vault stores secrets using AES-256-GCM with PBKDF2 key derivation (600,000 iterations, SHA-512). Each entry has its own random salt and IV. Master key is derived from the AGENTICMAIL_VAULT_KEY environment variable. Secrets can be rotated individually or in bulk with zero-downtime key rotation.',
          ]
        },
        {
          name: 'Deployment Best Practices',
          chunks: [
            'Production deployment checklist: (1) Use PostgreSQL with connection pooling (PgBouncer or Supabase pooler); (2) Set DATABASE_URL and JWT_SECRET as environment variables, never in config files; (3) Enable HTTPS with valid certificates; (4) Configure CORS to restrict allowed origins; (5) Set up health check monitoring at /health endpoint.',
            'Scaling recommendations: AgenticMail is stateless — scale horizontally by adding more instances behind a load balancer. Database connections should use pooling with max 5-10 connections per instance. For high-throughput email, consider dedicated SMTP relay (Amazon SES, SendGrid, or Mailgun).',
            'Monitoring: The /health endpoint returns { status: "ok", uptime, version }. Key metrics to monitor: API response times (p99 < 500ms), database connection pool utilization (< 80%), email delivery rate (> 99%), agent task success rate, and DLP violation frequency.',
            'Backup strategy: Database backups should run daily with point-in-time recovery enabled. Vault secrets are encrypted at rest but should also be backed up. Domain registration deployment keys should be stored in a separate password manager — they cannot be recovered if lost.',
          ]
        }
      ]
    },
    {
      id: uid(), name: 'Enterprise Security Policies',
      description: 'Security policies, compliance frameworks, and governance guidelines for enterprise AI agent deployments.',
      documents: [
        {
          name: 'Acceptable Use Policy',
          chunks: [
            'AI agents deployed through AgenticMail must comply with the organization\'s acceptable use policy. Agents are prohibited from: (1) Sending unsolicited bulk email (spam); (2) Impersonating humans without disclosure; (3) Accessing systems beyond their authorized scope; (4) Storing or transmitting classified data without encryption.',
            'Agent communication guidelines: All external emails must include a clear identifier that the message was generated by an AI agent. Internal communications may omit this if the organization has a blanket AI disclosure policy. Agents must not use deceptive subject lines or social engineering tactics.',
            'Data handling requirements: Agents must classify data they process as Public, Internal, Confidential, or Restricted. Confidential and Restricted data must never be included in outbound emails without explicit approval. PII must be minimized — agents should reference record IDs rather than including full personal data.',
          ]
        },
        {
          name: 'Incident Response Procedures',
          chunks: [
            'Security incident classification: P1 (Critical) — data breach, unauthorized access, agent compromise; P2 (High) — DLP violation, credential exposure, service outage; P3 (Medium) — policy violation, anomalous behavior, failed authentication spike; P4 (Low) — configuration drift, minor policy deviation.',
            'Response workflow: (1) Detection — automated via guardrails, DLP, or anomaly detection; (2) Triage — severity classification and impact assessment; (3) Containment — pause affected agents, revoke compromised credentials; (4) Investigation — review action journal, analyze email logs; (5) Remediation — patch vulnerability, update policies; (6) Post-mortem — document findings, update playbooks.',
            'Escalation matrix: P1 → immediate notification to Security Lead + CTO, agent killed within 5 minutes; P2 → Security Lead notified within 15 minutes, agent paused; P3 → reviewed in next business day standup; P4 → tracked in weekly security review.',
          ]
        }
      ]
    },
    {
      id: uid(), name: 'Agent Development Handbook',
      description: 'Best practices for developing, testing, and deploying AI agents on the AgenticMail platform.',
      documents: [
        {
          name: 'Agent Design Patterns',
          chunks: [
            'The Specialist pattern: Create focused agents with narrow responsibilities. Example: an "Invoice Agent" that only processes invoices, a "Customer Support Agent" for support tickets, a "Research Agent" for web research. Each specialist has a minimal tool set and clear boundaries.',
            'The Coordinator pattern: A supervisor agent delegates tasks to specialist agents via email. The coordinator receives requests, determines which specialist should handle them, and routes accordingly. This enables complex workflows while keeping individual agents simple and auditable.',
            'The Pipeline pattern: Chain agents in sequence where each agent\'s output becomes the next agent\'s input. Example: Data Collection Agent → Analysis Agent → Report Agent → Distribution Agent. Use email threads to maintain context through the pipeline.',
            'The Guardian pattern: Pair each operational agent with a review agent. The operational agent drafts outputs (emails, reports, decisions) and the guardian reviews them before they\'re sent. Implement via the approval workflow system for high-stakes operations.',
          ]
        },
        {
          name: 'Testing & Quality Assurance',
          chunks: [
            'Agent testing framework: (1) Unit tests — validate individual tool calls and response formatting; (2) Integration tests — verify email send/receive, database operations, API interactions; (3) Scenario tests — simulate realistic multi-turn conversations and workflows; (4) Adversarial tests — attempt prompt injection, boundary violation, data exfiltration.',
            'Staging environment: Always deploy agents to staging before production. Use a separate database and email domain (e.g., staging.agenticmail.io). Run the full test suite including DLP checks, guardrail triggers, and budget limit enforcement.',
            'Monitoring in production: Track key metrics per agent: task completion rate, average response time, error rate, email bounce rate, DLP violations, budget consumption. Set up alerts for anomalies — a sudden spike in email volume or tool calls may indicate agent malfunction or compromise.',
          ]
        }
      ]
    }
  ];

  for (const kb of kbData) {
    await run(
      `INSERT INTO knowledge_bases (id, org_id, name, description, agent_ids, config, stats, created_at, updated_at)
       VALUES ($1, $2, $3, $4, '[]', '{}', $5, $6, $6)
       ON CONFLICT (id) DO NOTHING`,
      [kb.id, ORG_ID, kb.name, kb.description, JSON.stringify({ documents: kb.documents.length, chunks: kb.documents.reduce((a, d) => a + d.chunks.length, 0) }), now]
    );
    for (const doc of kb.documents) {
      const docId = uid();
      await run(
        `INSERT INTO kb_documents (id, knowledge_base_id, name, source_type, mime_type, size, metadata, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'manual', 'text/plain', $4, '{}', 'ready', $5, $5)
         ON CONFLICT (id) DO NOTHING`,
        [docId, kb.id, doc.name, doc.chunks.join('').length, now]
      );
      for (let i = 0; i < doc.chunks.length; i++) {
        await run(
          `INSERT INTO kb_chunks (id, document_id, content, token_count, position, metadata)
           VALUES ($1, $2, $3, $4, $5, '{}')
           ON CONFLICT (id) DO NOTHING`,
          [uid(), docId, doc.chunks[i], Math.ceil(doc.chunks[i].length / 4), i]
        );
      }
    }
    console.log(`  ✅ ${kb.name} (${kb.documents.length} docs)`);
  }

  // ═══════════════════════════════════════════════════════
  // 2. APPROVAL POLICIES
  // ═══════════════════════════════════════════════════════
  console.log('\n📋 Creating approval policies...');

  const policies = [
    {
      name: 'External Email Approval',
      description: 'Require human approval before agents send emails to external recipients (outside organization domain).',
      triggers: { events: ['email.send'], conditions: { recipientType: 'external' } },
      approvers: { roles: ['admin', 'owner'], minApprovals: 1, timeout: '4h' },
      timeout: { action: 'deny', notifyOnTimeout: true },
      notify: { channels: ['email', 'dashboard'], onRequest: true, onDecision: true },
    },
    {
      name: 'High-Value Transaction Approval',
      description: 'Require dual approval for any agent action involving financial transactions over $1,000.',
      triggers: { events: ['tool.call'], conditions: { toolCategory: 'finance', amountThreshold: 1000 } },
      approvers: { roles: ['owner'], minApprovals: 2, timeout: '2h' },
      timeout: { action: 'deny', notifyOnTimeout: true },
      notify: { channels: ['email', 'slack'], onRequest: true, onDecision: true, urgency: 'high' },
    },
    {
      name: 'Database Write Approval',
      description: 'Require approval for any destructive database operations (DELETE, DROP, TRUNCATE) performed by agents.',
      triggers: { events: ['tool.call'], conditions: { toolName: 'database', operation: ['delete', 'drop', 'truncate', 'alter'] } },
      approvers: { roles: ['admin', 'owner'], minApprovals: 1, timeout: '1h' },
      timeout: { action: 'deny', notifyOnTimeout: true },
      notify: { channels: ['email'], onRequest: true, onDecision: true },
    },
    {
      name: 'New Tool Access Request',
      description: 'When an agent requests access to a tool not in its permission profile, route to admin for approval.',
      triggers: { events: ['tool.access_denied'], conditions: {} },
      approvers: { roles: ['admin'], minApprovals: 1, timeout: '24h' },
      timeout: { action: 'deny', notifyOnTimeout: false },
      notify: { channels: ['dashboard'], onRequest: true, onDecision: true },
    },
    {
      name: 'Bulk Email Campaign Approval',
      description: 'Require approval before any agent sends more than 10 emails in a 1-hour window to prevent spam.',
      triggers: { events: ['rate_limit.approaching'], conditions: { metric: 'emails_sent', threshold: 10, window: '1h' } },
      approvers: { roles: ['admin', 'owner'], minApprovals: 1, timeout: '30m' },
      timeout: { action: 'block', notifyOnTimeout: true },
      notify: { channels: ['email', 'dashboard'], onRequest: true, onDecision: true },
    },
    {
      name: 'Agent Deployment Approval',
      description: 'Require owner approval before deploying new agents or promoting agents from staging to production.',
      triggers: { events: ['agent.deploy', 'agent.promote'], conditions: { environment: 'production' } },
      approvers: { roles: ['owner'], minApprovals: 1, timeout: '8h' },
      timeout: { action: 'deny', notifyOnTimeout: true },
      notify: { channels: ['email', 'slack'], onRequest: true, onDecision: true },
    },
    {
      name: 'Sensitive Data Access',
      description: 'Require approval when agents attempt to access documents classified as Confidential or Restricted.',
      triggers: { events: ['document.access'], conditions: { classification: ['confidential', 'restricted'] } },
      approvers: { roles: ['admin', 'owner'], minApprovals: 1, timeout: '2h' },
      timeout: { action: 'deny', notifyOnTimeout: true },
      notify: { channels: ['email'], onRequest: true, onDecision: true },
    },
    {
      name: 'Budget Override Request',
      description: 'When an agent exceeds its allocated budget, allow requesting a temporary override with manager approval.',
      triggers: { events: ['budget.exceeded'], conditions: {} },
      approvers: { roles: ['owner'], minApprovals: 1, timeout: '4h' },
      timeout: { action: 'deny', notifyOnTimeout: true },
      notify: { channels: ['email', 'dashboard'], onRequest: true, onDecision: true },
    },
  ];

  for (const p of policies) {
    await run(
      `INSERT INTO approval_policies (id, org_id, name, description, triggers, approvers, timeout, notify, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,true, $9, $9)
       ON CONFLICT (id) DO NOTHING`,
      [uid(), ORG_ID, p.name, p.description, JSON.stringify(p.triggers), JSON.stringify(p.approvers), JSON.stringify(p.timeout), JSON.stringify(p.notify), now]
    );
    console.log(`  ✅ ${p.name}`);
  }

  // ═══════════════════════════════════════════════════════
  // 3. DLP RULES
  // ═══════════════════════════════════════════════════════
  console.log('\n🛡️ Creating DLP rules...');

  const dlpRules = [
    { name: 'Credit Card Numbers', description: 'Detect and block credit card numbers (Visa, MC, Amex, Discover) in outbound communications.', pattern_type: 'regex', pattern: '\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\\b', action: 'block', severity: 'critical' },
    { name: 'Social Security Numbers', description: 'Detect and block US Social Security Numbers in any format.', pattern_type: 'regex', pattern: '\\b(?:\\d{3}[-\\s]?\\d{2}[-\\s]?\\d{4})\\b', action: 'block', severity: 'critical' },
    { name: 'API Keys & Tokens', description: 'Detect API keys, bearer tokens, and secret keys in outbound messages.', pattern_type: 'regex', pattern: '(?:sk-[a-zA-Z0-9]{32,}|ghp_[a-zA-Z0-9]{36}|glpat-[a-zA-Z0-9\\-]{20,}|xox[bps]-[a-zA-Z0-9\\-]+|Bearer\\s+[a-zA-Z0-9\\-._~+/]+=*)', action: 'block', severity: 'critical' },
    { name: 'AWS Credentials', description: 'Detect AWS access keys, secret keys, and session tokens.', pattern_type: 'regex', pattern: '(?:AKIA[0-9A-Z]{16}|(?:aws_secret_access_key|aws_access_key_id)\\s*[=:]\\s*[A-Za-z0-9/+=]{20,})', action: 'block', severity: 'critical' },
    { name: 'Private Keys', description: 'Detect PEM-encoded private keys (RSA, EC, DSA).', pattern_type: 'regex', pattern: '-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----', action: 'block', severity: 'critical' },
    { name: 'Email Addresses (Bulk)', description: 'Alert when outbound message contains more than 5 email addresses — potential data harvesting.', pattern_type: 'pii_type', pattern: 'email_bulk', action: 'alert', severity: 'high' },
    { name: 'Phone Numbers', description: 'Detect and alert on phone numbers in outbound communications.', pattern_type: 'regex', pattern: '\\b(?:\\+?1?[-.]?\\(?\\d{3}\\)?[-.]?\\d{3}[-.]?\\d{4})\\b', action: 'alert', severity: 'medium' },
    { name: 'Internal URLs', description: 'Block exposure of internal service URLs, localhost references, or private IP addresses.', pattern_type: 'regex', pattern: '(?:https?://(?:localhost|127\\.0\\.0\\.1|10\\.\\d+\\.\\d+\\.\\d+|172\\.(?:1[6-9]|2\\d|3[01])\\.\\d+\\.\\d+|192\\.168\\.\\d+\\.\\d+)(?::\\d+)?)', action: 'block', severity: 'high' },
    { name: 'Database Connection Strings', description: 'Detect and block database connection strings containing credentials.', pattern_type: 'regex', pattern: '(?:(?:postgres|mysql|mongodb|redis)(?:ql)?://[^\\s]+(?::[^\\s@]+)?@[^\\s]+)', action: 'block', severity: 'critical' },
    { name: 'Passport Numbers', description: 'Detect potential passport number patterns.', pattern_type: 'regex', pattern: '\\b[A-Z]{1,2}\\d{6,9}\\b', action: 'alert', severity: 'medium' },
    { name: 'Medical Record Numbers', description: 'Detect potential MRN patterns for HIPAA compliance.', pattern_type: 'regex', pattern: '\\b(?:MRN|Medical Record)\\s*[:#]?\\s*\\d{6,10}\\b', action: 'block', severity: 'high' },
    { name: 'Confidential Markings', description: 'Detect documents marked as confidential, secret, or top secret being shared externally.', pattern_type: 'keyword', pattern: 'CONFIDENTIAL,TOP SECRET,CLASSIFIED,RESTRICTED,INTERNAL ONLY,DO NOT DISTRIBUTE', action: 'alert', severity: 'high' },
  ];

  for (const r of dlpRules) {
    await run(
      `INSERT INTO dlp_rules (id, org_id, name, description, pattern_type, pattern, action, applies_to, severity, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'outbound', $8,true, $9, $9)
       ON CONFLICT (id) DO NOTHING`,
      [uid(), ORG_ID, r.name, r.description, r.pattern_type, r.pattern, r.action, r.severity, now]
    );
    console.log(`  ✅ ${r.name}`);
  }

  // ═══════════════════════════════════════════════════════
  // 4. GUARDRAIL RULES
  // ═══════════════════════════════════════════════════════
  console.log('\n🚧 Creating guardrail rules...');

  const guardrails = [
    { name: 'Excessive Email Volume', description: 'Alert when an agent sends more than 50 emails per hour.', category: 'rate_limit', rule_type: 'threshold', conditions: { metric: 'emails_sent', threshold: 50, window: '1h' }, action: 'alert', severity: 'high', cooldown: 60 },
    { name: 'Unusual Working Hours', description: 'Alert when agent activity occurs outside business hours (configurable per timezone).', category: 'behavioral', rule_type: 'time_window', conditions: { outsideHours: { start: '22:00', end: '06:00' }, timezone: 'UTC' }, action: 'alert', severity: 'low', cooldown: 480 },
    { name: 'High Error Rate', description: 'Pause agent if error rate exceeds 30% over 10 consecutive tasks.', category: 'performance', rule_type: 'threshold', conditions: { metric: 'error_rate', threshold: 0.3, sampleSize: 10 }, action: 'pause', severity: 'high', cooldown: 30 },
    { name: 'Budget 80% Warning', description: 'Alert when agent reaches 80% of allocated monthly budget.', category: 'budget', rule_type: 'threshold', conditions: { metric: 'budget_utilization', threshold: 0.8 }, action: 'alert', severity: 'medium', cooldown: 1440 },
    { name: 'Budget Exhausted', description: 'Automatically pause agent when monthly budget is fully consumed.', category: 'budget', rule_type: 'threshold', conditions: { metric: 'budget_utilization', threshold: 1.0 }, action: 'pause', severity: 'critical', cooldown: 0 },
    { name: 'Large Attachment Detection', description: 'Alert when agent attempts to send email with attachments over 10MB.', category: 'data_protection', rule_type: 'threshold', conditions: { metric: 'attachment_size_mb', threshold: 10 }, action: 'alert', severity: 'medium', cooldown: 5 },
    { name: 'Repeated Tool Failures', description: 'Alert when same tool fails 5+ times in succession — possible misconfiguration.', category: 'performance', rule_type: 'pattern', conditions: { metric: 'consecutive_tool_failures', threshold: 5, sameToolOnly: true }, action: 'alert', severity: 'high', cooldown: 15 },
    { name: 'Memory Usage Spike', description: 'Alert when agent context/memory grows beyond configured limits.', category: 'performance', rule_type: 'threshold', conditions: { metric: 'memory_tokens', threshold: 100000 }, action: 'alert', severity: 'medium', cooldown: 60 },
    { name: 'Privilege Escalation Attempt', description: 'Kill agent immediately if it attempts to access tools or resources outside its permission profile.', category: 'security', rule_type: 'pattern', conditions: { event: 'permission_denied', consecutiveAttempts: 3 }, action: 'kill', severity: 'critical', cooldown: 0 },
    { name: 'Self-Modification Detection', description: 'Alert if agent attempts to modify its own configuration, SOUL.md, or permission profile.', category: 'security', rule_type: 'pattern', conditions: { event: 'config_write_attempt', targetSelf: true }, action: 'alert', severity: 'critical', cooldown: 0 },
    { name: 'External API Rate Limit', description: 'Throttle agent when it makes more than 100 external API calls per minute.', category: 'rate_limit', rule_type: 'threshold', conditions: { metric: 'external_api_calls', threshold: 100, window: '1m' }, action: 'throttle', severity: 'medium', cooldown: 5 },
    { name: 'Conversation Loop Detection', description: 'Pause agent if it enters a repetitive loop — same output 3+ times consecutively.', category: 'behavioral', rule_type: 'pattern', conditions: { metric: 'duplicate_outputs', threshold: 3, windowMessages: 10 }, action: 'pause', severity: 'high', cooldown: 30 },
    { name: 'Unauthorized Outbound Connection', description: 'Block and alert when agent attempts to connect to domains not on the allowlist.', category: 'network', rule_type: 'allowlist', conditions: { allowedDomains: ['*.agenticmail.io', '*.openai.com', '*.anthropic.com', '*.googleapis.com'] }, action: 'block', severity: 'high', cooldown: 5 },
    { name: 'PII Accumulation Warning', description: 'Alert when agent stores more than 100 PII items in its working memory.', category: 'data_protection', rule_type: 'threshold', conditions: { metric: 'pii_items_in_context', threshold: 100 }, action: 'alert', severity: 'high', cooldown: 120 },
    { name: 'Cross-Agent Communication Anomaly', description: 'Alert when inter-agent email volume exceeds 50 messages per hour — possible infinite loop.', category: 'behavioral', rule_type: 'threshold', conditions: { metric: 'inter_agent_emails', threshold: 50, window: '1h' }, action: 'alert', severity: 'high', cooldown: 60 },
  ];

  for (const g of guardrails) {
    await run(
      `INSERT INTO guardrail_rules (id, org_id, name, description, category, rule_type, conditions, action, severity, cooldown_minutes, enabled, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, 'system', $11, $11)
       ON CONFLICT (id) DO NOTHING`,
      [uid(), ORG_ID, g.name, g.description, g.category, g.rule_type, JSON.stringify(g.conditions), g.action, g.severity, g.cooldown, now]
    );
    console.log(`  ✅ ${g.name}`);
  }

  // ═══════════════════════════════════════════════════════
  // 5. COMMUNITY SKILLS (Skill Index)
  // ═══════════════════════════════════════════════════════
  console.log('\n🧩 Populating community skill index...');

  const skills = [
    { skillId: 'email-triage', name: 'Email Triage & Classification', description: 'Automatically classify incoming emails by priority, category, and required action. Uses NLP to detect urgency, sentiment, and topic.', author: 'agenticmail', version: '1.2.0', tags: ['email', 'classification', 'nlp', 'productivity'], tools: ['email.read', 'email.label', 'email.move'], configSchema: { rules: { type: 'array', description: 'Classification rules' }, categories: { type: 'array', description: 'Custom categories' } } },
    { skillId: 'calendar-scheduler', name: 'Smart Calendar Scheduler', description: 'AI-powered meeting scheduling via email. Parses availability, suggests optimal times, sends calendar invites.', author: 'agenticmail', version: '1.0.3', tags: ['calendar', 'scheduling', 'email', 'productivity'], tools: ['calendar.read', 'calendar.create', 'email.send'], configSchema: { timezone: { type: 'string' }, workingHours: { type: 'object' } } },
    { skillId: 'slack-bridge', name: 'Slack Integration Bridge', description: 'Bridge agent email conversations to Slack channels. Forward important emails, send Slack notifications, sync threads.', author: 'agenticmail', version: '2.1.0', tags: ['slack', 'integration', 'communication', 'notifications'], tools: ['slack.post', 'slack.read', 'email.read'], configSchema: { channelMap: { type: 'object', description: 'Email-to-channel routing rules' }, botToken: { type: 'string', secret: true } } },
    { skillId: 'invoice-processor', name: 'Invoice Processing & Extraction', description: 'Extract data from PDF/image invoices using OCR. Parse line items, totals, vendor info. Create structured records.', author: 'agenticmail', version: '1.5.2', tags: ['finance', 'invoices', 'ocr', 'automation'], tools: ['file.read', 'vision.analyze', 'database.write'], configSchema: { approvalThreshold: { type: 'number', description: 'Amount requiring approval' } } },
    { skillId: 'customer-support', name: 'Customer Support Agent', description: 'Handle customer support emails with knowledge base lookup, ticket creation, escalation rules, and SLA tracking.', author: 'agenticmail', version: '3.0.1', tags: ['support', 'customer-service', 'tickets', 'sla'], tools: ['email.read', 'email.send', 'knowledge.search', 'ticket.create'], configSchema: { slaConfig: { type: 'object' }, escalationRules: { type: 'array' } } },
    { skillId: 'data-analyst', name: 'Data Analysis & Reporting', description: 'Analyze datasets, generate reports with visualizations, and distribute via email. Supports CSV, JSON, SQL queries.', author: 'community', version: '1.1.0', tags: ['analytics', 'reporting', 'data', 'visualization'], tools: ['database.query', 'file.read', 'file.write', 'email.send'], configSchema: { dataSources: { type: 'array' }, reportTemplates: { type: 'array' } } },
    { skillId: 'web-researcher', name: 'Web Research & Summarization', description: 'Research topics across the web, summarize findings, compile reports. Supports academic papers, news, and general research.', author: 'community', version: '2.0.0', tags: ['research', 'web', 'summarization', 'knowledge'], tools: ['web.search', 'web.fetch', 'file.write', 'email.send'], configSchema: { searchProviders: { type: 'array' }, maxSources: { type: 'number' } } },
    { skillId: 'compliance-monitor', name: 'Compliance Monitoring Agent', description: 'Monitor agent activities for compliance violations. Generate SOC 2, GDPR, HIPAA reports. Track policy adherence.', author: 'agenticmail', version: '1.3.0', tags: ['compliance', 'audit', 'soc2', 'gdpr', 'hipaa'], tools: ['audit.read', 'report.generate', 'email.send'], configSchema: { frameworks: { type: 'array', description: 'Compliance frameworks to monitor' } } },
    { skillId: 'document-drafting', name: 'Document Drafting & Review', description: 'Draft contracts, proposals, reports, and other business documents. Includes template management and review workflows.', author: 'community', version: '1.0.0', tags: ['documents', 'drafting', 'templates', 'review'], tools: ['file.write', 'file.read', 'email.send'], configSchema: { templates: { type: 'array' }, reviewers: { type: 'array' } } },
    { skillId: 'github-ops', name: 'GitHub Operations', description: 'Manage GitHub repositories, issues, PRs, and deployments via agent commands. Supports CI/CD triggers and code review.', author: 'community', version: '1.4.0', tags: ['github', 'devops', 'ci-cd', 'code-review'], tools: ['github.issues', 'github.prs', 'github.actions', 'email.send'], configSchema: { repos: { type: 'array' }, autoMerge: { type: 'boolean' } } },
  ];

  for (const s of skills) {
    await run(
      `INSERT INTO community_skill_index (id, name, description, author, version, repository, license, category, tags, tools, config_schema, downloads, rating, rating_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'MIT', $7, $8, $9, $10, $11, $12, $13, $14, $14)
       ON CONFLICT (id) DO NOTHING`,
      [s.skillId, s.name, s.description, s.author, s.version, 'https://github.com/agenticmail/' + s.skillId, s.tags[0] || 'general', JSON.stringify(s.tags), JSON.stringify(s.tools), JSON.stringify(s.configSchema), Math.floor(Math.random() * 5000) + 100, parseFloat((3.5 + Math.random() * 1.5).toFixed(1)), Math.floor(Math.random() * 200) + 5, now]
    );
    console.log(`  ✅ ${s.name}`);
  }

  // ═══════════════════════════════════════════════════════
  // 6. VAULT ENTRIES (demo secrets — encrypted values are placeholders)
  // ═══════════════════════════════════════════════════════
  console.log('\n🔐 Creating vault entries...');

  const vaultEntries = [
    { name: 'anthropic-api-key', category: 'api_key', metadata: { provider: 'Anthropic', environment: 'production', description: 'Claude API key for agent LLM calls' } },
    { name: 'openai-api-key', category: 'api_key', metadata: { provider: 'OpenAI', environment: 'production', description: 'GPT-4 API key for fallback provider' } },
    { name: 'sendgrid-api-key', category: 'api_key', metadata: { provider: 'SendGrid', environment: 'production', description: 'Email delivery service API key' } },
    { name: 'slack-bot-token', category: 'api_key', metadata: { provider: 'Slack', environment: 'production', description: 'Slack bot token for notifications' } },
    { name: 'stripe-secret-key', category: 'api_key', metadata: { provider: 'Stripe', environment: 'production', description: 'Payment processing secret key' } },
    { name: 'aws-access-credentials', category: 'cloud', metadata: { provider: 'AWS', region: 'us-east-1', description: 'S3 and SES access credentials' } },
    { name: 'database-backup-key', category: 'encryption', metadata: { algorithm: 'AES-256-GCM', description: 'Encryption key for database backup files' } },
    { name: 'smtp-relay-password', category: 'credential', metadata: { service: 'SMTP', host: 'smtp.agenticmail.io', description: 'SMTP relay authentication password' } },
  ];

  for (const v of vaultEntries) {
    await run(
      `INSERT INTO vault_entries (id, org_id, name, category, encrypted_value, metadata, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'admin', $7, $7)
       ON CONFLICT DO NOTHING`,
      [uid(), ORG_ID, v.name, v.category, 'DEMO_ENCRYPTED_VALUE_' + v.name, JSON.stringify(v.metadata), now]
    );
    console.log(`  ✅ ${v.name}`);
  }

  // ═══════════════════════════════════════════════════════
  // 7. MANAGED AGENTS (demo agents)
  // ═══════════════════════════════════════════════════════
  console.log('\n🤖 Creating managed agents...');

  const agents = [
    { id: 'agent-support-01', name: 'Customer Support Agent', orgId: ORG_ID, state: 'active', config: { identity: { name: 'Support Agent', email: 'support@agenticmail.io', avatar: null }, model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a helpful customer support agent for AgenticMail. Respond to customer inquiries professionally, escalate complex issues to human agents, and maintain a knowledge base of common solutions.', tools: ['email.read', 'email.send', 'knowledge.search', 'ticket.create'], maxTokensPerTurn: 4096, budgetMonthly: 50 } },
    { id: 'agent-research-01', name: 'Research Agent', orgId: ORG_ID, state: 'active', config: { identity: { name: 'Research Agent', email: 'research@agenticmail.io', avatar: null }, model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a research agent that gathers information from the web, analyzes data, and compiles comprehensive reports. Be thorough, cite sources, and present findings clearly.', tools: ['web.search', 'web.fetch', 'file.write', 'email.send'], maxTokensPerTurn: 8192, budgetMonthly: 100 } },
    { id: 'agent-ops-01', name: 'DevOps Agent', orgId: ORG_ID, state: 'active', config: { identity: { name: 'DevOps Agent', email: 'devops@agenticmail.io', avatar: null }, model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a DevOps agent responsible for monitoring deployments, running health checks, managing CI/CD pipelines, and alerting the team to infrastructure issues.', tools: ['github.actions', 'shell.execute', 'email.send', 'slack.post'], maxTokensPerTurn: 4096, budgetMonthly: 75 } },
    { id: 'agent-finance-01', name: 'Finance Agent', orgId: ORG_ID, state: 'paused', config: { identity: { name: 'Finance Agent', email: 'finance@agenticmail.io', avatar: null }, model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a finance agent that processes invoices, tracks expenses, generates financial reports, and manages budget alerts. All financial actions require human approval.', tools: ['file.read', 'database.query', 'email.send', 'spreadsheet.edit'], maxTokensPerTurn: 4096, budgetMonthly: 30 } },
    { id: 'agent-compliance-01', name: 'Compliance Monitor', orgId: ORG_ID, state: 'active', config: { identity: { name: 'Compliance Agent', email: 'compliance@agenticmail.io', avatar: null }, model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a compliance monitoring agent. Review agent activities for policy violations, generate compliance reports (SOC 2, GDPR), and flag potential security issues.', tools: ['audit.read', 'report.generate', 'email.send'], maxTokensPerTurn: 4096, budgetMonthly: 40 } },
  ];

  for (const a of agents) {
    await run(
      `INSERT INTO managed_agents (id, org_id, name, display_name, state, config, health, usage, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       ON CONFLICT (id) DO NOTHING`,
      [a.id, a.orgId, a.name.toLowerCase().replace(/\s+/g, '-'), a.name, a.state, JSON.stringify(a.config), JSON.stringify({ status: a.state === 'active' ? 'healthy' : 'paused', lastCheck: now }), JSON.stringify({ totalTasks: Math.floor(Math.random() * 500), totalTokens: Math.floor(Math.random() * 1000000), totalEmails: Math.floor(Math.random() * 200) }), now]
    );
    console.log(`  ✅ ${a.name} (${a.state})`);
  }

  // ═══════════════════════════════════════════════════════
  // 8. ACTION JOURNAL (sample audit entries)
  // ═══════════════════════════════════════════════════════
  console.log('\n📝 Creating action journal entries...');

  const journalEntries = [
    { agentId: 'agent-support-01', toolId: 'email-send', toolName: 'email.send', actionType: 'tool_call', forwardData: { to: 'customer@example.com', subject: 'RE: API rate limits inquiry', body: 'Thank you for reaching out...' } },
    { agentId: 'agent-support-01', toolId: 'kb-search', toolName: 'knowledge.search', actionType: 'tool_call', forwardData: { query: 'billing FAQ', knowledgeBase: 'platform-guide' } },
    { agentId: 'agent-research-01', toolId: 'web-search', toolName: 'web.search', actionType: 'tool_call', forwardData: { query: 'competitor pricing models Q1 2026', provider: 'brave' } },
    { agentId: 'agent-research-01', toolId: 'file-write', toolName: 'file.write', actionType: 'tool_call', forwardData: { path: 'reports/competitive-analysis-q1.pdf', size: 245760 }, reversible: true, reverseData: { action: 'delete', path: 'reports/competitive-analysis-q1.pdf' } },
    { agentId: 'agent-ops-01', toolId: 'gh-actions', toolName: 'github.actions', actionType: 'tool_call', forwardData: { repo: 'agenticmail/enterprise', workflow: 'deploy.yml', ref: 'v0.5.20' } },
    { agentId: 'agent-ops-01', toolId: 'email-send', toolName: 'email.send', actionType: 'tool_call', forwardData: { to: 'engineering@agenticmail.io', subject: 'Deployment v0.5.20 — Success', body: 'All health checks passed.' } },
    { agentId: 'agent-finance-01', toolId: 'db-query', toolName: 'database.query', actionType: 'tool_call', forwardData: { query: 'SELECT * FROM expenses WHERE month = 2026-01', database: 'accounting' } },
    { agentId: 'agent-compliance-01', toolId: 'audit-read', toolName: 'audit.read', actionType: 'tool_call', forwardData: { period: 'last_24h', scope: 'all_agents', actionsReviewed: 847 } },
    { agentId: 'agent-compliance-01', toolId: 'report-gen', toolName: 'report.generate', actionType: 'tool_call', forwardData: { type: 'soc2_weekly', findings: 2, severity: 'medium' } },
    { agentId: 'agent-support-01', toolId: 'email-send', toolName: 'email.send', actionType: 'dlp_blocked', forwardData: { to: 'customer@example.com', reason: 'SSN detected in email body', severity: 'critical' } },
  ];

  for (const j of journalEntries) {
    await run(
      `INSERT INTO action_journal (id, org_id, agent_id, tool_id, tool_name, action_type, forward_data, reverse_data, reversible, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [uid(), ORG_ID, j.agentId, j.toolId, j.toolName, j.actionType, JSON.stringify(j.forwardData), j.reverseData ? JSON.stringify(j.reverseData) : null, j.reversible ? 1 : 0, new Date(Date.now() - Math.random() * 7 * 86400000).toISOString()]
    );
  }
  console.log(`  ✅ ${journalEntries.length} journal entries`);

  // ═══════════════════════════════════════════════════════
  // 9. COMPLIANCE REPORTS
  // ═══════════════════════════════════════════════════════
  console.log('\n📊 Creating compliance reports...');

  const reports = [
    { type: 'soc2', agentId: null, status: 'completed', data: { framework: 'SOC 2 Type II', period: '2026-01-01 to 2026-01-31', findings: 3, critical: 0, high: 1, medium: 2, controls_assessed: 47, controls_passed: 44, summary: 'Overall compliance posture is strong. One high-severity finding related to incomplete API key rotation schedule. Two medium findings on documentation gaps.' } },
    { type: 'gdpr', agentId: null, status: 'completed', data: { framework: 'GDPR', period: '2026-01-01 to 2026-01-31', dataSubjectRequests: 5, requestsCompleted: 5, averageResponseDays: 12, piiInventoryItems: 234, retentionViolations: 0, summary: 'All data subject access requests fulfilled within 30-day window. PII inventory up to date. No retention policy violations.' } },
    { type: 'hipaa', agentId: null, status: 'completed', data: { framework: 'HIPAA', period: '2026-01-01 to 2026-01-31', phiAccessEvents: 128, authorizedAccess: 128, unauthorizedAttempts: 0, encryptionCompliance: '100%', auditLogIntegrity: 'verified', summary: 'Full HIPAA compliance maintained. All PHI access logged and authorized. Encryption at rest and in transit verified.' } },
  ];

  for (const r of reports) {
    await run(
      `INSERT INTO compliance_reports (id, org_id, type, title, parameters, status, data, format, generated_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'json', 'system', $8)
       ON CONFLICT (id) DO NOTHING`,
      [uid(), ORG_ID, r.type, r.data.framework + ' Report — Jan 2026', JSON.stringify({ period: r.data.period }), r.status, JSON.stringify(r.data), now]
    );
    console.log(`  ✅ ${r.type.toUpperCase()} report`);
  }

  // ═══════════════════════════════════════════════════════
  // SET ORG_ID on company_settings
  // ═══════════════════════════════════════════════════════
  console.log('\n🏢 Setting organization ID...');
  const orgIdGenerated = 'AMXK7W9P3E';
  await run(
    `UPDATE company_settings SET org_id = $1 WHERE id = 'default' AND (org_id IS NULL OR org_id = '')`,
    [orgIdGenerated]
  );
  console.log(`  ✅ Org ID set to: ${orgIdGenerated}`);

  console.log('\n✨ Seed complete! All data populated.\n');
  console.log('Summary:');
  console.log(`  📚 ${kbData.length} knowledge bases (${kbData.reduce((a, k) => a + k.documents.length, 0)} documents, ${kbData.reduce((a, k) => a + k.documents.reduce((b, d) => b + d.chunks.length, 0), 0)} chunks)`);
  console.log(`  📋 ${policies.length} approval policies`);
  console.log(`  🛡️ ${dlpRules.length} DLP rules`);
  console.log(`  🚧 ${guardrails.length} guardrail rules`);
  console.log(`  🧩 ${skills.length} community skills`);
  console.log(`  🔐 ${vaultEntries.length} vault entries`);
  console.log(`  🤖 ${agents.length} managed agents`);
  console.log(`  📝 ${journalEntries.length} journal entries`);
  console.log(`  📊 ${reports.length} compliance reports`);

  await pool.end();
}

seed().catch(err => { console.error('❌ Seed failed:', err.message); process.exit(1); });
