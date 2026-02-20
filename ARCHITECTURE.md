# AgenticMail Enterprise Architecture

## Vision
Deploy and manage AI agents as employees within organizations. Companies configure agent skills, permissions, and deployment targets from a web dashboard. Agents run in Docker containers, VPS servers, or cloud platforms (Fly.io, Railway) — fully provisioned, monitored, and governed.

## Core Principles
1. **Bring your own database**: SQLite, Postgres, MySQL, MongoDB, DynamoDB, Turso — any SQL or NoSQL backend
2. **Bring your own cloud**: Docker, VPS (SSH), Fly.io, Railway, or local development
3. **Write-through persistence**: All engine state lives in memory for fast reads, with every mutation persisted to the database. On startup, state is hydrated from DB.
4. **Single-file dashboard**: React 18 admin UI served as a single HTML file — no build step, no node_modules on the frontend
5. **Hono API server**: Lightweight, fast HTTP framework with full middleware stack

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Dashboard (Web UI)                         │
│              Single HTML · React 18 · CDN-loaded             │
└─────────────────────────┬────────────────────────────────────┘
                          │ HTTP/SSE
┌─────────────────────────▼────────────────────────────────────┐
│                   Hono API Server (server.ts)                 │
│                                                               │
│  ┌──────────┐  ┌───────────┐  ┌────────────────────────────┐ │
│  │  Auth     │  │  Admin    │  │         Engine              │ │
│  │  /auth/*  │  │  /api/*   │  │  /api/engine/*              │ │
│  │          │  │           │  │                              │ │
│  │  JWT     │  │  Users    │  │  Skills · PermissionEngine   │ │
│  │  Login   │  │  Agents   │  │  AgentConfigGenerator        │ │
│  │  Cookies │  │  Audit    │  │  DeploymentEngine            │ │
│  │  API Keys│  │  Keys     │  │  ApprovalEngine (DB)         │ │
│  │  SAML*   │  │  Settings │  │  AgentLifecycleManager (DB)  │ │
│  │  OIDC*   │  │  Rules    │  │  KnowledgeBaseEngine (DB)    │ │
│  └──────────┘  └───────────┘  │  TenantManager (DB)          │ │
│                               │  ActivityTracker (DB)         │ │
│                               │  Runtime Hooks               │ │
│                               │  AgenticMail Bridge          │ │
│                               └────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │               Middleware Stack                           │ │
│  │  Request ID · CORS · Rate Limit · Security Headers      │ │
│  │  Error Handler · Audit Logger · RBAC (requireRole)      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │               Resilience Layer                           │ │
│  │  CircuitBreaker · HealthMonitor · withRetry             │ │
│  │  RateLimiter · KeyedRateLimiter                         │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────┬────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌─────────────┐  ┌──────────────┐  ┌──────────────┐
│ Admin DB    │  │  Engine DB   │  │  Deployer    │
│ (adapter.ts)│  │  (db-adapter) │  │              │
│             │  │              │  │  Docker      │
│ Users       │  │ 15 tables:   │  │  SSH/VPS     │
│ Agents      │  │ managed_agents│  │  Fly.io      │
│ API Keys    │  │ state_history │  │  Railway     │
│ Audit Log   │  │ permission_   │  │              │
│ Settings    │  │  profiles    │  │  execCommand  │
│ Rules       │  │ organizations│  │  execSSH     │
│             │  │ knowledge_   │  │              │
│ 6 backends: │  │  bases       │  └──────────────┘
│ SQLite      │  │ kb_documents │
│ Postgres    │  │ kb_chunks    │
│ MySQL       │  │ tool_calls   │
│ MongoDB     │  │ activity_    │
│ DynamoDB    │  │  events      │
│ Turso       │  │ conversations│
│             │  │ approval_    │
└─────────────┘  │  requests    │
                 │ approval_    │
                 │  policies    │
                 └──────────────┘

* SAML/OIDC = stubs returning 501 (planned)
```

## Engine Persistence Model

All engine modules use a **write-through cache** pattern:

1. **In-memory Maps** for fast reads (sub-millisecond)
2. **Every write** also persists to the database via `EngineDatabase`
3. **On startup**, `loadFromDb()` hydrates all Maps from the database
4. **DB writes are fire-and-forget** for activity/events (non-blocking via `.catch(() => {})`)
5. **DB writes are awaited** for agents/orgs/knowledge bases (data integrity)

### Wiring Flow
```
server.ts
  └─ setEngineDb(engineDb)        // Called on first /api/engine/* request
       ├─ lifecycle.setDb(db)      // Loads managed_agents into memory
       ├─ approvals.setDb(db)      // Loads pending approval_requests
       ├─ knowledgeBase.setDb(db)  // Loads knowledge_bases + documents + chunks
       ├─ activity.setDb(db)       // Stores reference for fire-and-forget writes
       ├─ tenants.setDb(db)        // Loads organizations into memory
       └─ permissionEngine.setDb(db) // Stores reference for profile persistence
```

### Migration System
- 15 engine tables defined in `db-schema.ts`
- Versioned migrations with tracking table `engine_migrations`
- Auto-converts SQLite DDL to Postgres/MySQL dialect
- NoSQL support via optional `nosql()` migration callbacks for MongoDB/DynamoDB

## Agent Lifecycle State Machine

```
draft → configuring → ready → provisioning → deploying → starting → running
                                                                      ↕
                                                                   degraded
                                                                      ↓
                                         stopped ← error ← destroying
```

- **12 states**: draft, configuring, ready, provisioning, deploying, starting, running, degraded, stopped, error, updating, destroying
- **Health check loop**: 30-second interval when running/degraded
- **Auto-recovery**: Restarts after 5 consecutive health failures
- **Budget enforcement**: Auto-stop when monthly token/cost budget exceeded
- **State transitions persisted** to `agent_state_history` table

## File Structure

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
│   ├── sql-schema.ts           # Shared DDL + migrations
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
│   ├── agent-config.ts         # AgentConfigGenerator: workspace files, gateway, docker-compose, systemd
│   ├── deployer.ts             # DeploymentEngine: Docker, VPS/SSH, Fly.io, Railway
│   ├── lifecycle.ts            # AgentLifecycleManager: state machine, health checks (DB-persisted)
│   ├── approvals.ts            # ApprovalEngine: policies, requests, decisions (DB-persisted)
│   ├── knowledge.ts            # KnowledgeBaseEngine: docs, chunking, embeddings, RAG (DB-persisted)
│   ├── tenant.ts               # TenantManager: orgs, plans, limits, usage (DB-persisted)
│   ├── activity.ts             # ActivityTracker: events, tool calls, conversations, SSE (DB-persisted)
│   ├── tool-catalog.ts         # 167 tool IDs mapped to skills
│   ├── runtime/                # Runtime hooks and plugin integration
│   ├── agenticmail-bridge.ts   # Bridge to AgenticMail API
│   ├── db-adapter.ts           # EngineDatabase wrapper (682 lines, all CRUD implemented)
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

## Key Design Decisions

1. **Single HTML dashboard**: No build step. React 18 + ReactDOM loaded from CDN. All components defined inline. Served at `/dashboard`. This keeps the package small and eliminates frontend toolchain complexity.

2. **Lazy engine initialization**: Engine routes and EngineDatabase are initialized on first `/api/engine/*` request (not at server startup). This avoids blocking startup and allows the admin DB to be ready first.

3. **Two database layers**: Admin DB (DatabaseAdapter) handles users/agents/audit/settings. Engine DB (EngineDatabase) handles lifecycle/approvals/knowledge/activity/tenants. Both can use the same underlying database connection, but the Engine DB has its own tables and migration system.

4. **Write-through + fire-and-forget**: Critical data (agents, orgs, knowledge bases) uses `await db.upsert()`. High-volume data (activity events, tool calls) uses `db.insert().catch(() => {})` to avoid blocking the request path.

5. **Module-level singletons with late binding**: Engine modules are instantiated at module load time (top of routes.ts) as singletons. Database is injected later via `setDb()` when `setEngineDb()` is called. This allows routes to be defined before the DB is ready.
