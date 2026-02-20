# Google Analytics

Retrieve website analytics data from Google Analytics 4. Query reports, metrics, and dimensions.

## Installation

```bash
agenticmail skill install google-analytics
```

## Configuration

| Field               | Type   | Required | Description                                                              |
| ------------------- | ------ | -------- | ------------------------------------------------------------------------ |
| `serviceAccountKey` | string | Yes      | Google Cloud service account key as a JSON string for authentication     |
| `defaultPropertyId` | string | No       | Default GA4 property ID to use when none is specified (e.g., 123456789)  |

## Tools

| Tool                | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `ga_run_report`     | Run an analytics report with metrics and dimensions    |
| `ga_get_realtime`   | Get real-time active users and events                  |
| `ga_list_properties`| List all GA4 properties                                |

## License

MIT
