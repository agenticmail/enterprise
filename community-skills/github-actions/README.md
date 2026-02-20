# GitHub Actions

Trigger workflows, view run status, and manage GitHub Actions across repositories.

## Installation

```bash
agenticmail skill install github-actions
```

## Configuration

| Field         | Type   | Required | Description                                                        |
| ------------- | ------ | -------- | ------------------------------------------------------------------ |
| `githubToken` | string | Yes      | GitHub personal access token with actions scope                    |
| `defaultRepo` | string | No       | Default repository in owner/repo format (e.g., my-org/my-repo)    |

## Tools

| Tool                     | Description                           |
| ------------------------ | ------------------------------------- |
| `gha_trigger_workflow`   | Trigger a GitHub Actions workflow     |
| `gha_list_runs`          | List recent workflow runs             |
| `gha_get_run_status`     | Get status of a specific run          |
| `gha_download_artifacts` | Download artifacts from a run         |

## License

MIT
