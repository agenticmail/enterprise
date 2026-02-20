# Neon Serverless Postgres

Integrate with Neon Serverless Postgres to list, get, list and more.

## Tools

- **List Projects** (`neon_list_projects`) — List all Neon projects accessible to the authenticated user. Returns project names, IDs, regions, and creation dates.
- **Get Project** (`neon_get_project`) — Get detailed information about a specific Neon project by its ID.
- **List Branches** (`neon_list_branches`) — List branches in a Neon project. Returns branch names, IDs, parent info, and timestamps.
- **Create Branch** (`neon_create_branch`) — Create a new branch in a Neon project. Optionally specify a parent branch and endpoint configuration.
- **List Endpoints** (`neon_list_endpoints`) — List compute endpoints in a Neon project. Returns endpoint IDs, hosts, branch associations, and status.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | neon authentication |

## Category

database · Risk: medium
