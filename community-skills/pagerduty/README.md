# PagerDuty

Integrate with PagerDuty to list, create, acknowledge and more.

## Tools

- **List Incidents** (`pd_list_incidents`) — List incidents from PagerDuty. Optionally filter by status, urgency, or service.
- **Create Incident** (`pd_create_incident`) — Create a new incident in PagerDuty. Requires a title and service ID.
- **Acknowledge Incident** (`pd_acknowledge_incident`) — Acknowledge one or more PagerDuty incidents. Changes the status from "triggered" to "acknowledged".
- **Resolve Incident** (`pd_resolve_incident`) — Resolve one or more PagerDuty incidents. Changes the status to "resolved".
- **List Services** (`pd_list_services`) — List services from PagerDuty. Returns service names, statuses, and escalation policies.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | pagerduty authentication |

## Category

monitoring · Risk: medium
