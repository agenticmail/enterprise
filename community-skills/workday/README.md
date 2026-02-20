# Workday

Integrate with Workday to list, get, search and more.

## Tools

- **List Workers** (`workday_list_workers`) — List workers from Workday. Returns a paginated list of all workers in the organization.
- **Get Worker** (`workday_get_worker`) — Get detailed information about a specific Workday worker by their ID. Returns name, position, department, manager, and contact info.
- **Search Workers** (`workday_search_workers`) — Search for workers in Workday by name, email, or other criteria. Returns matching worker records.
- **List Organizations** (`workday_list_organizations`) — List organizations (departments, cost centers, divisions) in Workday. Useful for understanding the org structure.
- **Get Time Off Balance** (`workday_get_time_off_balance`) — Get time-off balance information for a specific Workday worker. Shows available balances across different time-off plans.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | workday authentication |

## Category

hr · Risk: medium
