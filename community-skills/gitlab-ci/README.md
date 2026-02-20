# GitLab CI/CD

Manage GitLab merge requests, pipelines, and issues. Trigger CI/CD jobs and view logs.

## Installation

Install this skill from the AgenticMail skill registry:

```
agenticmail skill install gitlab-ci
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `host` | string | Yes | GitLab instance URL (e.g., https://gitlab.com or self-hosted URL) |
| `privateToken` | string | Yes | GitLab personal access token with api scope |
| `defaultProject` | string | No | Default project path (e.g., mygroup/myproject) |

Example configuration:

```json
{
  "host": "https://gitlab.com",
  "privateToken": "glpat-xxxxxxxxxxxxxxxxxxxx",
  "defaultProject": "mygroup/myproject"
}
```

## Tools

### Create Merge Request
- **ID:** `gitlab_create_mr`
- **Description:** Create a new merge request

### Trigger Pipeline
- **ID:** `gitlab_trigger_pipeline`
- **Description:** Trigger a CI/CD pipeline

### List Issues
- **ID:** `gitlab_list_issues`
- **Description:** List project issues with filters

### Pipeline Status
- **ID:** `gitlab_get_pipeline_status`
- **Description:** Get status of a pipeline run

## License

MIT
