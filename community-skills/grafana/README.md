# Grafana

Integrate with Grafana to list, get, list and more.

## Tools

- **List Dashboards** (`grafana_list_dashboards`) — List Grafana dashboards. Optionally filter by folder ID or tag. Returns dashboard titles, UIDs, and URLs.
- **Get Dashboard** (`grafana_get_dashboard`) — Retrieve a specific Grafana dashboard by UID. Returns dashboard title, panels, and metadata.
- **List Alerts** (`grafana_list_alerts`) — List Grafana alert rules. Returns alert names, states, and associated dashboards.
- **List Datasources** (`grafana_list_datasources`) — List all Grafana datasources. Returns datasource names, types, and connection details.
- **Search** (`grafana_search`) — Search Grafana for dashboards and folders by query string. Returns matching items with types and UIDs.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | grafana authentication |

## Category

monitoring · Risk: medium
