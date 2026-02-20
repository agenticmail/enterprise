# Auth0

Integrate with Auth0 to list, get, list and more.

## Tools

- **List Users** (`auth0_list_users`) — List Auth0 users. Optionally search using Lucene query syntax or filter by connection.
- **Get User** (`auth0_get_user`) — Retrieve details of a specific Auth0 user by their user_id. Returns profile, identities, and metadata.
- **List Connections** (`auth0_list_connections`) — List Auth0 connections (identity providers). Returns connection names, strategies, and enabled clients.
- **List Clients** (`auth0_list_clients`) — List Auth0 clients (applications). Returns client names, IDs, app types, and callback URLs.
- **Block User** (`auth0_block_user`) — Block or unblock an Auth0 user by setting the blocked flag. Blocked users cannot log in.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | token | auth0 authentication |

## Category

security · Risk: high
