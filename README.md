# @agenticmail/enterprise

**Deploy and manage AI agents as employees in your organization.** Full platform for configuring agent skills, permissions, deployment targets, lifecycle management, and compliance — with a web dashboard and REST API.

AgenticMail Enterprise turns AI agents into managed employees. You define what an agent can do (skills, tools, permissions), where it runs (Docker, VPS, Fly.io, Railway), and how it's supervised (approval workflows, activity tracking, audit logs). The platform handles provisioning, health monitoring, auto-recovery, and multi-tenant isolation. Each agent gets its own email, workspace, and tool access — governed by policies you control from a single dashboard.

[![npm](https://img.shields.io/npm/v/@agenticmail/enterprise)](https://www.npmjs.com/package/@agenticmail/enterprise)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green)](https://nodejs.org)

---

## Table of Contents

- [Quick Start](#quick-start)
- [What This Does (Plain English)](#what-this-does-plain-english)
- [Architecture](#architecture)
- [Setup Wizard](#setup-wizard)
- [Database Support](#database-support)
- [The Engine](#the-engine)
  - [Skills & Permissions](#1-skills--permissions)
  - [Agent Configuration](#2-agent-configuration)
  - [Deployment Engine](#3-deployment-engine)
  - [Approval Workflows](#4-approval-workflows)
  - [Agent Lifecycle](#5-agent-lifecycle)
  - [Knowledge Base](#6-knowledge-base)
  - [Multi-Tenant Isolation](#7-multi-tenant-isolation)
  - [Activity Tracking](#8-activity-tracking)
  - [Tool Catalog](#9-tool-catalog)
  - [Runtime Hooks](#10-runtime-hooks)
  - [AgenticMail Bridge](#11-agenticmail-bridge)
- [REST API](#rest-api)
  - [Authentication](#authentication)
  - [Admin Endpoints](#admin-endpoints)
  - [Engine Endpoints](#engine-endpoints)
- [Dashboard](#dashboard)
- [Deployment](#deployment)
  - [AgenticMail Cloud](#agenticmail-cloud)
  - [Fly.io](#flyio)
  - [Docker](#docker)
  - [Local Development](#local-development)
- [Server Configuration](#server-configuration)
- [Middleware](#middleware)
- [Resilience](#resilience)
- [Programmatic Usage](#programmatic-usage)
- [Security](#security)
- [License](#license)

---

## Quick Start

```bash
npx @agenticmail/enterprise
```

The interactive wizard walks you through:
1. Company name and admin credentials
2. Database selection (10 backends supported)
3. Deployment target (Cloud, Fly.io, Docker, Railway, or Local)
4. Optional custom domain

Within 2 minutes you get a live dashboard URL with your admin account ready.

---

## What This Does (Plain English)

Think of AgenticMail Enterprise as an HR department for AI agents.

**The problem:** You want to deploy AI agents that do real work — answer customer emails, research topics, write reports, manage schedules. But right now, setting up each agent means manually configuring tools, permissions, credentials, deployment, and monitoring. Scale that to 10 or 50 agents across a team, and it becomes unmanageable.

**What Enterprise does:**

- **Hiring** — You pick from 38 pre-built skill sets (email management, web research, coding, customer support, etc.) and assign them to a new agent. The platform generates all the config files, workspace setup, and tool permissions automatically.

- **Onboarding** — The agent gets deployed to your chosen infrastructure (a Docker container, a VPS, Fly.io, Railway, or our managed cloud). It gets its own email address, API keys, and workspace. No manual setup.

- **Permissions** — You control exactly what each agent can and can't do. "This agent can send emails but not access the filesystem." "This agent can browse the web but needs approval before making purchases." Five preset permission profiles (Research Assistant, Customer Support, Developer, Full Access, Sandbox) or fully custom.

- **Supervision** — Sensitive actions trigger approval workflows. An agent wants to send an email to a client? It gets queued for human review first. You set the policies.

- **Health & Recovery** — The platform monitors every agent. If one crashes, it auto-restarts. If it's stuck, it gets flagged. You see everything in the dashboard — which agents are running, what they're doing, how much they cost.

- **Knowledge** — Agents can share knowledge bases. Upload documents, and the platform chunks them for retrieval. Agents search the knowledge base as part of their workflow.

- **Teams** — Multi-tenant isolation means different teams or clients get their own agents, data, and billing. Plan tiers (Free, Team, Enterprise, Self-Hosted) enforce limits.

- **Audit** — Every action is logged. Who did what, when, to which resource. Compliance teams can pull reports.

**In short:** You focus on what your agents should do. Enterprise handles how they run, where they run, and keeping them in line.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Dashboard (Web UI)                │
│              Single HTML · React 18 · CDN            │
└─────────────────────────┬────────────────────────────┘
                          │ HTTP
┌─────────────────────────▼────────────────────────────┐
│                   Hono API Server                    │
│                                                      │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────────┐ │
│  │  Auth    │  │  Admin   │  │       Engine          │ │
│  │  Routes  │  │  Routes  │  │                       │ │
│  │         │  │          │  │  Skills · Permissions  │ │
│  │  JWT    │  │  Users   │  │  Config · Deployer    │ │
│  │  Login  │  │  Agents  │  │  Approvals · Lifecycle│ │
│  │  Keys   │  │  Audit   │  │  Knowledge · Tenants  │ │
│  │         │  │  Keys    │  │  Activity · Hook      │ │
│  └─────────┘  └──────────┘  └──────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │               Middleware Stack                    │  │
│  │  Rate Limit · CORS · Security Headers · Audit   │  │
│  │  Request ID · Error Handler · RBAC              │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │               Resilience Layer                   │  │
│  │  Circuit Breaker · Health Monitor · Retry       │  │
│  │  Rate Limiter · Keyed Rate Limiter              │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────┬────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────┐
│              Database Adapter (Abstract)               │
│                                                       │
│  SQLite · Postgres · MySQL · MongoDB · DynamoDB      │
│  Turso · Supabase · Neon · PlanetScale · CockroachDB │
└──────────────────────────────────────────────────────┘
```

---

## Setup Wizard

The CLI wizard (`npx @agenticmail/enterprise`) runs in 4 steps:

### Step 1: Company Info
- Company name (used to generate your subdomain)
- Admin email and password

### Step 2: Database
Choose from 10 supported backends. Each asks for its specific connection details:
- **SQLite** — file path (default: `./agenticmail-enterprise.db`)
- **PostgreSQL / Supabase / Neon / CockroachDB** — connection string
- **MySQL / PlanetScale** — connection string
- **MongoDB** — connection URI
- **DynamoDB** — AWS region + credentials
- **Turso / LibSQL** — database URL + auth token

### Step 3: Deployment Target
- **AgenticMail Cloud** — managed hosting, instant URL (`company.agenticmail.io`)
- **Fly.io** — generates `fly.toml`, you deploy to your Fly account
- **Railway** — generates Railway config
- **Docker** — generates `docker-compose.yml` for self-hosting
- **Local** — starts the server immediately on localhost (dev/testing)

### Step 4: Custom Domain (optional)
Add a custom domain (e.g., `agents.agenticmail.io`) with CNAME setup instructions.

---

## Database Support

Enterprise uses an abstract `DatabaseAdapter` interface. All 10 backends implement the same methods — you pick the one that fits your infrastructure.

| Database | Type | Connection | Best For |
|----------|------|------------|----------|
| **SQLite** | Embedded SQL | File path | Local dev, single-server, prototyping |
| **PostgreSQL** | Hosted SQL | Connection string | Production, most cloud providers |
| **MySQL** | Hosted SQL | Connection string | Existing MySQL infrastructure |
| **MongoDB** | NoSQL | Connection URI | Document-oriented workloads |
| **DynamoDB** | NoSQL | AWS credentials | AWS-native, serverless scale |
| **Turso / LibSQL** | Edge SQL | URL + token | Edge deployments, global distribution |
| **Supabase** | Managed Postgres | Connection string | Supabase ecosystem |
| **Neon** | Serverless Postgres | Connection string | Serverless, branching |
| **PlanetScale** | Managed MySQL | Connection string | PlanetScale ecosystem |
| **CockroachDB** | Distributed SQL | Connection string | Multi-region, high availability |

### Adapter Pattern

Every adapter extends `DatabaseAdapter` and implements:

```typescript
// Core operations
migrate(): Promise<void>
disconnect(): Promise<void>
getStats(): Promise<Stats>

// Users
createUser(input: UserInput): Promise<User>
getUserByEmail(email: string): Promise<User | null>
validatePassword(email: string, password: string): Promise<User | null>

// Agents
createAgent(input: AgentInput): Promise<Agent>
listAgents(filters?): Promise<Agent[]>
getAgent(id: string): Promise<Agent | null>
updateAgent(id: string, updates): Promise<Agent>
deleteAgent(id: string): Promise<void>

// API Keys
createApiKey(input: ApiKeyInput): Promise<ApiKey>
validateApiKey(key: string): Promise<ApiKey | null>
revokeApiKey(id: string): Promise<void>

// Audit Log
logEvent(event: AuditEvent): Promise<void>
getAuditLog(filters: AuditFilters): Promise<AuditEvent[]>

// Settings
getSettings(): Promise<CompanySettings>
updateSettings(updates): Promise<CompanySettings>
```

### MongoDB Notes
- Uses `_id` field directly (stores `randomUUID()` as `_id`)
- Indexes created on `email`, `apiKey`, `createdAt`

### DynamoDB Notes
- Single-table design with PK prefix pattern (`USER#`, `AGENT#`, `KEY#`, `AUDIT#`)
- GSI1 for secondary access patterns
- All entities in one table for cost efficiency

### Creating a Custom Adapter

```typescript
import { DatabaseAdapter } from '@agenticmail/enterprise';

class MyAdapter extends DatabaseAdapter {
  async migrate() { /* create tables/collections */ }
  async createUser(input) { /* ... */ }
  // ... implement all abstract methods
}
```

---

## The Engine

The Engine is the brain of Enterprise — 11 subsystems that handle everything from "what can this agent do?" to "deploy it to production and watch it run."

### 1. Skills & Permissions

**38 built-in skills** organized into categories:

| Category | Skills |
|----------|--------|
| Communication | Email Management, SMS & Phone, Calendar, Messaging |
| Research | Web Search, Web Browsing, News Monitoring, Academic Research |
| Development | Code Execution, Git & GitHub, Database, API Integration |
| Content | Writing, Image Generation, Audio/TTS, Video Processing |
| Productivity | Task Management, Note Taking, File Management, Spreadsheets |
| System | System Administration, Docker, Network, Security |
| AI/ML | Model Inference, RAG/Knowledge Base, Agent Orchestration |
| Business | CRM, Analytics, Billing, HR |
| IoT/Smart Home | Home Automation, Camera/Surveillance, Media Playback |
| Custom | Custom Tools (user-defined) |

Each skill defines:
- **Tools** — which tool IDs are included (mapped to registered AgenticMail tool IDs)
- **Config fields** — what settings the skill needs (API keys, hostnames, etc.)
- **Risk level** — low, medium, high, critical
- **Side effects** — what the skill can affect (network, filesystem, email, etc.)

**5 preset permission profiles:**

| Profile | Description | Tools | Risk |
|---------|-------------|-------|------|
| Research Assistant | Web search, reading, note-taking | ~25 | Low |
| Customer Support | Email, messaging, CRM, KB search | ~35 | Medium |
| Developer | Code, Git, Docker, APIs, databases | ~45 | High |
| Full Access | Everything enabled | All | Critical |
| Sandbox | Minimal tools, no external access | ~10 | Low |

**How permissions work:**

```typescript
const engine = new PermissionEngine();

// Check if an agent can use a tool
const result = engine.checkPermission(agentProfile, 'agenticmail_send');
// → { allowed: true, reason: 'Granted by Email Management skill' }

// Or with approval required
const result2 = engine.checkPermission(agentProfile, 'exec');
// → { allowed: false, requiresApproval: true, reason: 'Code Execution requires admin approval' }
```

### 2. Agent Configuration

Generates all the files an agent needs to run:

- **SOUL.md** — personality, tone, boundaries
- **AGENTS.md** — workspace conventions
- **USER.md** — who the agent serves
- **TOOLS.md** — environment-specific tool notes
- **Gateway config** — agent runtime gateway config with plugins, channels, tool policies
- **Deploy scripts** — Dockerfile, docker-compose, startup scripts

```typescript
const generator = new AgentConfigGenerator();
const config = generator.generate({
  name: 'support-bot',
  role: 'Customer Support Agent',
  skills: ['email-management', 'crm', 'knowledge-base'],
  channels: [{ type: 'email' }, { type: 'slack', webhook: '...' }],
  deployment: { target: 'docker' },
});
// → { workspace: { 'SOUL.md': '...', ... }, gateway: { ... }, deploy: { ... } }
```

### 3. Deployment Engine

Provisions and manages agent infrastructure:

- **Docker** — Generates Dockerfile + compose, builds image, starts container
- **VPS** — SSH into a server, install dependencies, configure systemd service
- **Fly.io** — Creates Fly app, sets secrets, deploys
- **Railway** — Generates Railway config, links project

Each deployment goes through phases:
1. **Validate** — check config, verify credentials
2. **Provision** — create infrastructure resources
3. **Configure** — write config files, set environment variables
4. **Deploy** — push code/image, start the agent
5. **Verify** — health check, confirm agent is responding

```typescript
const deployer = new DeploymentEngine();
const result = await deployer.deploy({
  agentId: 'agent-123',
  target: 'docker',
  config: { /* ... */ },
});
// → { status: 'deployed', url: 'http://...', phases: [...] }
```

### 4. Approval Workflows

Human-in-the-loop for sensitive operations. **All data persisted to database.**

- Define **policies** — which actions need approval and from whom
- Agents **request** approval when they hit a policy boundary
- Admins **approve or reject** from the dashboard or via API
- Supports **auto-approve** rules (e.g., "auto-approve emails to internal domains")
- **Escalation** — unreviewed requests escalate after a configurable timeout
- **Persistence** — pending requests and policies survive server restarts

```typescript
const approvals = new ApprovalEngine();
await approvals.setDb(engineDb); // Wire to database, loads pending requests

// Create a policy
approvals.addPolicy({
  id: crypto.randomUUID(),
  name: 'External Email Review',
  triggers: { sideEffects: ['email'] },
  approvers: { userIds: [], roles: ['admin'], requireMultiple: 1 },
  timeout: { minutes: 60, defaultAction: 'deny' },
  notify: { channels: ['webhook'] },
  enabled: true,
}, 'org-id');

// Agent requests approval
const request = await approvals.requestApproval({
  agentId: 'agent-123',
  agentName: 'Support Bot',
  toolId: 'agenticmail_send',
  toolName: 'Send Email',
  riskLevel: 'medium',
  sideEffects: ['email'],
  orgId: 'org-id',
});
// → { id: 'req-456', status: 'pending' } — persisted to DB

// Admin approves
approvals.decide('req-456', { action: 'approve', by: 'admin-1' });
// → Updates both in-memory and DB
```

### 5. Agent Lifecycle

State machine for agent lifecycle management. **All state persisted to database.**

```
draft → configuring → ready → provisioning → deploying → starting → running
                                                                      ↕
                                                                   degraded
                                                                      ↓
                                         stopped ← error ← destroying
```

- **12 states** — draft, configuring, ready, provisioning, deploying, starting, running, degraded, stopped, error, updating, destroying
- **Health checks** — 30-second polling loop, response time tracking, error rate monitoring
- **Auto-recovery** — restarts after 5 consecutive health failures
- **Budget enforcement** — auto-stops when monthly token or cost budget exceeded
- **State transitions** — every transition persisted to `agent_state_history` table
- **Persistence** — all agent data written through to `managed_agents` table, loaded from DB on startup

```typescript
const lifecycle = new AgentLifecycleManager({ permissions: permissionEngine });
await lifecycle.setDb(engineDb); // Wire to database, loads all agents

// Create an agent
const agent = await lifecycle.createAgent('org-id', agentConfig, 'admin-1');
// → Persisted to managed_agents table

// Deploy
await lifecycle.deploy(agent.id, 'admin-1');
// → Provisions infrastructure, starts container, begins health check loop

// Get agent status
const status = lifecycle.getAgent(agent.id);
// → { state: 'running', health: { status: 'healthy', uptime: 86400 }, usage: { tokensToday: 150000, costToday: 1.25 } }

// Stop
await lifecycle.stop(agent.id, 'admin-1', 'Maintenance window');
```

### 6. Knowledge Base

Document ingestion and retrieval for agent knowledge. **All data persisted to database.**

- **Upload documents** — PDF, Markdown, plain text, HTML, CSV
- **Chunking** — automatic splitting with configurable chunk size and overlap
- **Embeddings** — OpenAI text-embedding-3-small (optional, falls back to keyword matching)
- **Semantic search** — cosine similarity on embeddings, keyword fallback
- **RAG context** — generates context string for agent prompts with token budget
- **Per-agent or shared** — knowledge bases can be private or shared across agents
- **Persistence** — KBs, documents, and chunks persisted to 3 tables. Embeddings stored as binary blobs.

```typescript
const kb = new KnowledgeBaseEngine();
await kb.setDb(engineDb); // Wire to database, loads all KBs + embeddings

// Create a knowledge base
const base = kb.createKnowledgeBase('org-id', {
  name: 'Company Policies',
  agentIds: ['agent-1', 'agent-2'],
  config: { embeddingProvider: 'openai', chunkSize: 512 },
});
// → Persisted to knowledge_bases table

// Ingest a document
const doc = await kb.ingestDocument(base.id, {
  name: 'PTO Policy',
  content: '...',
  sourceType: 'text',
  mimeType: 'text/markdown',
});
// → Chunked, embedded, persisted to kb_documents + kb_chunks tables

// Search
const results = await kb.search('agent-1', 'how many vacation days');
// → [{ chunk: { content: '...' }, document: { name: 'PTO Policy' }, score: 0.92 }]

// Get RAG context for an agent prompt
const context = await kb.getContext('agent-1', 'vacation policy', 2000);
// → "## Relevant Knowledge Base Context\n\n### From: PTO Policy\n..."
```

### 7. Multi-Tenant Isolation

Organizations, plans, and resource limits. **All data persisted to database.**

For SaaS deployments, companies sharing infrastructure get strict data separation. For self-hosted / open-source, single-tenant mode uses a default org with no limits.

**Plan Tiers:**

| Feature | Free | Team | Enterprise | Self-Hosted |
|---------|------|------|-----------|-------------|
| Agents | 3 | 25 | Unlimited | Unlimited |
| Users | 5 | 50 | Unlimited | Unlimited |
| Knowledge Bases | 1 | 10 | 999 | 999 |
| Storage | 100 MB | 5 GB | 100 GB | Unlimited |
| Token Budget (monthly) | 1M | 10M | Unlimited | Unlimited |
| API Calls/min | 30 | 120 | 600 | 999 |
| SSO | - | Yes | Yes | Yes |
| Audit Retention | 30 days | 90 days | 365 days | 365 days |
| Custom Domain | - | - | Yes | Yes |
| White-Label | - | - | Yes | Yes |
| Deploy Targets | Docker, Local | Docker, VPS, Fly, Railway, Local | All | All |
| Custom Skills | - | Yes | Yes | Yes |
| Data Residency | - | - | Yes | Yes |

```typescript
const tenants = new TenantManager();
await tenants.setDb(engineDb); // Wire to database, loads all orgs

// Create an organization
const org = tenants.createOrg({
  name: 'AgenticMail Inc',
  slug: 'agenticmail',
  plan: 'team',
  adminEmail: 'admin@agenticmail.io',
});
// → Persisted to organizations table

// Check limits before creating an agent
const check = tenants.checkLimit(org.id, 'maxAgents');
// → { allowed: true, limit: 25, current: 5, remaining: 20 }

// Check feature gates
tenants.hasFeature(org.id, 'sso'); // → true (team plan)
tenants.hasFeature(org.id, 'white-label'); // → false (enterprise only)
tenants.canDeployTo(org.id, 'aws'); // → false (team plan)

// Record usage
tenants.recordUsage(org.id, { tokensThisMonth: 50000, costThisMonth: 0.42 });
// → Persisted to database

// Upgrade plan
tenants.changePlan(org.id, 'enterprise');
// → Limits updated, persisted

// Single-tenant mode (self-hosted)
tenants.createDefaultOrg(); // Creates 'default' org with self-hosted plan
tenants.isSingleTenant(); // → true
```

### 8. Activity Tracking

Real-time monitoring of everything agents do. **All data persisted to database (fire-and-forget).**

- **Events** — lifecycle state changes, errors, custom events per agent/org
- **Tool calls** — tool ID, arguments, result, duration, success/failure. Start/end tracked separately.
- **Conversations** — session-based message recording with role, token count, cost
- **Timeline** — chronological per-agent daily view of all activity
- **SSE streaming** — real-time event stream with heartbeats, filterable by org/agent
- **Aggregations** — event/tool call/conversation counts, cost summaries
- **In-memory buffer** — recent events kept in memory for fast dashboard queries; all writes fire-and-forget to DB

```typescript
const activity = new ActivityTracker();
activity.setDb(engineDb); // Wire to database (no loadFromDb — high-volume, uses buffer)

// Record an event (fire-and-forget to DB)
activity.record({
  agentId: 'agent-123',
  orgId: 'org-456',
  type: 'tool_call',
  data: { tool: 'agenticmail_send', to: 'user@example.com' },
});

// Track a tool call with start/end
const callId = activity.startToolCall({
  agentId: 'agent-123', orgId: 'org-456',
  toolId: 'agenticmail_send', toolName: 'Send Email',
  args: { to: 'user@example.com', subject: 'Hello' },
});
// ... tool executes ...
activity.endToolCall(callId, { success: true, result: 'Sent', durationMs: 450 });

// Record a conversation message
activity.recordMessage({
  agentId: 'agent-123', orgId: 'org-456', sessionId: 'sess-789',
  role: 'assistant', content: 'I sent the email.',
  tokenCount: 150, costUsd: 0.001,
});

// Get agent timeline for a specific day
const timeline = activity.getTimeline('agent-123', '2026-02-18');

// Get aggregate stats
const stats = activity.getStats('org-456');
// → { events: 1542, toolCalls: 380, conversations: 45 }

// Subscribe to real-time events (used by SSE endpoint)
const unsubscribe = activity.subscribe((event) => {
  console.log('New event:', event.type, event.agentId);
});
```

### 9. Tool Catalog

Maps AgenticMail tool IDs to skills:

- **129 total tools** cataloged (24 core platform + 63 AgenticMail MCP + 42 shell commands)
- Each tool mapped to one or more skills
- Used by the Permission Engine to resolve skill → tool access

```typescript
import { ALL_TOOLS, getToolsBySkill, generateToolPolicy } from '@agenticmail/enterprise';

// Get all tools for a skill
const emailTools = getToolsBySkill('email-management');
// → ['agenticmail_send', 'agenticmail_inbox', 'agenticmail_reply', ...]

// Generate tool policy
const policy = generateToolPolicy(['email-management', 'web-search']);
// → { allow: ['agenticmail_send', ...], deny: [...] }
```

### 10. Runtime Hooks

Lifecycle hooks for intercepting agent tool calls at runtime. See `src/runtime/hooks.ts`.

- **Permission enforcement** — checks every tool call against the agent's permission profile
- **Activity logging** — records tool calls to the activity tracker
- **Approval gating** — blocks tool calls that require approval
- **Permission caching** — avoids repeated DB lookups on high-frequency calls

```typescript
import { createEnterpriseHook } from '@agenticmail/enterprise';

const hook = createEnterpriseHook({
  apiUrl: 'http://localhost:3000',
  apiKey: 'ek_...',
  agentId: 'agent-123',
});

// hook.beforeToolCall(toolName, args) → { allowed, requiresApproval, reason }
// hook.afterToolCall(toolName, result, duration) → void (logs activity)
```

### 11. AgenticMail Bridge

Connects the Engine to an existing AgenticMail instance:

- **Account sync** — creates/manages agent email accounts
- **Tool interception** — wraps AgenticMail tool calls with permission checks
- **Event forwarding** — pipes AgenticMail events (new email, task completion) to the activity tracker

```typescript
import { createAgenticMailBridge } from '@agenticmail/enterprise';

const bridge = createAgenticMailBridge({
  agenticmailUrl: 'http://localhost:3100',
  masterKey: 'mk_...',
});

// Sync an agent's email account
await bridge.ensureAgent({ name: 'support-bot', role: 'customer-support' });
```

---

## REST API

### Authentication

Two methods:

**JWT Token** (for dashboard users):
```
POST /auth/login
{ "email": "admin@agenticmail.io", "password": "..." }
→ { "token": "eyJ...", "user": { ... } }

# Then:
Authorization: Bearer eyJ...
```

**API Key** (for programmatic access):
```
X-API-Key: ek_abc123...
```

API keys have scoped permissions and are created through the admin API.

### Auth Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Email/password login (sets httpOnly cookies + returns JWT) |
| POST | `/auth/refresh` | Refresh session using refresh token/cookie |
| GET | `/auth/me` | Get current authenticated user |
| POST | `/auth/logout` | Clear session cookies |
| POST | `/auth/saml/callback` | SAML 2.0 assertion callback (stub — 501) |
| GET | `/auth/saml/metadata` | SAML SP metadata (stub — 501) |
| GET | `/auth/oidc/authorize` | OIDC authorization redirect (stub — 501) |
| GET | `/auth/oidc/callback` | OIDC callback (stub — 501) |

### Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stats` | Dashboard statistics (agents, users, keys count) |
| GET | `/api/agents` | List agents (supports `status`, `limit`, `offset`) |
| POST | `/api/agents` | Create agent (validates name, email, role) |
| GET | `/api/agents/:id` | Get agent details |
| PATCH | `/api/agents/:id` | Update agent (name, email, role, status) |
| POST | `/api/agents/:id/archive` | Archive agent |
| POST | `/api/agents/:id/restore` | Restore archived agent |
| DELETE | `/api/agents/:id` | Permanently delete agent (admin only) |
| GET | `/api/users` | List users (admin only) |
| POST | `/api/users` | Create user (admin only, validates email/role) |
| PATCH | `/api/users/:id` | Update user (admin only) |
| DELETE | `/api/users/:id` | Delete user (owner only, cannot delete self) |
| GET | `/api/audit` | Query audit log (supports actor, action, resource, date range, pagination) |
| GET | `/api/api-keys` | List API keys (admin only, hashes redacted) |
| POST | `/api/api-keys` | Create API key (admin only, returns plaintext once) |
| DELETE | `/api/api-keys/:id` | Revoke API key (admin only) |
| GET | `/api/rules` | List email rules (optional `agentId` filter) |
| POST | `/api/rules` | Create email rule |
| PATCH | `/api/rules/:id` | Update email rule |
| DELETE | `/api/rules/:id` | Delete email rule |
| GET | `/api/settings` | Get company settings (sensitive fields redacted) |
| PATCH | `/api/settings` | Update company settings (admin only) |
| GET | `/api/retention` | Get data retention policy (admin only) |
| PUT | `/api/retention` | Set data retention policy (owner only) |

### Engine Endpoints

**Skills & Permissions:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/engine/skills` | List all 38 skills with categories |
| GET | `/api/engine/skills/by-category` | Skills grouped by category |
| GET | `/api/engine/skills/:id` | Get skill details + tools |
| GET | `/api/engine/profiles/presets` | List 5 permission presets |
| GET | `/api/engine/profiles/:agentId` | Get agent's permission profile |
| PUT | `/api/engine/profiles/:agentId` | Update agent's permission profile |
| POST | `/api/engine/profiles/:agentId/apply-preset` | Apply a preset to agent |
| POST | `/api/engine/permissions/check` | Check if agent can use a tool |
| GET | `/api/engine/permissions/:agentId/tools` | List tools available to agent |
| GET | `/api/engine/permissions/:agentId/policy` | Generate tool policy |

**Agent Lifecycle:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/engine/agents` | Create engine agent (orgId, config, createdBy) |
| GET | `/api/engine/agents` | List engine agents (requires `orgId` query) |
| GET | `/api/engine/agents/:id` | Get engine agent with state, health, usage |
| PATCH | `/api/engine/agents/:id/config` | Update agent config |
| POST | `/api/engine/agents/:id/deploy` | Deploy agent to target infrastructure |
| POST | `/api/engine/agents/:id/stop` | Stop a running agent |
| POST | `/api/engine/agents/:id/restart` | Restart agent |
| POST | `/api/engine/agents/:id/hot-update` | Hot-update config without restart |
| DELETE | `/api/engine/agents/:id` | Destroy agent and clean up resources |
| GET | `/api/engine/agents/:id/usage` | Agent resource usage, health, state |
| GET | `/api/engine/usage/:orgId` | Aggregate org usage across all agents |

**Config Generation:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/engine/config/workspace` | Generate workspace files (SOUL.md, TOOLS.md, etc.) |
| POST | `/api/engine/config/gateway` | Generate gateway config |
| POST | `/api/engine/config/docker-compose` | Generate docker-compose.yml |
| POST | `/api/engine/config/systemd` | Generate systemd service unit |
| POST | `/api/engine/config/deploy-script` | Generate VPS deploy script |

**Knowledge Base:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/engine/knowledge-bases` | Create knowledge base |
| GET | `/api/engine/knowledge-bases` | List KBs (filter by `orgId` or `agentId`) |
| GET | `/api/engine/knowledge-bases/:id` | Get KB details with documents |
| POST | `/api/engine/knowledge-bases/:id/documents` | Ingest document (chunked + embedded) |
| DELETE | `/api/engine/knowledge-bases/:kbId/documents/:docId` | Delete document |
| POST | `/api/engine/knowledge-bases/search` | Semantic search across KBs |
| POST | `/api/engine/knowledge-bases/context` | Get RAG context for agent prompt |
| DELETE | `/api/engine/knowledge-bases/:id` | Delete knowledge base |

**Organizations (Tenants):**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/engine/orgs` | Create organization |
| GET | `/api/engine/orgs` | List all organizations |
| GET | `/api/engine/orgs/:id` | Get organization details |
| GET | `/api/engine/orgs/slug/:slug` | Get organization by slug |
| POST | `/api/engine/orgs/:id/check-limit` | Check plan resource limits |
| POST | `/api/engine/orgs/:id/check-feature` | Check feature gate |
| POST | `/api/engine/orgs/:id/change-plan` | Change organization plan |

**Approvals:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/engine/approvals/pending` | List pending approvals (optional `agentId` filter) |
| GET | `/api/engine/approvals/history` | Approval history (supports `agentId`, `limit`, `offset`) |
| GET | `/api/engine/approvals/:id` | Get approval request details |
| POST | `/api/engine/approvals/:id/decide` | Approve or reject a request |
| GET | `/api/engine/approvals/policies` | List approval policies |
| POST | `/api/engine/approvals/policies` | Create approval policy |
| DELETE | `/api/engine/approvals/policies/:id` | Delete approval policy |

**Activity & Monitoring:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/engine/activity/events` | Activity events (filter by `agentId`, `orgId`, `since`, `limit`) |
| GET | `/api/engine/activity/tool-calls` | Tool call records (filter by `agentId`, `orgId`, `toolId`) |
| GET | `/api/engine/activity/conversation/:sessionId` | Conversation entries for a session |
| GET | `/api/engine/activity/timeline/:agentId/:date` | Daily timeline for an agent |
| GET | `/api/engine/activity/stats` | Aggregate activity stats (optional `orgId`) |
| GET | `/api/engine/activity/stream` | SSE real-time event stream (filter by `orgId`, `agentId`) |

**Dashboard Stats & Schema:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/engine/stats/:orgId` | Org dashboard stats (agents, usage, real-time) |
| POST | `/api/engine/schema/tables` | Create dynamic `ext_*` table |
| GET | `/api/engine/schema/tables` | List dynamic tables |
| POST | `/api/engine/schema/query` | Query dynamic tables (SELECT any, mutations ext_* only) |

---

## Dashboard

The admin dashboard is a single HTML file using React 18 from CDN — no build step required. It includes:

- **Login page** with JWT authentication
- **Overview** with agent counts, activity stats, system health
- **Agent management** — create, configure, deploy, monitor
- **Audit log** — searchable, filterable event history
- **API key management** — create scoped keys, revoke
- **Settings** — company info, custom domain, plan management
- **Dark and light mode** themes

The dashboard is served automatically at `/dashboard` when the server starts. It communicates with the API using the same JWT/API key auth as any other client.

### Building Your Own Frontend

The dashboard is a reference implementation. You can build your own UI by hitting the REST API directly. Every API response follows a consistent format:

```json
{
  "data": { ... },
  "meta": { "total": 42, "page": 1, "limit": 20 }
}
```

Errors:
```json
{
  "error": "Description of what went wrong",
  "code": "VALIDATION_ERROR",
  "details": { ... }
}
```

---

## Deployment

### AgenticMail Cloud

Managed hosting on Fly.io infrastructure. Instant URL at `company.agenticmail.io`.

```bash
npx @agenticmail/enterprise
# → Select "AgenticMail Cloud"
# → Dashboard live at https://agenticmail-inc.agenticmail.io
```

Optional custom domain via CNAME:
```
agents.agenticmail.io → agenticmail-inc.agenticmail.io
```

### Fly.io

Deploy to your own Fly.io account:

```bash
npx @agenticmail/enterprise
# → Select "Fly.io"
# → Generates fly.toml

fly launch --copy-config
fly secrets set DATABASE_URL="..." JWT_SECRET="..."
fly deploy
```

### Docker

Self-hosted with Docker Compose:

```bash
npx @agenticmail/enterprise
# → Select "Docker"
# → Generates docker-compose.yml

docker compose up -d
# → Dashboard at http://localhost:3000
```

### Local Development

Start immediately for testing:

```bash
npx @agenticmail/enterprise
# → Select "Local"
# → Server runs on http://localhost:3000
```

---

## Server Configuration

```typescript
import { createAdapter, createServer } from '@agenticmail/enterprise';

const db = await createAdapter({
  type: 'postgres',
  connectionString: 'postgresql://user:pass@host:5432/db',
});
await db.migrate();

const server = createServer({
  port: 3000,
  db,
  jwtSecret: 'your-secret-here',

  // Optional
  corsOrigins: ['https://app.agenticmail.io'],
  rateLimit: 120,            // requests per minute per IP
  trustedProxies: ['10.0.0.0/8'],
  logging: true,
});

await server.start();
```

---

## Middleware

All middleware is exported for use in custom server setups:

| Middleware | Description |
|-----------|-------------|
| `requestIdMiddleware()` | Adds `X-Request-Id` header to every request |
| `requestLogger()` | Logs method, path, status, duration |
| `rateLimiter(opts)` | Per-IP rate limiting with configurable window |
| `securityHeaders()` | Sets security headers (CSP, HSTS, X-Frame-Options, etc.) |
| `errorHandler()` | Catches unhandled errors, returns JSON |
| `auditLogger(db)` | Logs all mutations to the audit trail |
| `requireRole(role)` | RBAC middleware — requires specific user role |
| `validate(schema)` | Request body validation |

---

## Resilience

Built-in resilience primitives:

| Component | Description |
|-----------|-------------|
| `CircuitBreaker` | Fails fast after N consecutive errors, auto-recovers after cooldown |
| `HealthMonitor` | Periodic health checks with configurable thresholds |
| `withRetry(fn, opts)` | Retry with exponential backoff |
| `RateLimiter` | Token bucket rate limiter |
| `KeyedRateLimiter` | Per-key rate limiting (e.g., per-user, per-IP) |

```typescript
import { CircuitBreaker, withRetry, HealthMonitor } from '@agenticmail/enterprise';

// Circuit breaker wrapping a database call
const breaker = new CircuitBreaker({ failureThreshold: 5, recoveryTimeMs: 30000 });
const result = await breaker.execute(() => db.query('SELECT ...'));

// Retry with backoff
const data = await withRetry(() => fetch('https://api.example.com'), {
  maxRetries: 3,
  baseDelayMs: 1000,
  backoffMultiplier: 2,
});
```

---

## Programmatic Usage

Use Enterprise as a library in your own application:

```typescript
import {
  // Database
  createAdapter,
  
  // Server
  createServer,
  
  // Engine
  PermissionEngine,
  BUILTIN_SKILLS,
  PRESET_PROFILES,
  AgentConfigGenerator,
  DeploymentEngine,
  ApprovalEngine,
  AgentLifecycleManager,
  KnowledgeBaseEngine,
  TenantManager,
  ActivityTracker,
  
  // Tool catalog
  ALL_TOOLS,
  getToolsBySkill,
  generateToolPolicy,

  // Engine persistence
  EngineDatabase,

  // Runtime hooks & bridge
  createEnterpriseHook,
  createAgenticMailBridge,
  
  // Resilience
  CircuitBreaker,
  withRetry,
  HealthMonitor,
  
  // Middleware (for custom servers)
  rateLimiter,
  auditLogger,
  requireRole,
} from '@agenticmail/enterprise';
```

---

## Security

- **JWT authentication** with configurable secret and expiry
- **API key authentication** with scoped permissions
- **RBAC** — owner, admin, member, viewer roles
- **Rate limiting** — per-IP, configurable limits
- **Audit logging** — every mutation logged with actor, action, resource, timestamp
- **Outbound email scanning** — inherited from AgenticMail core (blocks PII, credentials, secrets)
- **Security headers** — CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- **Input validation** — all API inputs validated before processing
- **Circuit breaker** — protects against cascading failures
- **Graceful shutdown** — clean connection teardown on SIGINT/SIGTERM

---

## Project Structure

```
enterprise/src/
├── cli.ts                      # CLI entry point (npx @agenticmail/enterprise)
├── server.ts                   # Hono server: middleware, auth, route mounting
├── index.ts                    # Public API exports
│
├── auth/
│   └── routes.ts               # JWT login, cookies, refresh, SAML/OIDC stubs
│
├── admin/
│   └── routes.ts               # Users, Agents, API Keys, Audit, Settings, Rules CRUD
│
├── middleware/
│   └── index.ts                # Rate limiter, security headers, audit logger, RBAC, error handler
│
├── lib/
│   └── resilience.ts           # CircuitBreaker, HealthMonitor, withRetry, RateLimiter
│
├── db/                         # Admin database adapters (6 backends)
│   ├── adapter.ts              # Abstract DatabaseAdapter interface
│   ├── factory.ts              # createAdapter() factory
│   ├── sql-schema.ts           # Shared SQL DDL + migrations
│   ├── sqlite.ts               # SQLite (better-sqlite3)
│   ├── postgres.ts             # PostgreSQL (pg)
│   ├── mysql.ts                # MySQL (mysql2)
│   ├── mongodb.ts              # MongoDB
│   ├── dynamodb.ts             # DynamoDB (@aws-sdk)
│   └── turso.ts                # Turso/LibSQL (@libsql/client)
│
├── engine/                     # Agent management platform (11 subsystems)
│   ├── index.ts                # Public re-exports
│   ├── routes.ts               # All engine REST endpoints (50+)
│   ├── skills.ts               # 38 skills, 5 presets, PermissionEngine (DB-persisted)
│   ├── agent-config.ts         # AgentConfigGenerator: workspace, gateway, docker-compose, systemd
│   ├── deployer.ts             # DeploymentEngine: Docker, VPS/SSH, Fly.io, Railway
│   ├── lifecycle.ts            # AgentLifecycleManager: state machine, health checks (DB-persisted)
│   ├── approvals.ts            # ApprovalEngine: policies, requests, decisions (DB-persisted)
│   ├── knowledge.ts            # KnowledgeBaseEngine: docs, chunking, embeddings, RAG (DB-persisted)
│   ├── tenant.ts               # TenantManager: orgs, plans, limits, usage (DB-persisted)
│   ├── activity.ts             # ActivityTracker: events, tool calls, conversations, SSE (DB-persisted)
│   ├── tool-catalog.ts         # 167 tool IDs mapped to skills
│   ├── runtime/                # Runtime hooks (permission enforcement, activity logging)
│   ├── agenticmail-bridge.ts   # Bridge to AgenticMail API
│   ├── db-adapter.ts           # EngineDatabase wrapper (all CRUD implemented)
│   └── db-schema.ts            # Engine DDL: 15 tables, versioned migrations, dialect converters
│
├── deploy/                     # Cloud deployment
│   ├── fly.ts                  # Fly.io Machines API
│   └── managed.ts              # Managed cloud provisioning
│
├── setup/                      # CLI setup wizard
│   ├── index.ts                # Wizard orchestrator
│   ├── company.ts              # Company info prompts
│   ├── database.ts             # Database selection
│   ├── deployment.ts           # Deployment target
│   ├── domain.ts               # Custom domain
│   └── provision.ts            # Provisioning logic
│
└── dashboard/
    └── index.html              # Admin UI (single HTML, React 18 from CDN)
```

---

## Author

Created by **[Ope Olatunji](https://github.com/ope-olatunji)**.

Part of the [AgenticMail](https://github.com/agenticmail/agenticmail) project — the first platform to give AI agents real email addresses and phone numbers.

- GitHub: [@ope-olatunji](https://github.com/ope-olatunji)
- Website: [agenticmail.io](https://agenticmail.io)
- Twitter: [@agenticmail](https://x.com/agenticmail)

## License

MIT — see [LICENSE](./LICENSE)
