# OpsGenie

Integrate with OpsGenie to list, create, acknowledge and more.

## Tools

- **List Alerts** (`opsgenie_list_alerts`) — List alerts from OpsGenie. Optionally filter by query, status, or priority.
- **Create Alert** (`opsgenie_create_alert`) — Create a new alert in OpsGenie. Provide a message and optional priority, tags, and description.
- **Acknowledge Alert** (`opsgenie_acknowledge_alert`) — Acknowledge an OpsGenie alert. Accepts the alert by ID or alias.
- **Close Alert** (`opsgenie_close_alert`) — Close an OpsGenie alert. Accepts the alert by ID or alias.
- **List Schedules** (`opsgenie_list_schedules`) — List on-call schedules from OpsGenie. Returns schedule names, timezones, and teams.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | opsgenie authentication |

## Category

monitoring · Risk: medium
