# ServiceNow

Integrate with ServiceNow to list, create, update and more.

## Tools

- **List Incidents** (`snow_list_incidents`) — List incidents from ServiceNow. Optionally filter by state, priority, or assignment group.
- **Create Incident** (`snow_create_incident`) — Create a new incident in ServiceNow. Provide a short description and optional details.
- **Update Incident** (`snow_update_incident`) — Update an existing ServiceNow incident. Can change state, priority, assignment, or add work notes.
- **List Changes** (`snow_list_changes`) — List change requests from ServiceNow. Optionally filter by state, type, or risk.
- **Search** (`snow_search`) — Search records across ServiceNow tables using encoded queries. Useful for finding records by keyword or advanced criteria.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | servicenow authentication |

## Category

platform · Risk: high
