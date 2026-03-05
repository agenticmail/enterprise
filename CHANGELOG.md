# Changelog

All notable changes to AgenticMail Enterprise are documented here.

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

[0.5.320]: https://github.com/agenticmail/enterprise/releases/tag/v0.5.320
[0.5.315]: https://github.com/agenticmail/enterprise/releases/tag/v0.5.315
[0.5.313]: https://github.com/agenticmail/enterprise/releases/tag/v0.5.313
[0.5.312]: https://github.com/agenticmail/enterprise/releases/tag/v0.5.312
