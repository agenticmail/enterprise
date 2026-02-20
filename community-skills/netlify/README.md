# Netlify

Integrate with Netlify to list, get, list and more.

## Tools

- **List Sites** (`netlify_list_sites`) — List all Netlify sites accessible to the authenticated user. Returns site names, URLs, and deploy statuses.
- **Get Site** (`netlify_get_site`) — Get detailed information about a specific Netlify site by ID or custom domain.
- **List Deploys** (`netlify_list_deploys`) — List recent deploys for a Netlify site. Returns deploy IDs, states, commit messages, and timestamps.
- **Create Deploy** (`netlify_create_deploy`) — Trigger a new deploy for a Netlify site. Can clear cache and set a custom title for the deploy.
- **List Forms** (`netlify_list_forms`) — List forms and their submission counts for a Netlify site.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | token | netlify authentication |

## Category

cloud-infrastructure · Risk: medium
