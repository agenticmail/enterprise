# Org-Scoped Credentials Architecture

## Overview
All integrations (Google Workspace, Microsoft 365, Skills, API keys, OAuth) must be
organization-scoped. When an agent belongs to an org, it uses THAT org's credentials.

## Current State
- Vault already namespaces by `orgId` — good foundation
- `emailConfig` with OAuth tokens is stored per-agent on `managed_agents.config`
- `tokenProvider` is created from `emailConfig` at agent boot
- Dashboard integration pages pass `orgId=default` or the internal org

## Target Architecture

### 1. Organization Integrations Table (DB)
New table: `organization_integrations`
- org_id, provider (google/microsoft/custom), config (encrypted JSON)
- Stores: OAuth client ID/secret, refresh tokens, scopes, domain
- Per-org Google Workspace: service account or OAuth consent per org
- Per-org Microsoft 365: app registration per org

### 2. Vault Credential Resolution
When agent needs credentials:
1. Get agent's `client_org_id`
2. Look up org's integration config from vault (keyed by org_id + provider)
3. Fall back to internal/default org if agent has no org

### 3. Dashboard Changes
- **Organizations page**: Add "Integrations" tab with Google/Microsoft/Custom config
- **Agent Email tab**: Show org-specific email config, not internal
- **Agent Skills tab**: Filter integrations by org
- **Community Skills**: Filter by org

### 4. Runtime Changes  
- Token provider resolves from org's vault secrets
- MCP bridge uses org-scoped credentials
- Email config inherits from org when not agent-specific

## Work Packages
1. DB schema + migration (org_integrations table)
2. Backend routes (CRUD org integrations, credential resolution)
3. Organization page UI (Integrations tab)
4. Agent email tab (org-aware)
5. Agent runtime credential resolution
6. Skills pages (org filtering)
