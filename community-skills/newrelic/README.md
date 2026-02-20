# New Relic

Integrate with New Relic to list, get, query and more.

## Tools

- **List Applications** (`nr_list_applications`) — List New Relic APM applications. Optionally filter by name or health status.
- **Get Application** (`nr_get_application`) — Retrieve details of a specific New Relic APM application by ID. Returns health status, throughput, response time, and error rate.
- **Query Nrql** (`nr_query_nrql`) — Execute a NRQL query against New Relic Insights. Returns query results as structured data.
- **List Alerts** (`nr_list_alerts`) — List New Relic alert policies. Returns policy names, IDs, and incident preferences.
- **Get Synthetics** (`nr_get_synthetics`) — List New Relic Synthetics monitors. Returns monitor names, types, statuses, and locations.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | newrelic authentication |

## Category

monitoring · Risk: medium
