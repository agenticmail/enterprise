# SalesLoft

Integrate with SalesLoft to list, create, list and more.

## Tools

- **List People** (`salesloft_list_people`) — List people (contacts) from SalesLoft with optional filtering by email, updated date, or cadence membership.
- **Create Person** (`salesloft_create_person`) — Create a new person in SalesLoft. Provide at least an email address.
- **List Cadences** (`salesloft_list_cadences`) — List cadences from SalesLoft. Returns cadence names, types, and people counts.
- **Add To Cadence** (`salesloft_add_to_cadence`) — Add a person to a SalesLoft cadence. Creates a cadence membership linking the person to the cadence.
- **List Activities** (`salesloft_list_activities`) — List activities (emails, calls, etc.) from SalesLoft. Filter by type, person, or date range.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | salesloft authentication |

## Category

crm · Risk: medium
