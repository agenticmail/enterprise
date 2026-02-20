# Todoist Tasks

Create, complete, and organize tasks in Todoist. Manage projects, labels, and due dates.

## Installation

```bash
agenticmail skill install todoist-tasks
```

## Configuration

| Field              | Type   | Required | Description                                      |
| ------------------ | ------ | -------- | ------------------------------------------------ |
| `apiToken`         | string | Yes      | Todoist API token for authentication             |
| `defaultProjectId` | string | No       | Default project ID to use when none is specified |

## Tools

| Tool                    | Description                  |
| ----------------------- | ---------------------------- |
| `todoist_create_task`   | Create a new task in Todoist |
| `todoist_complete_task` | Mark a task as completed     |
| `todoist_list_tasks`    | List tasks with filters      |
| `todoist_list_projects` | List all projects            |

## License

MIT
