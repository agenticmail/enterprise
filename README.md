# @agenticmail/enterprise

**AI Agent Identity, Email & Workforce Platform for Organizations**

Deploy, manage, and govern AI agents as first-class employees — each with their own email address, skills, permissions, memory, and lifecycle. Built on [AgenticMail](https://agenticmail.io) + [OpenClaw](https://openclaw.ai).

```bash
npx @agenticmail/enterprise
```

One command. Interactive setup wizard. Dashboard URL in under 2 minutes.

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Setup Wizard](#setup-wizard)
- [Architecture](#architecture)
- [Database Backends](#database-backends)
- [Engine Modules](#engine-modules)
- [Agent Runtime](#agent-runtime)
- [MCP Integration Adapters](#mcp-integration-adapters)
- [Agent Tools](#agent-tools)
- [Enterprise Skills](#enterprise-skills)
- [Dashboard](#dashboard)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [CLI Commands](#cli-commands)
- [Security](#security)
- [Community Skills](#community-skills)
- [Configuration](#configuration)
- [License](#license)

---

## Overview

AgenticMail Enterprise turns your organization's AI agents into managed employees:

- **Identity** — Each agent gets a real email address, phone number, and digital identity
- **Skills** — 47 enterprise skill definitions (Google Workspace, Microsoft 365, custom) + 147 SaaS integration adapters
- **Permissions** — Fine-grained tool-level access control with 5 preset profiles
- **Governance** — DLP scanning, guardrails, anomaly detection, compliance reporting, action journaling with rollback
- **Workforce** — Shifts, schedules, on-call rotations, capacity planning, birthday automation
- **Runtime** — Full agent execution loop with LLM streaming, session management, sub-agents, budget gates
- **Dashboard** — Admin UI with dark/light themes, real-time activity tracking, agent creation wizard

### By the Numbers

| Metric | Count |
|--------|-------|
| Source files | 342 |
| Engine modules | 25+ |
| API routes | 328 |
| Database backends | 10 |
| SaaS integration adapters | 147 |
| Enterprise skill definitions | 47 |
| Agent tools | 28 |
| Route sub-apps | 22 |
| Soul templates | 51 (14 categories) |
| Community skill marketplace | Built-in |

---

## Quick Start

### Option A: Interactive Wizard (Recommended)

```bash
npx @agenticmail/enterprise
```

The wizard walks you through:
1. **Company Info** — Name, admin email, password, subdomain selection
2. **Database** — Pick from 10 backends (SQLite for dev, Postgres/MySQL/MongoDB/DynamoDB/Turso for production)
3. **Deployment** — AgenticMail Cloud, Fly.io, Railway, Docker, or Local
4. **Custom Domain** — Optional: point your own domain at the dashboard
5. **Domain Registration** — Optional: register with AgenticMail registry for domain protection

### Option B: Programmatic

```typescript
import { createServer } from '@agenticmail/enterprise';
import { createAdapter } from '@agenticmail/enterprise/db';

const db = await createAdapter({
  type: 'postgres',
  connectionString: process.env.DATABASE_URL,
});
await db.migrate();

const server = createServer({
  port: 3000,
  db,
  jwtSecret: process.env.JWT_SECRET,
});

await server.start();
```

---

## Setup Wizard

The interactive setup wizard (`npx @agenticmail/enterprise` or `npx @agenticmail/enterprise setup`) guides you through every step with sensible defaults.

### Step 1: Company Info

- Company name
- Admin email + password (min 8 chars, requires uppercase or number)
- Subdomain selection with auto-generated suggestions (slug from company name, abbreviations, variants)
- "Generate more" option for random suffix suggestions
- Custom subdomain input with validation

### Step 2: Database

Choose from 10 backends organized by category:

| Category | Options |
|----------|---------|
| **SQL** | PostgreSQL, MySQL/MariaDB, SQLite |
| **NoSQL** | MongoDB |
| **Edge** | Turso (LibSQL) |
| **Cloud** | DynamoDB (AWS), Supabase, Neon, PlanetScale, CockroachDB |

Each option collects the right credentials:
- **SQLite**: File path (default: `./agenticmail-enterprise.db`)
- **DynamoDB**: AWS Region + Access Key ID + Secret Access Key
- **Turso**: Database URL + Auth Token
- **All others**: Connection string with format hints

### Step 3: Deployment

| Target | Description |
|--------|-------------|
| **AgenticMail Cloud** | Managed hosting, instant URL (`subdomain.agenticmail.io`) |
| **Fly.io** | Your Fly.io account, generates `fly.toml` |
| **Railway** | Your Railway account, generates `railway.toml` |
| **Docker** | Self-hosted, generates `docker-compose.yml` + `.env` |
| **Local** | Dev/testing, starts server immediately on port 3000 |

### Step 4: Custom Domain (Optional)

For non-local deployments, optionally configure a custom domain. The wizard shows DNS instructions specific to your deployment target (CNAME for cloud/Fly, reverse proxy for Docker, Railway settings).

### Step 5: Domain Registration (Optional)

Registers your domain with the AgenticMail central registry:
- Generates a 256-bit deployment key (shown once, must be saved)
- Creates a DNS TXT verification challenge
- Optional immediate DNS verification (retries 5x with 10s intervals)
- Recovery via `agenticmail-enterprise recover` if key is available

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Admin Dashboard                        │
│              (React, dark/light themes)                   │
├─────────────────────────────────────────────────────────┤
│                    Hono API Server                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Auth     │  │  Admin   │  │  Engine  │              │
│  │  Routes   │  │  Routes  │  │  Routes  │              │
│  └──────────┘  └──────────┘  └──────────┘              │
├─────────────────────────────────────────────────────────┤
│                   Engine Modules (25+)                    │
│  Skills · Permissions · Lifecycle · Knowledge Base        │
│  DLP · Guardrails · Journal · Compliance · Activity      │
│  Communication · Workforce · Vault · Storage · Onboarding│
│  Policies · Memory · Approvals · Tenants · Deployer      │
│  Community Registry · Soul Library · Tool Catalog         │
├─────────────────────────────────────────────────────────┤
│                   Agent Runtime                           │
│  LLM Client · Session Manager · Tool Executor            │
│  Sub-Agent Manager · Email Channel · Follow-Up Scheduler │
├─────────────────────────────────────────────────────────┤
│              MCP Integration Framework                    │
│           147 SaaS Adapters · OAuth Connect               │
├─────────────────────────────────────────────────────────┤
│                Database Adapter Layer                     │
│  Postgres · MySQL · SQLite · MongoDB · DynamoDB · Turso  │
│  Supabase · Neon · PlanetScale · CockroachDB             │
└─────────────────────────────────────────────────────────┘
```

### Middleware Stack

- **Request ID** — UUID per request for tracing
- **Security Headers** — CSP, HSTS, XSS protection
- **CORS** — Configurable origins
- **Rate Limiting** — Per-IP, configurable RPM (default: 120)
- **IP Access Control** — CIDR-based firewall
- **Audit Logging** — Every mutating action logged
- **RBAC** — Role-based access control (owner, admin, member, viewer)
- **Error Handling** — Structured error responses
- **Circuit Breaker** — Database connectivity protection
- **Health Monitor** — Periodic health checks with unhealthy threshold

---

## Database Backends

All 10 backends implement the same `DatabaseAdapter` interface with full feature parity:

```typescript
import { createAdapter, type DatabaseType } from '@agenticmail/enterprise/db';

const db = await createAdapter({
  type: 'postgres',  // or mysql, sqlite, mongodb, dynamodb, turso, supabase, neon, planetscale, cockroachdb
  connectionString: '...',
});

await db.migrate();        // Run schema migrations
await db.getStats();       // Health check
await db.createUser({...}); // CRUD operations
await db.logEvent({...});  // Audit logging
```

### Adapter Details

| Backend | Module | Notes |
|---------|--------|-------|
| PostgreSQL | `postgres.ts` | Full SQL, migrations, engine DB |
| MySQL/MariaDB | `mysql.ts` | Full SQL, auto-converted DDL |
| SQLite | `sqlite.ts` | Embedded, `better-sqlite3` |
| MongoDB | `mongodb.ts` | Uses `_id` = `randomUUID()` |
| DynamoDB | `dynamodb.ts` | Single-table design, GSI1 |
| Turso | `turso.ts` | LibSQL edge database |
| Supabase | `postgres.ts` | Managed Postgres (same adapter) |
| Neon | `postgres.ts` | Serverless Postgres (same adapter) |
| PlanetScale | `mysql.ts` | Managed MySQL (same adapter) |
| CockroachDB | `postgres.ts` | Distributed (same adapter) |

### Engine Database

SQL-backed deployments also get the `EngineDatabase` layer for engine module persistence:

```typescript
const engineDbInterface = db.getEngineDB();
const engineDb = new EngineDatabase(engineDbInterface, 'postgres');
await engineDb.migrate(); // Versioned migration system
```

Features: DDL auto-conversion (`sqliteToPostgres()`, `sqliteToMySQL()`), dynamic table creation with `ext_` prefix, agent storage tables with `agt_`/`shared_` prefixes.

---

## Engine Modules

The engine is the core of Enterprise — 25+ modules that power agent governance:

### 1. Skill Registry & Permission Engine
- 47 built-in enterprise skill definitions (Google Workspace, Microsoft 365, custom)
- Fine-grained tool-level permissions (allow/deny per tool)
- 5 preset profiles: Research Assistant, Customer Support, Developer, Full Access, Sandbox
- Skill suites for bulk assignment
- Risk level classification (low, medium, high, critical)
- Side effect tracking (read, write, delete, external, financial)

### 2. Agent Config Generator
- Generates workspace files (SOUL.md, AGENTS.md, etc.)
- Gateway configuration
- Channel configs (email, Slack, Teams, etc.)
- Deployment scripts per target

### 3. Deployment Engine
- Docker, VPS, Fly.io, Railway provisioning
- Deployment event tracking
- Live agent status monitoring

### 4. Approval Workflows
- Human-in-the-loop approval policies
- Escalation chains with multi-level escalation
- Time-based auto-escalation
- Approval/rejection with audit trail

### 5. Agent Lifecycle Manager
- State machine: `provisioning` → `active` → `paused` → `stopped` → `decommissioned`
- Health checks and auto-recovery
- Budget controls with alerts and hard limits
- Usage tracking (tokens, cost, API calls)
- Birthday automation (sends birthday emails to agents on their DOB)

### 6. Knowledge Base
- Document ingestion and chunking
- BM25F text search (extracted to shared library)
- RAG retrieval for agent context
- Multi-knowledge-base support per org

### 7. Multi-Tenant Isolation
- Organization management with plan enforcement
- 4 plan tiers: Free (3 agents), Team (25), Enterprise (unlimited), Self-Hosted (unlimited)
- Feature gates per plan
- SSO configuration (Google, Microsoft, GitHub, Okta, SAML, LDAP)
- Usage quotas and billing

### 8. Real-Time Activity Tracking
- Live tool call recording
- Conversation logging
- Agent timelines
- Cost tracking per agent/org

### 9. Tool Catalog
- 86+ cataloged tool IDs across all AgenticMail packages
- Tool-to-skill mapping
- Dynamic tool policy generation

### 10. Data Loss Prevention (DLP)
- Content scanning rules (PII, credentials, sensitive data)
- Violation tracking and alerting
- Configurable rule sets per org

### 11. Agent-to-Agent Communication
- Message bus (direct, broadcast, topic-based)
- Task assignment and delegation
- Priority levels (normal, high, urgent)
- Agent email registry integration

### 12. Guardrails & Anomaly Detection
- Real-time intervention system
- Configurable anomaly rules (rate limits, cost thresholds, pattern matching)
- Auto-stop agents on violation
- Onboarding gate checks
- Workforce off-duty enforcement

### 13. Action Journal & Rollback
- Every agent action journaled with before/after state
- Rollback capability for reversible actions
- Audit trail with timestamps and actor

### 14. Compliance Reporting
- SOC2, GDPR, HIPAA report generation
- Data retention policies
- Access audit reports

### 15. Community Skill Registry (Marketplace)
- Install community skills from the marketplace
- Automatic periodic sync from GitHub (every 6 hours)
- Skill reviews and ratings
- Local directory loading for development
- Validation CLI for skill authors

### 16. Workforce Management
- Shift schedules and on-call rotations
- Capacity planning
- Off-duty enforcement via guardrails
- Work-life balance rules

### 17. Organization Policies
- Global and per-org policy configuration
- Policy import/export
- Compliance policy templates

### 18. Agent Memory
- Long-term memory persistence
- Memory queries and search
- Cross-session continuity

### 19. Onboarding Manager
- Agent onboarding workflows
- Onboarding gates (must complete before agent goes live)
- Policy acknowledgment tracking

### 20. Secure Vault
- Encrypted credential storage
- API key management
- OAuth token management
- DLP-integrated access control

### 21. Storage Manager
- Dynamic table management for agents
- Agent-scoped tables (`agt_` prefix)
- Shared tables (`shared_` prefix)
- 28 storage actions (create, query, aggregate, import/export, raw SQL, etc.)

### 22. Soul Library
- 51 personality templates across 14 categories
- Search and browse templates
- Custom soul creation

### 23. Knowledge Contribution Manager
- Agents contribute learned knowledge back to org knowledge bases
- Scheduled aggregation

### 24. Skill Auto-Updater
- Monitors community skill registry for updates
- Auto-applies compatible updates
- Scheduled update checks

### 25. OAuth Connect
- OAuth flow management for SaaS integrations
- Token storage in vault
- Refresh token rotation

---

## Agent Runtime

Full standalone agent execution runtime — run agents entirely in-process without OpenClaw:

```typescript
import { createAgentRuntime } from '@agenticmail/enterprise';

const runtime = createAgentRuntime({
  engineDb: db,
  apiKeys: { anthropic: process.env.ANTHROPIC_API_KEY },
});

await runtime.start();

const session = await runtime.spawnSession({
  agentId: 'agent-1',
  message: 'Research Q3 revenue trends and draft a summary email',
});
```

### Runtime Features

- **LLM Client** — Multi-provider (Anthropic, OpenAI, custom), streaming, retry with exponential backoff
- **Session Manager** — Incremental message persistence, crash recovery, session resume on startup
- **Tool Executor** — 28 built-in tools with security sandboxing
- **Sub-Agent Manager** — Spawn child agents for parallel work
- **Email Channel** — Bi-directional email communication
- **Follow-Up Scheduler** — Schedule agent follow-ups and reminders
- **Budget Gates** — Cost check before every LLM call
- **Gateway Integration** — Register as OpenClaw plugin for hybrid deployments
- **Heartbeat** — Stale session detection and cleanup
- **SSE Streaming** — Real-time event streaming for dashboard

### Supported LLM Providers

```typescript
import { listAllProviders } from '@agenticmail/enterprise';

// Built-in: anthropic, openai
// Custom providers can be registered via PROVIDER_REGISTRY
```

---

## MCP Integration Adapters

147 pre-built adapters for connecting agents to SaaS tools via [Model Context Protocol](https://modelcontextprotocol.io):

<details>
<summary><b>Full adapter list (147)</b></summary>

ActiveCampaign, Adobe Sign, ADP, Airtable, Apollo, Asana, Auth0, AWS, Azure DevOps, BambooHR, Basecamp, BigCommerce, Bitbucket, Box, Brex, Buffer, Calendly, Canva, Chargebee, CircleCI, ClickUp, Close, Cloudflare, Confluence, Contentful, Copper, Crisp, CrowdStrike, Datadog, DigitalOcean, Discord, Docker, DocuSign, Drift, Dropbox, Figma, Firebase, Fly.io, FreshBooks, Freshdesk, Freshsales, Freshservice, Front, GitHub, GitHub Actions, GitLab, Gong, Google Ads, Google Analytics, Google Cloud, Google Drive, GoToMeeting, Grafana, Greenhouse, Gusto, HashiCorp Vault, Heroku, HiBob, Hootsuite, HubSpot, Hugging Face, Intercom, Jira, Klaviyo, Kubernetes, Lattice, LaunchDarkly, Lever, Linear, LinkedIn, LiveChat, Loom, Mailchimp, Mailgun, Microsoft Teams, Miro, Mixpanel, Monday, MongoDB Atlas, Neon, Netlify, NetSuite, New Relic, Notion, Okta, OpenAI, OpsGenie, Outreach, Paddle, PagerDuty, PandaDoc, PayPal, Personio, Pinecone, Pipedrive, Plaid, Postmark, Power Automate, QuickBooks, Recurly, Reddit, Render, RingCentral, Rippling, Salesforce, SalesLoft, Sanity, SAP, Segment, SendGrid, Sentry, ServiceNow, Shopify, Shortcut, Slack, Smartsheet, Snowflake, Snyk, Splunk, Square, Statuspage, Stripe, Supabase, Teamwork, Telegram, Terraform, Todoist, Trello, Twilio, Twitter/X, Vercel, Weaviate, Webex, Webflow, WhatsApp, Whereby, WooCommerce, WordPress, Workday, Wrike, Xero, YouTube, Zendesk, Zoho CRM, Zoom, Zuora

</details>

### MCP Framework

```typescript
import { SkillMCPFramework } from '@agenticmail/enterprise/mcp';

// Each adapter provides:
// - Tool definitions (name, description, parameters, schema)
// - API executor with credential resolution
// - OAuth flow configuration
// - Rate limit handling
```

The framework includes:
- **API Executor** — HTTP client with retry, rate limiting, pagination
- **Credential Resolver** — Pulls secrets from Vault, env, or OAuth tokens
- **AWS SigV4** — Native AWS request signing for DynamoDB, S3, etc.

---

## Agent Tools

28 built-in tools available to agents running in the Enterprise runtime:

| Tool | Description |
|------|-------------|
| `bash` | Shell command execution (sandboxed) |
| `browser` | Web browser automation |
| `edit` | File editing with diff |
| `glob` | File pattern matching |
| `grep` | Text search across files |
| `memory` | Agent memory read/write |
| `read` | File reading |
| `write` | File writing |
| `web-fetch` | HTTP requests |
| `web-search` | Web search (Brave API) |
| `enterprise-calendar` | Calendar management |
| `enterprise-code-sandbox` | Isolated code execution |
| `enterprise-database` | Database queries |
| `enterprise-diff` | File/text diff generation |
| `enterprise-documents` | Document processing |
| `enterprise-finance` | Financial calculations |
| `enterprise-http` | Advanced HTTP client |
| `enterprise-knowledge-search` | RAG search across knowledge bases |
| `enterprise-logs` | Log analysis |
| `enterprise-notifications` | Send notifications |
| `enterprise-security-scan` | Security vulnerability scanning |
| `enterprise-spreadsheet` | Spreadsheet operations |
| `enterprise-translation` | Multi-language translation |
| `enterprise-vision` | Image analysis |
| `enterprise-web-research` | Deep web research |
| `enterprise-workflow` | Workflow orchestration |

Tools include a security middleware layer for permission checking and DLP scanning.

---

## Enterprise Skills

47 pre-built skill definitions organized into 3 suites:

### Google Workspace (14 skills)
Gmail, Calendar, Drive, Docs, Sheets, Slides, Forms, Meet, Chat, Keep, Sites, Groups, Admin, Vault

### Microsoft 365 (17 skills)
Outlook, Teams, OneDrive, Word, Excel, PowerPoint, SharePoint, Planner, Todo, OneNote, Forms, Bookings, Power BI, Power Automate, Whiteboard, Copilot, Admin

### Enterprise Custom (16 skills)
Calendar, Code Sandbox, Database, Diff, Documents, Finance, HTTP, Knowledge Search, Logs, Notifications, Security Scan, Spreadsheet, Translation, Vision, Web Research, Workflow

Each skill definition includes:
- Tool list with parameter schemas
- Required configuration fields
- Risk level and side effect classification
- Category and description

---

## Dashboard

React-based admin dashboard served from the enterprise server:

- **Dark/Light themes** — Professional design with CSS custom properties
- **Dynamic brand color** — Uses `settings.primaryColor` throughout
- **Agent management** — Create, configure, start/stop, monitor
- **Real-time activity** — Live tool calls, conversations, cost
- **Knowledge bases** — Upload, manage, search documents
- **Approval workflows** — Review and approve/reject pending requests
- **Compliance** — View reports, DLP violations, audit logs
- **Settings** — Company info, SSO, security, billing
- **Onboarding** — Agent creation wizard with soul template selection

---

## API Reference

The API is organized into 3 major sections:

### Auth Routes (`/api/auth/*`)
- `POST /api/auth/login` — Login with email/password
- `POST /api/auth/refresh` — Refresh JWT tokens
- `POST /api/auth/logout` — Logout (invalidate cookies)
- SSO callback routes for Google, Microsoft, GitHub, Okta

### Admin Routes (`/api/admin/*`)
- Agent CRUD, user management, settings, audit log
- Bridge API for unified agent management (`/api/admin/bridge/agents`)

### Engine Routes (`/api/engine/*`)
328 routes across 22 sub-apps:

| Sub-App | Prefix | Description |
|---------|--------|-------------|
| DLP | `/dlp/*` | Data loss prevention rules & scans |
| Guardrails | `/guardrails/*`, `/anomaly-rules/*` | Intervention rules & anomaly detection |
| Journal | `/journal/*` | Action journal & rollback |
| Communication | `/messages/*`, `/tasks/*` | Agent messaging & task delegation |
| Compliance | `/compliance/*` | Reports & data retention |
| Catalog | `/skills/*`, `/souls/*`, `/profiles/*`, `/permissions/*`, `/config/*` | Skill registry, soul library, permission profiles |
| Agents | `/agents/*`, `/usage/*`, `/budget/*`, `/bridge/*` | Agent lifecycle, usage, budgets |
| Knowledge | `/knowledge-bases/*` | Document ingestion & RAG |
| Org/Approvals | `/orgs/*`, `/approvals/*`, `/escalation-chains/*` | Multi-tenant & approval workflows |
| Activity | `/activity/*`, `/stats/*` | Real-time tracking & analytics |
| Deploy/Schema | `/deploy-credentials/*`, `/schema/*` | Deployment & DB schema |
| Community | `/community/*` | Skill marketplace |
| Workforce | `/workforce/*` | Shifts, schedules, capacity |
| Policies | `/policies/*` | Org policies & import |
| Memory | `/memory/*` | Agent memory management |
| Onboarding | `/onboarding/*` | Agent onboarding flows |
| Vault | `/vault/*` | Encrypted credential storage |
| Storage | `/storage/*` | Dynamic agent databases |
| OAuth | `/oauth/*` | SaaS OAuth connect flows |
| Knowledge Contrib | `/knowledge-contribution/*` | Agent-contributed knowledge |
| Skill Updates | `/skill-updates/*` | Auto-update management |

---

## Deployment

### Docker

```bash
npx @agenticmail/enterprise  # Select "Docker" in Step 3
docker compose up -d
```

Generates `docker-compose.yml` + `.env` with all secrets.

### Fly.io

```bash
npx @agenticmail/enterprise  # Select "Fly.io" in Step 3
fly launch --copy-config
fly secrets set DATABASE_URL="..." JWT_SECRET="..."
fly deploy
```

### Railway

```bash
npx @agenticmail/enterprise  # Select "Railway" in Step 3
railway init && railway link && railway up
```

### AgenticMail Cloud

```bash
npx @agenticmail/enterprise  # Select "AgenticMail Cloud" in Step 3
# Instant URL: subdomain.agenticmail.io
```

### Local / Development

```bash
npx @agenticmail/enterprise  # Select "Local" in Step 3
# Server starts on http://localhost:3000
```

Or with pm2 for production:

```bash
pm2 start dist/cli.js --name agenticmail-enterprise --watch
```

---

## CLI Commands

```bash
# Interactive setup wizard (default)
npx @agenticmail/enterprise

# Validate a community skill manifest
npx @agenticmail/enterprise validate ./community-skills/my-skill/
npx @agenticmail/enterprise validate --all
npx @agenticmail/enterprise validate --json

# AI-assisted skill scaffolding
npx @agenticmail/enterprise build-skill

# Submit a skill to the marketplace
npx @agenticmail/enterprise submit-skill ./community-skills/my-skill/

# Recover a domain registration on a new machine
npx @agenticmail/enterprise recover --domain agents.agenticmail.io --key <hex>

# Check DNS verification status
npx @agenticmail/enterprise verify-domain
npx @agenticmail/enterprise verify-domain --domain agents.agenticmail.io
```

---

## Security

### Authentication
- **httpOnly cookies** — `em_session`, `em_refresh`, `em_csrf` (not localStorage JWT)
- **CSRF protection** — Double-submit cookie pattern
- **SSO** — Google, Microsoft, GitHub, Okta, SAML 2.0, LDAP
- **Password hashing** — bcrypt with cost factor 12
- **JWT** — Short-lived access tokens + long-lived refresh tokens

### Authorization
- **RBAC** — 4 roles: owner, admin, member, viewer
- **Per-tool permissions** — Allow/deny at individual tool level
- **Approval workflows** — Human-in-the-loop for sensitive operations
- **Budget gates** — Hard cost limits per agent

### Data Protection
- **DLP Engine** — Content scanning for PII, credentials, sensitive data
- **Secure Vault** — Encrypted credential storage with access control
- **Egress Filter** — Outbound request filtering
- **IP Firewall** — CIDR-based access control
- **Audit Logging** — Every mutating action logged with actor, timestamp, details

### Infrastructure
- **Rate Limiting** — Per-IP, configurable
- **Circuit Breaker** — Database connectivity protection
- **Security Headers** — CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- **Domain Lock** — Cryptographic domain registration to prevent unauthorized duplication

---

## Community Skills

Build and share skills through the community marketplace:

### Creating a Skill

```bash
npx @agenticmail/enterprise build-skill
```

The AI-assisted scaffolding tool generates:
- `manifest.json` — Skill metadata, tools, permissions, config fields
- Tool implementations
- README with usage instructions

### Skill Manifest Format

```json
{
  "name": "my-skill",
  "version": "1.0.0",
  "description": "What this skill does",
  "author": "your-name",
  "license": "MIT",
  "category": "productivity",
  "tools": [
    {
      "name": "my_tool",
      "description": "What this tool does",
      "parameters": { ... },
      "riskLevel": "low",
      "sideEffects": ["read"]
    }
  ],
  "config": [
    { "name": "API_KEY", "type": "secret", "required": true }
  ]
}
```

### Validating

```bash
npx @agenticmail/enterprise validate ./community-skills/my-skill/
```

### Submitting

```bash
npx @agenticmail/enterprise submit-skill ./community-skills/my-skill/
```

Skills are synced from the GitHub repository every 6 hours to all deployments.

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string | — |
| `JWT_SECRET` | JWT signing secret | — |
| `PORT` | Server port | `3000` |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | `*` |
| `RATE_LIMIT` | Requests per minute per IP | `120` |
| `AGENTICMAIL_REGISTRY_URL` | Central registry URL | `https://registry.agenticmail.com/v1` |
| `ANTHROPIC_API_KEY` | For agent runtime | — |
| `OPENAI_API_KEY` | For agent runtime | — |

### Server Config (Programmatic)

```typescript
createServer({
  port: 3000,
  db: adapter,
  jwtSecret: 'your-secret',
  corsOrigins: ['https://your-domain.com'],
  rateLimit: 120,
  trustedProxies: ['10.0.0.0/8'],
  logging: true,
  runtime: {
    enabled: true,
    defaultModel: { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514' },
    apiKeys: { anthropic: '...' },
  },
});
```

---

## Requirements

- **Node.js** 18+
- **Database** — Any of the 10 supported backends
- **LLM API Key** — Anthropic or OpenAI (for agent runtime)

---

## License

MIT — See [LICENSE](./LICENSE)

---

Built by [AgenticMail](https://agenticmail.io) · [GitHub](https://github.com/agenticmail/enterprise) · [OpenClaw](https://openclaw.ai)
