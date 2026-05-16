# Changelog

All notable changes to AgenticMail Enterprise are documented here.

## [0.5.560] - 2026-05-16

### Fixed — agent-detail tab URL now reflects the active tab

Operator report (correct): clicking a tab on the agent-detail page (Overview, Email, Tools, Channels, Autonomy, etc.) didn't update the URL. The address bar stayed at `/dashboard/agents/<id>` regardless of which tab was active. Three downstream problems:

1. **Refresh always snapped back to Overview** — `useState('overview')` was the source of truth; the URL contributed nothing on reload.
2. **Deep-links / shared links / external doc links to a specific tab were impossible** — there was no URL shape that meant "open this agent at the Channels tab".
3. **Browser back/forward buttons didn't navigate between tabs** — popstate had nothing tab-shaped to react to.

### What changed

URL contract is now `/dashboard/agents/<id>/<tab>` (and bare `/dashboard/agents/<id>` is honored as a redirect to `/overview`):

- `parseRoute()` in `src/dashboard/app.js` reads the third path segment as `agentTab` (returns `null` when absent).
- `selectedAgentTab` is now state on `App` alongside `selectedAgentId`, so the URL contract lives in exactly one place rather than in `AgentDetailPage`'s internal state.
- `setSelectedAgentId(id)` and `navigateToAgent(id)` both push `/dashboard/agents/<id>/overview` (so the URL is always tab-qualified, not bare).
- New `setSelectedAgentTab(tab)` helper pushes the new tab segment and is wired down to `AgentDetailPage` as the `onTabChange` prop.
- `popstate` handler reads `agentTab` too — browser back / forward now navigates between tabs the same way it navigates between pages.

In `src/dashboard/pages/agent-detail/index.js`:

- `useState('overview')` becomes `useState(props.agentTab || 'overview')` so deep-links land on the right tab on first paint.
- `useEffect` on `[props.agentTab]` re-syncs the local tab state when the parent's URL parsing emits a new value (e.g. operator hit browser-back).
- New `changeTab(t)` wrapper that does `setTab(t) + props.onTabChange(t)` in one place; every tab-button click + the programmatic switch inside `WhatsAppSection` now flow through it.

### What I deliberately didn't change

