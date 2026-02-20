# GitHub Issues Manager

Create, update, close, and triage GitHub issues. Supports labels, milestones, and assignees.

## Installation

Install this skill from the AgenticMail skill registry:

```
agenticmail skill install github
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `githubToken` | string | Yes | GitHub personal access token with repo scope |
| `defaultRepo` | string | No | Default repository in owner/repo format |

Example configuration:

```json
{
  "githubToken": "ghp_xxxxxxxxxxxxxxxxxxxx",
  "defaultRepo": "myorg/myrepo"
}
```

## Tools

### Create Issue
- **ID:** `github_create_issue`
- **Description:** Create a new GitHub issue

### Update Issue
- **ID:** `github_update_issue`
- **Description:** Update an existing issue

### Close Issue
- **ID:** `github_close_issue`
- **Description:** Close a GitHub issue

### List Issues
- **ID:** `github_list_issues`
- **Description:** List issues with filters

## License

MIT
