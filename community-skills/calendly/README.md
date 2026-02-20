# Calendly

Integrate with Calendly to list, get, list and more.

## Tools

- **List Events** (`calendly_list_events`) — List scheduled Calendly events. Filter by status and date range. Requires the user URI.
- **Get Event** (`calendly_get_event`) — Get detailed information about a specific Calendly event by its UUID.
- **List Event Types** (`calendly_list_event_types`) — List available Calendly event types (booking pages) for a user. Returns names, durations, and scheduling URLs.
- **Cancel Event** (`calendly_cancel_event`) — Cancel a scheduled Calendly event. Provide the event UUID and an optional cancellation reason.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | token | calendly authentication |

## Category

communication · Risk: medium