- **Bare `/dashboard/agents/<id>` is still accepted** on direct navigation (the bookmark won't 404). It just becomes `.../<id>/overview` once `setSelectedAgentId` runs. Strict redirect would break existing bookmarks for zero gain.
- **Unknown tab values aren't redirected away.** A URL like `/dashboard/agents/<id>/banana` will render with no tab body (because the section render is gated by `tab === '<name>'`). Could add a toast + redirect to overview, but silent fall-through matches how the rest of the dashboard treats unknown URLs.

## [0.5.453] - 2026-03-13

### Fixed
- **Daily target not persisting** — `poly_goals` table was created via fire-and-forget (unwaited async) at route registration time; if engine DB wasn't ready yet, the table was never created. Moved to `ensurePolyDB()` which is properly awaited via middleware before every polymarket route.
- **Deploy stuck after PM2 process deletion** — When PM2 process is deleted externally, agent state stayed "running" in DB, hiding the Deploy button. Fixed: Deploy/Redeploy button now shows in all non-transient states; added Reset State button for stuck states; deployer restart falls through to full deploy when process is missing; deployer stop handles "not found" gracefully.
- **Goals evaluate endpoint SQLite crash** — `CURRENT_TIMESTAMP::text` (Postgres-only cast) replaced with standard `CAST(CURRENT_TIMESTAMP AS TEXT)` for cross-DB compatibility.

## [0.5.443] - 2026-03-11

### Added
- **Trading Optimizer Suite** — 6 new high-frequency trading tools (`polymarket-optimizer` skill):
  - `poly_daily_scorecard` — Real-time P&L vs daily target, win rate, capital utilization, trading status (AHEAD/ON_TRACK/BEHIND/TARGET_HIT/STOP_TRADING)
  - `poly_momentum_scanner` — Find markets with significant price movement in real-time; replaces static search for discovering active opportunities
  - `poly_quick_edge` — One-call GO/NO-GO trade decision with edge %, Kelly size, and action (STRONG_BUY/BUY/MARGINAL/NO_TRADE/SELL); replaces 6+ separate tool calls
  - `poly_position_heatmap` — All positions ranked by urgency (CRITICAL/HIGH/MEDIUM/LOW) with specific action needed for each
  - `poly_profit_lock` — Auto-conservative mode after hitting daily target; returns adjusted position sizes and trading mode
  - `poly_capital_recycler` — Redeploy freed capital to best opportunities after position closes; keeps capital working
- **Daily Scorecard Dashboard** — New section in Polymarket Overview tab showing real-time daily P&L progress bar, target tracking, realized/unrealized P&L, trade count, win rate, and available capital
- **Daily Scorecard API** — `GET /polymarket/:agentId/daily-scorecard` endpoint returning comprehensive daily trading metrics
- **Browser Market Discovery** — Agents can browse polymarket.com to find market IDs when API returns stale results (system prompt guidance, no login required)
- **Universal Message Trimmer** — Extracted stale aging + inline truncation into standalone `message-trimmer.ts` module; applies to ALL tools (web, browser, email, polymarket) not just polymarket
- **Market Freshness Tracking** — Per-agent tracking of recently-analyzed markets with 30-min TTL; prevents agents from repeatedly analyzing the same stale markets
- **Dead Market Filtering** — Markets with all-zero prices, zero liquidity, or resolved status are automatically filtered from search/screen results
- **CLOB Rate Limit Resilience** — Gamma API fallbacks for orderbook depth, whale tracking, flow analysis, and price discovery when CLOB API is rate-limited
- **Cross-DB Date Helpers** — `dateAgo()`, `dateAgoMin()`, `dateAhead()` for watcher SQL queries; replaces PostgreSQL-specific `::timestamptz`/`INTERVAL` syntax
- **Comprehensive Topic Extraction** — `extractTopics()` expanded from 6 patterns to 25+ groups covering US/global politics, crypto, sports, AI, regulation, and more

### Fixed
- **PostgreSQL-only SQL in watcher** — Fixed 15+ queries using `::timestamptz`, `NOW()`, `INTERVAL` that failed on SQLite; all now use parameterized ISO date strings
- **PostgreSQL DDL in portfolio** — Fixed `SERIAL PRIMARY KEY` → `INTEGER PRIMARY KEY AUTOINCREMENT` and `TIMESTAMPTZ` → `TEXT`
- **Dead CLOB endpoints** — Replaced 3 dead `CLOB_API/markets/` calls with working `GAMMA_API/markets?clob_token_ids=` in watcher
- **`poly_approve_trade`** — Fixed trade fetching AFTER resolution (trade disappeared); now fetches BEFORE resolving
- **`poly_place_batch_orders`** — Fixed tool that validated but never executed orders; now creates pending trades and executes in autonomous mode
- **`poly_resolution_risk` "Market not found"** — Auto-detects 0x condition IDs passed as slug parameter; added Gamma search fallback
- **`poly_quick_analysis` null values** — Added fallback data when CLOB is rate-limited instead of returning null for orderbook/regime/kelly
- **`poly_get_open_orders` / `poly_get_order`** — Fixed to check database as fallback, not just in-memory Map
- **`poly_leaderboard` / `poly_top_holders`** — Fixed dead Gamma endpoints; now uses data-api fallback
- **Proactive wake channel routing** — Uses manager's configured communication channel (telegram/whatsapp/email) instead of hardcoded values
- **Hardcoded identity in proactive wake** — Replaced hardcoded `senderName: 'Ope'` with dynamic manager info
- **Unused code cleanup** — Removed `_TradingConfig`, `PriceAlert`, `PaperPosition` interfaces, `priceAlerts`/`paperPositions`/`autoApproveRules` Maps, `getConfig()`/`checkAutoApprove()` functions, `_pricingCache` from agent-loop

## [0.5.320] - 2026-03-05

### Added
- **Microsoft 365 Integration** — 97 tools across 13 services (Outlook Mail, Calendar, OneDrive, Teams, Excel, SharePoint, OneNote, To Do, Contacts, PowerPoint, Planner, Power BI)
- **Microsoft Graph API helper** — Retry with backoff, rate-limit handling, auto-pagination, JSON batching
- **Microsoft system prompts** — 12 structured prompt files mirroring Google tools pattern
- **Task pipeline redesign** — Table/list view with status tabs, search, pagination, real-time updates via webhook
- **Client organization data isolation** — Org-bound users see only their organization's data
- **Visible roles configuration** — Parent org controls which roles client org users can see
- **Cross-platform dependency manager** — macOS, Linux, Windows support with policy-driven installation
- **Org-wide dependency policy** — Configurable from Settings > Security tab
- **PM2 production persistence** — ecosystem.config.cjs, LaunchAgent, log rotation
- **LOG_LEVEL env var** — Production log noise suppression
- **Port validation** — Checks availability before local agent deployment
- **Screen unlock** — Agents can auto-unlock machine screen
- **Per-section editing** — Independent edit buttons on Security and Permissions tabs
- **Dynamic sidebar company name** — Updates in real-time from settings
- **Tiered tool loading** — ~75% tool count reduction for messaging channels

### Fixed
- DB connection pool exhaustion (MaxClientsInSessionMode)
- Smart DB URL auto-configuration for Supabase/Neon
- Stop-impersonation logging user out
- Client org skills/roles showing all data during impersonation
- Agent UUID display in compliance reports

## [0.5.315] - 2026-03-03

### Added
- Client organization data isolation across all dashboard pages
- `allowed_roles` JSONB column for role visibility control
- Impersonation token refresh preserving org restrictions

## [0.5.313] - 2026-03-01

### Added
- Smart DB URL auto-configuration (Supabase/Neon detection)
- 7 enterprise DLP rule packs (53 rules)
- SOC 2 Type II compliance reports with HTML export
- Comprehensive README rewrite

### Fixed
- DB connection pool exhaustion
- Compliance report generation crashes

## [0.5.312] - 2026-02-28

### Added
- Transport encryption (AES-256-GCM)
- Org switchers across all dashboard pages
- DLP rule editing, enable/disable toggle, detail modal
- Journal action detail modal

### Fixed
- Double encryption with Hono wildcard middleware
- Engine sub-app body forwarding
- Org switching not reloading data
- Knowledge base auto-assign persistence
- Workforce/guardrails/audit org filtering

[0.5.443]: https://github.com/agenticmail/enterprise/releases/tag/v0.5.443
[0.5.320]: https://github.com/agenticmail/enterprise/releases/tag/v0.5.320
[0.5.315]: https://github.com/agenticmail/enterprise/releases/tag/v0.5.315
[0.5.313]: https://github.com/agenticmail/enterprise/releases/tag/v0.5.313
[0.5.312]: https://github.com/agenticmail/enterprise/releases/tag/v0.5.312
