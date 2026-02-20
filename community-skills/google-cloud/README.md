# Google Cloud Platform

Manage GCP resources including Cloud Storage, Compute Engine, and BigQuery.

## Installation

Install this skill from the AgenticMail skill marketplace:

```
agenticmail skills install google-cloud
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `serviceAccountKey` | string | Yes | GCP service account key (JSON string) |
| `projectId` | string | Yes | GCP project ID |

## Tools

### List Buckets (`gcp_list_buckets`)
List Cloud Storage buckets.

### Run BigQuery (`gcp_run_bigquery`)
Execute a BigQuery SQL query.

### List Instances (`gcp_list_instances`)
List Compute Engine instances.

## License

Apache-2.0
