# Sentry Error Tracking

Integrate with Sentry Error Tracking to list, get, list and more.

## Tools

- **List Issues** (`sentry_list_issues`) — List Sentry issues for a project. Filter by query string, sort order, or status.
- **Get Issue** (`sentry_get_issue`) — Retrieve details of a specific Sentry issue by its ID. Returns title, culprit, status, event count, and metadata.
- **List Events** (`sentry_list_events`) — List events for a specific Sentry issue. Returns event IDs, timestamps, and tags.
- **List Projects** (`sentry_list_projects`) — List all Sentry projects in the organization. Returns project slugs, platforms, and statuses.
- **Resolve Issue** (`sentry_resolve_issue`) — Resolve a Sentry issue by setting its status to "resolved". Can also set status to "ignored" or "unresolved".

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | token | sentry authentication |

## Category

monitoring · Risk: medium
