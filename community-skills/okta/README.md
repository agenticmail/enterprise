# Okta Identity

Integrate with Okta Identity to list, get, list and more.

## Tools

- **List Users** (`okta_list_users`) — List Okta users. Optionally filter by search query, status, or pagination.
- **Get User** (`okta_get_user`) — Retrieve details of a specific Okta user by ID or login. Returns profile, status, and group memberships.
- **List Groups** (`okta_list_groups`) — List Okta groups. Optionally filter by name or type.
- **List Apps** (`okta_list_apps`) — List Okta applications. Returns app names, labels, statuses, and sign-on modes.
- **Deactivate User** (`okta_deactivate_user`) — Deactivate an Okta user by their user ID. This changes the user status to DEPROVISIONED. The user can be reactivated later.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | okta authentication |

## Category

security · Risk: high
