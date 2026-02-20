# CircleCI Pipelines

Trigger builds, view pipeline status, and manage CircleCI workflows.

## Installation

```bash
agenticmail skill install circleci-pipelines
```

## Configuration

| Field                | Type   | Required | Description                                                                             |
| -------------------- | ------ | -------- | --------------------------------------------------------------------------------------- |
| `apiToken`           | string | Yes      | CircleCI personal API token for authentication                                          |
| `defaultProjectSlug` | string | No       | Default project slug in the format vcs-type/org-name/repo-name (e.g., gh/my-org/my-repo) |

## Tools

| Tool                        | Description                    |
| --------------------------- | ------------------------------ |
| `circleci_trigger_pipeline` | Trigger a new pipeline run     |
| `circleci_get_status`       | Check status of a pipeline     |
| `circleci_list_artifacts`   | List build artifacts           |

## License

MIT
