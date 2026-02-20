# Linear Issue Tracker

Create and manage Linear issues, projects, and cycles. Streamline engineering workflows.

## Installation

```bash
agenticmail skill install linear
```

## Configuration

| Field           | Type   | Required | Description                                          |
| --------------- | ------ | -------- | ---------------------------------------------------- |
| `apiKey`        | string | Yes      | Linear API key for authentication                    |
| `defaultTeamId` | string | No       | Default Linear team ID to use when none is specified |

## Tools

| Tool                   | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `linear_create_issue`  | Create a new Linear issue                      |
| `linear_update_issue`  | Update issue status, assignee, or priority     |
| `linear_list_projects` | List all projects in a team                    |
| `linear_search_issues` | Search issues with filters                     |

## License

MIT
