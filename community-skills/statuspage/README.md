# Atlassian Statuspage

Integrate with Atlassian Statuspage to list, create, update and more.

## Tools

- **List Incidents** (`statuspage_list_incidents`) — List incidents from the Statuspage. Returns incident names, statuses, and impact levels.
- **Create Incident** (`statuspage_create_incident`) — Create a new incident on the Statuspage. Provide a name, status, and optional impact and component IDs.
- **Update Incident** (`statuspage_update_incident`) — Update an existing Statuspage incident. Can change status, add an update message, or modify impact.
- **List Components** (`statuspage_list_components`) — List components on the Statuspage. Returns component names, statuses, and descriptions.
- **Update Component** (`statuspage_update_component`) — Update a component on the Statuspage. Typically used to change the operational status of a component.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | statuspage authentication |

## Category

monitoring · Risk: medium
