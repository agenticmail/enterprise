# Heroku

Integrate with Heroku to list, get, list and more.

## Tools

- **List Apps** (`heroku_list_apps`) — List all Heroku apps accessible to the authenticated user. Returns app names, regions, stacks, and last updated times.
- **Get App** (`heroku_get_app`) — Get detailed information about a specific Heroku app by name or ID.
- **List Dynos** (`heroku_list_dynos`) — List all dynos for a Heroku app. Returns dyno names, types, states, sizes, and commands.
- **Restart Dyno** (`heroku_restart_dyno`) — Restart a specific dyno or all dynos for a Heroku app. If dynoIdOrName is omitted, all dynos are restarted.
- **Get Config** (`heroku_get_config`) — Get config vars (environment variables) for a Heroku app. Returns all key-value pairs. Sensitive values may be masked.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | token | heroku authentication |

## Category

cloud-infrastructure · Risk: high
