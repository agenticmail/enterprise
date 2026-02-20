# Datadog Monitoring

Query metrics, create monitors, and manage alerts in Datadog. Search logs and APM traces.

## Installation

Install this skill from the AgenticMail skill marketplace:

```
agenticmail skills install datadog-monitoring
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `apiKey` | string | Yes | Datadog API key |
| `applicationKey` | string | Yes | Datadog application key |
| `site` | string | No | Datadog site (e.g. `datadoghq.com`, `datadoghq.eu`, `us5.datadoghq.com`). Defaults to `datadoghq.com` |

## Tools

### Get Metrics (`datadog_get_metrics`)
Query time-series metrics data.

### Create Monitor (`datadog_create_monitor`)
Create a new alerting monitor.

### List Alerts (`datadog_list_alerts`)
List currently triggered alerts.

### Search Logs (`datadog_search_logs`)
Search logs with query filters.

## License

MIT
