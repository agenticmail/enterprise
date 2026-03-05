# @agenticmail/enterprise

**The Complete AI Agent Workforce Platform**

Deploy, manage, and govern AI agents as first-class employees — each with their own email, phone number, calendar, browser, tools, memory, and identity. Enterprise-grade security, compliance, and multi-tenant isolation built in.

```bash
npx @agenticmail/enterprise
```

One command. Interactive setup wizard. Full platform in under 2 minutes.

---

## Getting Started (5 Minutes)

### ☁️ Option A: Deploy on AgenticMail Cloud (Recommended)

**Get a free `yourcompany.agenticmail.io` subdomain — live in under 2 minutes.**

```bash
npx @agenticmail/enterprise
```

The wizard will ask you to:

1. **Select deploy target** → Choose **"AgenticMail Cloud"**
2. **Pick your subdomain** → e.g., `acme` → your dashboard is at `https://acme.agenticmail.io`
3. **Create admin account** → Name, email, password
4. **Done** → Dashboard opens. Create your first agent.

```
$ npx @agenticmail/enterprise

  Deploy target: AgenticMail Cloud (free)
  Subdomain: acme.agenticmail.io
  ✓ Database provisioned
  ✓ Schema migrated (32 tables)
  ✓ Admin account created

  Dashboard: https://acme.agenticmail.io
  ✓ Live! Create your first agent →
```

**No servers to manage. No Docker. No ports to open. No infra.** Everything runs on our infrastructure — you just configure from the dashboard.

---

### Option B: Self-Hosted

Same wizard, different deploy target:

```bash
npx @agenticmail/enterprise
```

The wizard walks you through:

1. **Database** — Pick SQLite (zero config) or paste a Postgres URL. We auto-detect Supabase/Neon and optimize connection pooling automatically.
2. **Admin Account** — Name, email, password
3. **Deploy Target** — Cloudflare Tunnel (free, no ports to open), Docker, Railway, Fly.io, or local
4. **Dashboard** — Opens automatically. Everything is managed from the UI.

#### Database Options

