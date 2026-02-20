# Render

Integrate with Render to list, get, list and more.

## Tools

- **List Services** (`render_list_services`) — List all services in the Render account. Returns service names, types, regions, and statuses.
- **Get Service** (`render_get_service`) — Get detailed information about a specific Render service by its ID.
- **List Deploys** (`render_list_deploys`) — List recent deploys for a Render service. Returns deploy IDs, statuses, commit info, and timestamps.
- **Trigger Deploy** (`render_trigger_deploy`) — Trigger a new deploy for a Render service. Optionally clear the build cache.
- **List Envs** (`render_list_envs`) — List environment variables for a Render service. Sensitive values are masked.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | render authentication |

## Category

cloud-infrastructure · Risk: medium