| Option | Best For | Setup |
|--------|----------|-------|
| **SQLite** | Trying it out, local dev | Zero config — built-in |
| **[Supabase](https://supabase.com) (Free)** | Production, cloud | Create free project → copy connection string |
| **Any Postgres** | Enterprise, existing infra | Paste your connection string |
| **MySQL, MongoDB, etc.** | Special requirements | 10 backends supported — see [Database Backends](#database-backends) |

> **Supabase users:** The wizard auto-optimizes your connection string — switches to transaction mode, adds PgBouncer params, and generates a direct URL for migrations. Zero manual config.

### What You Get

Once setup completes, open the dashboard and you'll see:

- **Setup Checklist** — guided steps to configure email, create agents, etc.
- **Create Agent** — pick from 51 personality templates or build your own
- **Full Admin Dashboard** — 28 pages covering every aspect of agent management

Everything is managed from the dashboard — agent creation, permissions, email setup, channel connections, DLP rules, workforce schedules, compliance reports. No code needed.

### Create Your First Agent

1. Click **"Create Agent"** in the dashboard
2. Choose a soul template (e.g., "Executive Assistant", "Sales Rep", "Developer")
3. Add your LLM API key in **Settings → API Keys** (or in the agent's config)
4. Configure permissions — set what tools the agent can use, package managers it can access, sudo privileges, etc.
5. Start the agent — it gets its own email, tools, and identity

### What's Next?

- **Connect Gmail** — Give your agent real email access via OAuth (Agent Detail → Email tab)
- **Add Telegram/WhatsApp** — Connect messaging channels (Agent Detail → Channels tab)
- **Set up DLP** — Apply pre-built rule packs to protect sensitive data (DLP page → Rule Packs)
- **Configure Shifts** — Set work hours and on-call schedules (Workforce page)
- **Set Dependency Policy** — Control what packages agents can install, allow sudo, set computer password (Agent Detail → Permissions tab)

---

## Table of Contents

- [Why AgenticMail Enterprise](#why-agenticmail-enterprise)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Dashboard](#dashboard)
- [Agent Runtime](#agent-runtime)
- [Agent Tools](#agent-tools)
- [Google Workspace Integration](#google-workspace-integration)
- [145 SaaS Integration Adapters](#145-saas-integration-adapters)
- [Enterprise Skills](#enterprise-skills)
- [Database Backends](#database-backends)
- [Security & Compliance](#security--compliance)
- [Data Loss Prevention (DLP)](#data-loss-prevention-dlp)
- [Multi-Tenant & Organizations](#multi-tenant--organizations)
- [Workforce Management](#workforce-management)
- [Knowledge Base & RAG](#knowledge-base--rag)
- [Communication & Task Pipeline](#communication--task-pipeline)
- [Agent Autonomy System](#agent-autonomy-system)
- [Meeting & Voice Intelligence](#meeting--voice-intelligence)
- [Multimodal Support](#multimodal-support)
- [Deployment](#deployment)
- [CLI Commands](#cli-commands)
- [Environment Variables](#environment-variables)
- [Community Skills Marketplace](#community-skills-marketplace)
- [API Reference](#api-reference)
- [License](#license)

---

## Why AgenticMail Enterprise

Most AI agent platforms give you a chatbot. We give you a **workforce**.

- **Real Identity** — Each agent gets a real email address, phone number (Google Voice), Google Workspace access, and digital presence
- **Real Autonomy** — Agents clock in/out, check email, respond to messages, attend meetings, and work independently
- **Real Governance** — DLP scanning, guardrails, approval workflows, compliance reporting, action journaling with rollback
- **Real Scale** — Multi-tenant isolation, org-scoped everything, role-based access control, budget gates
- **Real Integration** — 145 SaaS adapters, 13 Google Workspace tools, full browser automation, shell access, filesystem tools

### By the Numbers

| Metric | Count |
|--------|-------|
| Source files | 770+ |
| Engine modules | 82 |
| Dashboard pages | 28 + 23 agent detail tabs |
| Documentation pages | 49 |
| Database backends | 10 |
| SaaS integration adapters | 145 |
| Enterprise skill definitions | 52 |
| Google Workspace tools | 13 services |
| Agent tools | 270+ |
| Soul templates | 51 (14 categories) |
| DLP rule packs | 7 (53 pre-built rules) |
| Compliance report types | 5 (SOC 2, GDPR, SOX, Incident, Access Review) |

---

## Quick Start

### Option A: Interactive Wizard (Recommended)

```bash
npx @agenticmail/enterprise
```

The wizard walks you through:
1. **Database** — Pick from 10 backends with smart auto-configuration (auto-detects Supabase/Neon pooler mode, generates direct URLs for migrations, adds `?pgbouncer=true` automatically)
2. **Admin Account** — Name, email, password, company name
3. **Email Delivery** — Optional SMTP/OAuth setup
4. **Custom Domain** — Optional: point your own domain via Cloudflare tunnel
5. **First Agent** — Create your first AI agent with a soul template

### Option B: Programmatic

```typescript
import { createServer, createAdapter, smartDbConfig } from '@agenticmail/enterprise';

const db = await createAdapter(smartDbConfig(process.env.DATABASE_URL));
await db.migrate();

const server = createServer({
  port: 3000,
  db,
  jwtSecret: process.env.JWT_SECRET,
  runtime: {
    enabled: true,
    apiKeys: { anthropic: process.env.ANTHROPIC_API_KEY },
  },
});

await server.start();
```

### Option C: Standalone Agent

Run an agent as its own process (recommended for production):

```bash
node dist/cli.js agent --env-file=.env.fola
```

Each agent runs independently with its own port, connects to the shared database, and registers with the main server for health checks and lifecycle management.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Admin Dashboard (28 pages)                │
│         React · Dark/Light themes · Real-time updates         │
│   Agents · Workforce · DLP · Compliance · Vault · Knowledge   │
│   Activity · Journal · Guardrails · Task Pipeline · Audit     │
├──────────────────────────────────────────────────────────────┤
│                      Hono API Server                          │
│   Auth · Admin · Engine (82 modules) · Middleware (9 layers)  │
├──────────────────────────────────────────────────────────────┤
│                    Engine Core                                │
│  Lifecycle · Permissions · DLP · Guardrails · Compliance      │
│  Journal · Approvals · Policies · Knowledge · Memory          │
│  Communication · Workforce · Vault · Storage · Autonomy       │
│  Onboarding · Soul Library · Tool Catalog · OAuth Connect     │
│  Meeting Monitor · Voice Intelligence · Activity Tracking     │
├──────────────────────────────────────────────────────────────┤
│                   Agent Runtime                               │
│  LLM Client (multi-provider) · Session Manager               │
│  Tool Executor (270+ tools) · Sub-Agent Spawning              │
│  Budget Gates · Model Fallback · Streaming                    │
├──────────────────────────────────────────────────────────────┤
│              Messaging & Channels                             │
│  Email (Gmail/Outlook) · Telegram · WhatsApp                  │
│  Google Chat · Browser Automation · Voice/Meetings            │
├──────────────────────────────────────────────────────────────┤
│            Integration Layer                                  │
│  145 SaaS Adapters · 13 Google Workspace Services             │
│  MCP Framework · OAuth Connect · Dependency Manager           │
├──────────────────────────────────────────────────────────────┤
│               Database Adapter Layer                          │
│  Postgres · MySQL · SQLite · MongoDB · DynamoDB · Turso       │
│  Supabase · Neon · PlanetScale · CockroachDB                  │
│  Smart pooler detection · Auto-optimized connections          │
└──────────────────────────────────────────────────────────────┘
```

### Middleware Stack

| Layer | Purpose |
|-------|---------|
| Request ID | UUID per request for distributed tracing |
| Transport Encryption | Optional AES-GCM encryption for all API responses |
| Security Headers | CSP, HSTS, X-Frame-Options, X-Content-Type-Options |
| CORS | Configurable origins |
| Rate Limiting | Per-IP, configurable RPM (default: 120) |
| IP Firewall | CIDR-based access control |
| Audit Logging | Every mutating action logged with actor, org, timestamp |
| RBAC | Role-based access (owner, admin, member, viewer) |
| Org Scoping | Automatic data isolation for multi-tenant deployments |

---

## Dashboard

28 full pages + 23 agent detail tabs, served directly from the enterprise server:

### Platform Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Setup checklist, quick stats, getting started guide |
| **Agents** | Create, configure, start/stop, monitor all agents |
| **Users** | User management, roles, org assignment, impersonation |
| **Organizations** | Client org management, billing, access control |
| **Org Chart** | Visual organizational hierarchy |
| **Workforce** | Shifts, schedules, on-call, capacity, clock records |
| **Task Pipeline** | Visual task flow, node-based pipeline editor |
| **Messages** | Agent-to-agent communication hub |
| **Knowledge** | Document upload, chunking, RAG search |
| **Knowledge Contributions** | Agent-contributed knowledge review |
| **Knowledge Import** | Bulk import from external sources |
| **Skills** | Enterprise skill management and assignment |
| **Community Skills** | Marketplace: browse, install, configure, update |
| **Skill Connections** | OAuth and credential management for skills |
| **DLP** | Rules, rule packs (7 enterprise packs), violations, scanning |
| **Guardrails** | Intervention rules, anomaly detection, agent safety |
| **Compliance** | SOC 2, GDPR, SOX, Incident, Access Review reports |
| **Journal** | Action journal with detail modal and rollback |
| **Audit Log** | Complete audit trail with org filtering |
| **Activity** | Real-time tool calls, conversations, cost tracking |
| **Approvals** | Human-in-the-loop approval queue |
| **Vault** | Encrypted credential storage, API keys, OAuth tokens |
| **Database Access** | Agent database connection management |
| **Memory Transfer** | Cross-agent memory sharing |
| **Roles** | Custom agent role template management (51 built-in) |
| **Settings** | Company, security, SSO, 2FA, branding, email config |
| **Domain Status** | Cloudflare tunnel, DNS, deployment health |
| **Login** | Setup wizard (first run) / login with 2FA support |

### Agent Detail Tabs (per agent)

| Tab | Description |
|-----|-------------|
| Overview | Status, health, metrics, quick actions |
| Personal Details | Name, email, phone, avatar, identity |
| Configuration | Model, temperature, system prompt, soul |
| Permissions | Tool-level allow/deny, preset profiles |
| Skills | Assigned skills with risk levels |
| Tools | Available tools with security policies |
| Tool Security | Per-tool DLP and guardrail overrides |
| Email | Gmail OAuth, signature, email config |
| Channels | Telegram, WhatsApp, Google Chat setup |
| WhatsApp | WhatsApp Business integration |
| Communication | Agent messaging preferences |
| Memory | Long-term memory viewer/editor |
| Autonomy | Clock, daily catchup, goals, knowledge schedules |
| Budget | Token limits, cost caps, alerts |
| Workforce | Shift assignments, availability |
| Guardrails | Agent-specific intervention rules |
| Activity | Agent-specific activity feed |
| Security | API keys, access controls |
| Deployment | Runtime config, health endpoint |
| Manager | Supervisor/manager assignment |
| Meeting Browser | Meeting attendance and voice config |
| Personal Details | Birthday, timezone, language |

### Features

- **Dark/Light themes** with CSS custom properties
- **Dynamic brand color** from company settings
- **Org switcher** on every page for multi-tenant filtering
- **Real-time SSE streaming** for live updates
- **49 built-in documentation pages** accessible from the dashboard
- **Transport encryption** — Optional AES-GCM encryption for all API traffic

---

## Agent Runtime

Full standalone agent execution — agents run as independent processes with their own port, tools, memory, and messaging channels.

### Runtime Features

| Feature | Description |
|---------|-------------|
| **Multi-Provider LLM** | Anthropic, OpenAI, xAI (Grok), Google — with automatic model fallback |
| **Session Manager** | Incremental message persistence, crash recovery, session resume |
| **Tool Executor** | 270+ tools with permission checking and DLP scanning |
| **Sub-Agent Spawning** | Spawn child agents for parallel work |
| **Budget Gates** | Cost check before every LLM call, hard limits with alerts |
| **Streaming** | SSE streaming for real-time dashboard updates |
| **Multimodal** | Process images, videos, documents from Telegram/WhatsApp |
| **Dependency Manager** | Auto-detect, install, and clean up system dependencies |
| **Email Channel** | Bi-directional Gmail/Outlook with OAuth |
| **Messaging** | Telegram long-polling, WhatsApp webhook |
| **Browser** | Full Playwright-based web automation |
| **Voice** | ElevenLabs TTS, meeting voice intelligence |
| **Memory** | DB-backed long-term memory with semantic search |
| **Heartbeat** | Configurable periodic checks (email, calendar, health) |
| **Autonomy** | Clock in/out, morning triage, daily catchup, goal tracking |

### Standalone Agent Mode

```bash
# .env.fola
DATABASE_URL=postgresql://...  # Shared DB (auto-optimized for pooler)
AGENT_ID=3eecd57d-03ae-440d-8945-5b35f43a8d90
PORT=3102
ANTHROPIC_API_KEY=sk-ant-...

# Start
node dist/cli.js agent --env-file=.env.fola
```

The agent automatically:
- Connects to the shared database (with smart pooler detection)
- Loads its configuration, permissions, and soul from DB
- Starts messaging channels (Telegram, WhatsApp, email)
- Begins autonomy features (clock in, morning triage)
- Registers health endpoint for dashboard monitoring

---

## Agent Tools

270+ tools organized by category:

### Core Tools

| Tool | Description |
|------|-------------|
| `bash` / `shell` | Shell command execution |
| `browser` | Full Playwright web automation (screenshots, navigation, interaction) |
| `edit` | Precise file editing with search/replace |
| `read` / `write` | File I/O |
| `glob` / `grep` | File discovery and text search |
| `web_fetch` | HTTP requests with content extraction |
| `web_search` | Web search (Brave API) |

### Google Workspace Tools

| Tool | Description |
|------|-------------|
| `gmail_search` / `gmail_read` / `gmail_send` / `gmail_reply` | Full Gmail access |
| `gmail_forward` / `gmail_trash` / `gmail_modify` / `gmail_labels` | Gmail management |
| `gmail_drafts` / `gmail_thread` / `gmail_attachment` / `gmail_profile` | Advanced Gmail |
| `gmail_get_signature` / `gmail_set_signature` | Signature management |
| `calendar_list` / `calendar_create` / `calendar_update` / `calendar_delete` | Calendar CRUD |
| `calendar_find_free` / `calendar_rsvp` | Scheduling |
| `drive_list` / `drive_search` / `drive_read` / `drive_upload` | Google Drive |
| `drive_create_folder` / `drive_share` / `drive_export` | Drive management |
| `contacts_list` / `contacts_search` / `contacts_create` | Google Contacts |
| `google_chat_send_message` / `google_chat_list_spaces` | Google Chat |
| `google_docs_*` / `google_sheets_*` / `google_slides_*` | Document editing |
| `google_forms_*` / `google_tasks_*` | Forms and Tasks |
| `google_meetings_*` | Meet integration |

### Enterprise Tools

| Tool | Description |
|------|-------------|
| `enterprise-code-sandbox` | Isolated code execution |
| `enterprise-database` | Database queries |
| `enterprise-documents` | Document processing |
| `enterprise-http` | Advanced HTTP client |
| `enterprise-security-scan` | Vulnerability scanning |
| `enterprise-spreadsheet` | Spreadsheet operations |
| `knowledge-search` | RAG search across knowledge bases |

### Agent Management Tools

| Tool | Description |
|------|-------------|
| `management_escalate` | Escalate to supervisor |
| `management_delegate` | Delegate task to another agent |
| `management_status_update` | Report status to manager |

### Messaging Tools

| Tool | Description |
|------|-------------|
| `msg_telegram` / `msg_whatsapp` | Send messages via channels |
| `telegram_download_file` | Download media from Telegram |

### Dependency Management

| Tool | Description |
|------|-------------|
| `check_dependency` | Check if system tool is installed |
| `install_dependency` | Auto-install missing dependencies |
| `list_dependencies` | List all agent-installed packages |
| `cleanup_dependencies` | Remove session-installed packages |

---

## Google Workspace Integration

Deep, native integration with 13 Google Workspace services:

| Service | Tools | OAuth Scopes |
|---------|-------|-------------|
| **Gmail** | 16 tools | `gmail.modify`, `gmail.send` |
| **Calendar** | 6 tools | `calendar`, `calendar.events` |
| **Drive** | 7 tools | `drive` |
| **Docs** | CRUD + formatting | `documents` |
| **Sheets** | CRUD + formulas | `spreadsheets` |
| **Slides** | CRUD + layout | `presentations` |
| **Forms** | Create + responses | `forms` |
| **Tasks** | List + manage | `tasks` |
| **Contacts** | Search + manage | `contacts` |
| **Chat** | Send + spaces | `chat.messages`, `chat.spaces` |
| **Meet** | Schedule + join | `calendar` |
| **Maps** | Places API | API key |
| **Meeting Voice** | TTS + transcription | ElevenLabs + virtual audio |

Agents can:
- Read and respond to emails
- Create and manage calendar events
- Upload and share Drive files
- Edit Google Docs, Sheets, and Slides
- Join Google Meet calls with voice (ElevenLabs TTS + virtual audio device)

---

## 145 SaaS Integration Adapters

Pre-built MCP adapters for connecting agents to any SaaS tool:

<details>
<summary><b>Full adapter list (145)</b></summary>

ActiveCampaign · Adobe Sign · ADP · Airtable · Apollo · Asana · Auth0 · AWS · Azure DevOps · BambooHR · Basecamp · BigCommerce · Bitbucket · Box · Brex · Buffer · Calendly · Canva · Chargebee · CircleCI · ClickUp · Close · Cloudflare · Confluence · Contentful · Copper · Crisp · CrowdStrike · Datadog · DigitalOcean · Discord · Docker · DocuSign · Drift · Dropbox · Figma · Firebase · Fly.io · FreshBooks · Freshdesk · Freshsales · Freshservice · Front · GitHub · GitHub Actions · GitLab · Gong · Google Ads · Google Analytics · Google Cloud · Google Drive · GoToMeeting · Grafana · Greenhouse · Gusto · HashiCorp Vault · Heroku · HiBob · Hootsuite · HubSpot · Hugging Face · Intercom · Jira · Klaviyo · Kubernetes · Lattice · LaunchDarkly · Lever · Linear · LinkedIn · LiveChat · Loom · Mailchimp · Mailgun · Microsoft Teams · Miro · Mixpanel · Monday · MongoDB Atlas · Neon · Netlify · NetSuite · New Relic · Notion · Okta · OpenAI · OpsGenie · Outreach · Paddle · PagerDuty · PandaDoc · PayPal · Personio · Pinecone · Pipedrive · Plaid · Postmark · Power Automate · QuickBooks · Recurly · Reddit · Render · RingCentral · Rippling · Salesforce · SalesLoft · Sanity · SAP · Segment · SendGrid · Sentry · ServiceNow · Shopify · Shortcut · Slack · Smartsheet · Snowflake · Snyk · Splunk · Square · Statuspage · Stripe · Supabase · Teamwork · Telegram · Terraform · Todoist · Trello · Twilio · Twitter/X · Vercel · Weaviate · Webex · Webflow · WhatsApp · Whereby · WooCommerce · WordPress · Workday · Wrike · Xero · YouTube · Zendesk · Zoho CRM · Zoom · Zuora

</details>

Each adapter provides:
- Tool definitions with parameter schemas
- API executor with credential resolution from Vault
- OAuth flow configuration
- Rate limit handling and pagination

---

## Enterprise Skills

52 pre-built skill definitions:

### Google Workspace Suite (14)
Gmail · Calendar · Drive · Docs · Sheets · Slides · Forms · Meet · Chat · Keep · Sites · Groups · Admin · Vault

### Microsoft 365 Suite (17)
Outlook · Teams · OneDrive · Word · Excel · PowerPoint · SharePoint · Planner · Todo · OneNote · Forms · Bookings · Power BI · Power Automate · Whiteboard · Copilot · Admin

### Enterprise Custom Suite (16+)
Calendar · Code Sandbox · Database · Diff · Documents · Finance · HTTP · Knowledge Search · Logs · Notifications · Security Scan · Spreadsheet · Translation · Vision · Web Research · Workflow

### Soul Templates (51)

14 categories of agent personality templates:

| Category | Examples |
|----------|---------|
| Engineering | Full-Stack Developer, DevOps Engineer, QA Engineer |
| Data | Data Analyst, ML Engineer, BI Analyst |
| Support | Customer Support, IT Help Desk, Onboarding Specialist |
| Marketing | Content Creator, SEO Specialist, Social Media Manager |
| Sales | Sales Rep, Account Executive, BDR |
| Finance | Financial Analyst, Accountant, Revenue Operations |
| HR | Recruiter, HR Coordinator, People Operations |
| Legal | Legal Assistant, Compliance Officer |
| Operations | Project Manager, Executive Assistant, Office Manager |
| Security | Security Analyst, GRC Specialist |
| Design | UX Designer, Brand Designer |
| Product | Product Manager, Technical Writer |
| Research | Research Analyst, Competitive Intelligence |
| Custom | Build your own from scratch |

Custom role templates can be created and managed via the **Roles** dashboard page.

---

## Database Backends

10 backends, all implementing the same adapter interface with full feature parity:

| Backend | Type | Best For |
|---------|------|----------|
| **PostgreSQL** | SQL | Production (recommended) |
| **Supabase** | Managed Postgres | Quick setup, free tier available |
| **Neon** | Serverless Postgres | Serverless deployments |
| **CockroachDB** | Distributed Postgres | Global scale |
| **MySQL / MariaDB** | SQL | Existing MySQL infrastructure |
| **PlanetScale** | Managed MySQL | Serverless MySQL |
| **SQLite** | Embedded | Development, small deployments |
| **Turso** | LibSQL (edge) | Edge deployments |
| **MongoDB** | NoSQL | Document-oriented workloads |
| **DynamoDB** | AWS NoSQL | AWS-native deployments |

### Smart Connection Auto-Configuration

When you provide a `DATABASE_URL`, the system automatically:

1. **Detects your provider** — Supabase, Neon, or generic Postgres from the hostname
2. **Optimizes the connection** — Switches Supabase session mode (port 5432) to transaction mode (port 6543), adds `?pgbouncer=true`
3. **Generates a direct URL** — For migrations and DDL operations that need real transactions (bypasses PgBouncer)
4. **Configures pool sizing** — Conservative pool limits for shared PgBouncer setups (max 3 per process), generous for direct connections (max 10)
5. **Sets idle timeouts** — 2s for PgBouncer (fast release), 30s for direct connections
6. **Handles connection errors gracefully** — Automatic retry with ROLLBACK recovery for aborted transactions

```typescript
import { smartDbConfig, createAdapter } from '@agenticmail/enterprise';

// Automatically optimized — no manual config needed
const db = await createAdapter(smartDbConfig('postgresql://postgres.ref:pass@pooler.supabase.com:5432/postgres'));
// → Switches to port 6543, adds ?pgbouncer=true, generates direct URL for migrations
```

The setup wizard shows all auto-configurations in the UI:
- 🟢 Provider detection (Supabase, Neon)
- ✨ Auto-configured optimizations (pooler mode, pgbouncer param)
- 🔗 Pooler URL and Direct URL (for migrations)

---

## Security & Compliance

### Authentication

| Feature | Details |
|---------|---------|
| **Session cookies** | `httpOnly` cookies (`em_session`, `em_refresh`, `em_csrf`) — not localStorage |
| **CSRF protection** | Double-submit cookie pattern |
| **2FA / TOTP** | Time-based one-time passwords with backup codes |
| **SSO** | Google, Microsoft, GitHub, Okta, SAML 2.0, LDAP |
| **Password hashing** | bcrypt with cost factor 12 |
| **JWT** | Short-lived access + long-lived refresh tokens |
| **Impersonation** | Admin can impersonate users with full audit trail |

### Authorization

| Feature | Details |
|---------|---------|
| **RBAC** | 4 roles: owner, admin, member, viewer |
| **Per-tool permissions** | Allow/deny at individual tool level |
| **5 preset profiles** | Research Assistant, Customer Support, Developer, Full Access, Sandbox |
| **Approval workflows** | Human-in-the-loop for sensitive operations |
| **Escalation chains** | Multi-level escalation with time-based auto-escalation |
| **Budget gates** | Hard cost limits per agent with warning thresholds |
| **Org-bound access** | External client users see only their org's data |

### Transport Encryption

Optional AES-GCM encryption for all API responses:
- Dashboard derives encryption key from user password
- All API responses wrapped in `{"_enc":"..."}` in the network tab
- SSE streams excluded (EventSource can't send custom headers)
- Protects against network-level MITM even without HTTPS

### Compliance Reporting

5 report types with full HTML export for auditors:

| Report | Standard | Content |
|--------|----------|---------|
| **SOC 2 Type II** | Trust Service Criteria CC1-CC9 | Executive summary, risk score (A-F), control effectiveness, findings |
| **GDPR DSAR** | EU Data Protection | Data subject access request processing |
| **SOX Audit Trail** | Sarbanes-Oxley | Financial controls and audit trail |
| **Incident Report** | Custom | Security incident documentation |
| **Access Review** | Custom | User and agent access audit |

Reports include:
- Agent names resolved (not raw UUIDs)
- Organization/company name
- Generator identity
- Both positive (controls in place) and negative (gaps) findings
- Professional HTML export with enterprise styling

### Action Journal & Rollback

Every agent action is journaled with:
- Before/after state snapshots
- Actor identity and timestamp
- Rollback capability for reversible actions
- Detail modal with full context
- Org-scoped filtering

### Audit Logging

Every mutating API call is logged with:
- Actor (user or agent)
- Organization scope
- Action type and details
- IP address and request ID
- Org-scoped filtering in dashboard

---

## Data Loss Prevention (DLP)

Enterprise-grade DLP with real-time content scanning:

### 7 Pre-Built Rule Packs (53 rules)

| Pack | Rules | Examples |
|------|-------|---------|
| **PII Protection** | 8 | SSN, email, phone, address, DOB, passport, driver's license |
| **Credentials & Secrets** | 8 | API keys, passwords, private keys, tokens, connection strings |
| **Financial Data** | 8 | Credit cards, bank accounts, tax IDs, financial statements |
| **Healthcare (HIPAA)** | 7 | Medical records, diagnoses, prescriptions, insurance IDs |
| **GDPR Compliance** | 7 | EU personal data, consent records, genetic data, biometrics |
| **Intellectual Property** | 8 | Source code, trade secrets, patents, M&A, board minutes |
| **Agent Safety** | 7 | Prompt injection, jailbreak, unauthorized escalation, data exfil |

### DLP Features

- **One-click rule pack deployment** — Apply entire packs from the dashboard
- **Per-rule enable/disable** — Toggle rules without deleting them
- **Rule editing** — Full modal editor for pattern, action, severity
- **Detail modal** — Click any rule to see full configuration
- **Violation tracking** — Real-time scanning with severity levels
- **Org-scoped** — Rules and violations filtered by organization

---

## Multi-Tenant & Organizations

### Internal Organizations

- Multiple organizations within one deployment
- Org switcher on every dashboard page
- Org-scoped data: agents, users, audit logs, vault, DLP, compliance, workforce, activity
- 4 plan tiers: Free (3 agents), Team (25), Enterprise (unlimited), Self-Hosted (unlimited)

### External Client Organizations

- Create client organizations for external customers
- Bind users to a client org with "full access"
- **Strict data isolation** — org-bound users only see their client org's data
- Impersonation respects org boundaries
- Billing records per client org per agent per month

### SSO Configuration

| Provider | Protocol |
|----------|----------|
| Google | OAuth 2.0 |
| Microsoft | OAuth 2.0 |
| GitHub | OAuth 2.0 |
| Okta | OAuth 2.0 / SAML |
| SAML 2.0 | Generic |
| LDAP | LDAP/LDAPS |

---

## Workforce Management

Manage agents like employees:

| Feature | Description |
|---------|-------------|
| **Shift Schedules** | Define work hours per agent, per day |
| **On-Call Rotations** | Automatic rotation schedules |
| **Capacity Planning** | Track agent utilization and availability |
| **Clock Records** | Automatic clock in/out with timestamp logging |
| **Off-Duty Enforcement** | Guardrails prevent agents from working outside shifts |
| **Vacation Auto-Responder** | Automatic responses when agent is "on vacation" |
| **Birthday Automation** | Sends birthday emails on agent DOB |
| **Org-Scoped** | Workforce data filtered by organization |

---

## Knowledge Base & RAG

| Feature | Description |
|---------|-------------|
| **Document Ingestion** | Upload documents for chunking and indexing |
| **BM25F Search** | Full-text search across knowledge bases |
| **RAG Retrieval** | Automatic context injection into agent prompts |
| **Multi-KB Support** | Multiple knowledge bases per org |
| **Agent Access Control** | Per-agent knowledge base permissions |
| **Contribution System** | Agents contribute learned knowledge back |
| **Bulk Import** | Import from external sources |

---

## Communication & Task Pipeline

### Agent-to-Agent Messaging

- Direct messages between agents
- Broadcast messages to all agents
- Topic-based channels
- Priority levels: normal, high, urgent
- Email-based delivery via agent addresses

### Task Pipeline

- Visual node-based task flow editor
- Task assignment and delegation
- Status tracking (pending → claimed → in_progress → completed)
- Org-scoped pipeline views
- SSE streaming for real-time updates

### External Channels

| Channel | Mode | Features |
|---------|------|----------|
| **Email (Gmail)** | OAuth | Full CRUD, attachments, signatures |
| **Email (Outlook)** | OAuth | Full CRUD, attachments |
| **Telegram** | Long-polling | Text, media (images/video/docs), inline buttons |
| **WhatsApp** | Webhook | Text, media, templates |
| **Google Chat** | Webhook + API | Messages, spaces, reactions |

---

## Agent Autonomy System

Agents operate independently with configurable autonomy features:

| Feature | Description |
|---------|-------------|
| **Clock In/Out** | Agents clock in at shift start, out at end |
| **Morning Triage** | Scan overnight accumulation on first clock-in |
| **Daily Catchup** | Scheduled daily summary and planning |
| **Weekly Catchup** | Monday morning weekly review |
| **Goal Tracking** | Check goal progress at configured times |
| **Knowledge Updates** | Weekly knowledge base contribution |
| **Heartbeat** | Periodic health checks with configurable intervals |

---

## Meeting & Voice Intelligence

Agents can attend and participate in meetings:

| Feature | Description |
|---------|-------------|
| **Meeting Voice** | ElevenLabs TTS through virtual audio device |
| **Meeting Monitor** | Track Google Meet attendance |
| **Voice Intelligence** | Real-time transcription and analysis |
| **Browser-Based** | Joins via Playwright browser automation |
| **sox + Virtual Audio** | Audio routing for meeting participation |

---

## Multimodal Support

Agents can process media sent via messaging channels:

| Media Type | Support |
|------------|---------|
| **Images** | Received as base64, sent to LLM as vision content blocks |
| **Videos** | Downloaded and processed locally |
| **Documents** | Downloaded for analysis |
| **Voice Notes** | Transcription via Whisper |

Media handling includes:
- Automatic download from Telegram/WhatsApp
- Base64 encoding for LLM vision models
- Temporary file cleanup
- Dependency auto-installation (ffmpeg, etc.)

---

## Deployment

### Production (Recommended)

```bash
# Main server
pm2 start dist/cli.js --name enterprise -- start

# Standalone agents (one per agent)
pm2 start dist/cli.js --name fola-agent -- agent --env-file=.env.fola
pm2 start dist/cli.js --name john-agent -- agent --env-file=.env.john

# Cloudflare tunnel (optional, for public access)
pm2 start cloudflared -- tunnel run --token $TUNNEL_TOKEN
```

### Docker

```bash
npx @agenticmail/enterprise  # Select "Docker"
docker compose up -d
```

### Fly.io

```bash
npx @agenticmail/enterprise  # Select "Fly.io"
fly launch --copy-config
fly secrets set DATABASE_URL="..." JWT_SECRET="..."
fly deploy
```

### Railway

```bash
npx @agenticmail/enterprise  # Select "Railway"
railway init && railway link && railway up
```

### Local / Development

```bash
npx @agenticmail/enterprise  # Select "Local"
# or
npm run dev  # Build + watch mode
```

---

## CLI Commands

```bash
# Interactive setup wizard (default)
npx @agenticmail/enterprise

# Start the server
npx @agenticmail/enterprise start

# Run a standalone agent
npx @agenticmail/enterprise agent --env-file=.env.fola

# Validate a community skill
npx @agenticmail/enterprise validate ./community-skills/my-skill/
npx @agenticmail/enterprise validate --all --json

# AI-assisted skill scaffolding
npx @agenticmail/enterprise build-skill

# Submit a skill to the marketplace
npx @agenticmail/enterprise submit-skill ./community-skills/my-skill/

# Domain recovery
npx @agenticmail/enterprise recover --domain agents.agenticmail.io --key <hex>

# DNS verification
npx @agenticmail/enterprise verify-domain
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string (auto-optimized for poolers) | — |
| `JWT_SECRET` | JWT signing secret | — |
| `ENCRYPTION_KEY` | Vault encryption key | — |
| `MASTER_KEY` | Admin master key (first-run setup) | — |
| `TRANSPORT_DECRYPT_KEY` | Transport encryption key for API responses | — |
| `PORT` | Server port | `3000` |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | `*` |
| `RATE_LIMIT` | Requests per minute per IP | `120` |
| `DB_POOL_MAX` | Override database connection pool size | Auto (3 for pooler, 10 for direct) |
| `AGENT_ID` | Agent ID (standalone agent mode) | — |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `XAI_API_KEY` | xAI (Grok) API key | — |
| `GOOGLE_API_KEY` | Google AI API key | — |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS API key | — |
| `BRAVE_API_KEY` | Brave Search API key | — |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | — |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare tunnel token | — |

---

## Community Skills Marketplace

Build and share skills:

### Creating a Skill

```bash
npx @agenticmail/enterprise build-skill
```

### Skill Manifest

```json
{
  "name": "my-skill",
  "version": "1.0.0",
  "description": "What this skill does",
  "author": "your-name",
  "category": "productivity",
  "tools": [
    {
      "name": "my_tool",
      "description": "Tool description",
      "parameters": { "type": "object", "properties": {} },
      "riskLevel": "low",
      "sideEffects": ["read"]
    }
  ],
  "config": [
    { "name": "API_KEY", "type": "secret", "required": true }
  ]
}
```

### Validation & Submission

```bash
npx @agenticmail/enterprise validate ./my-skill/
npx @agenticmail/enterprise submit-skill ./my-skill/
```

Skills are synced from the GitHub registry every 6 hours to all deployments.

---

## API Reference

The API is organized into 3 major route groups:

### Auth (`/api/auth/*`)
Login, refresh, logout, SSO callbacks, bootstrap, 2FA, impersonation

### Admin (`/api/admin/*`)
Agent CRUD, user management, settings, audit log, bridge API

### Engine (`/api/engine/*`)
82 modules exposed across 22+ route sub-apps:

| Sub-App | Routes | Description |
|---------|--------|-------------|
| Agents & Lifecycle | `/agents/*`, `/usage/*`, `/budget/*` | Agent management, health, budgets |
| DLP | `/dlp/*` | Rules, rule packs, violations, scanning |
| Guardrails | `/guardrails/*`, `/anomaly-rules/*` | Intervention rules, anomaly detection |
| Journal | `/journal/*` | Action journal, rollback, detail |
| Compliance | `/compliance/*` | 5 report types, HTML export |
| Knowledge | `/knowledge-bases/*` | Documents, RAG, search |
| Communication | `/messages/*`, `/tasks/*` | Messaging, task pipeline |
| Workforce | `/workforce/*` | Schedules, shifts, capacity, clock records |
| Catalog | `/skills/*`, `/souls/*`, `/profiles/*`, `/permissions/*` | Registry |
| Approvals | `/approvals/*`, `/escalation-chains/*` | Approval workflows |
| Activity | `/activity/*`, `/stats/*` | Real-time tracking |
| Vault | `/vault/*` | Encrypted credentials |
| Storage | `/storage/*` | Dynamic agent databases |
| OAuth | `/oauth/*` | SaaS OAuth connect |
| Policies | `/policies/*` | Org policies |
| Memory | `/memory/*` | Agent memory |
| Onboarding | `/onboarding/*` | Agent onboarding |
| Community | `/community/*` | Skill marketplace |
| Roles | `/roles/*` | Custom role templates |
| Organizations | `/orgs/*` | Multi-tenant management |
| Skill Updates | `/skill-updates/*` | Auto-update management |
| Knowledge Contrib | `/knowledge-contribution/*` | Agent contributions |

---

## Requirements

- **Node.js** 18+ (22+ recommended)
- **Database** — Any of the 10 supported backends
- **LLM API Key** — Anthropic, OpenAI, xAI, or Google (at least one)

---

## License

MIT — See [LICENSE](./LICENSE)

---

Built with [AgenticMail](https://agenticmail.io) · [Docs](https://docs.agenticmail.io) · [Discord](https://discord.gg/agenticmail)
