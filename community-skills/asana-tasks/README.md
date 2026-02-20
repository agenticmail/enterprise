# Asana Tasks

Create, assign, and track tasks in Asana. Manage projects, sections, and due dates.

## Installation

```bash
agenticmail skill install asana-tasks
```

## Configuration

| Field              | Type   | Required | Description                                                |
| ------------------ | ------ | -------- | ---------------------------------------------------------- |
| `accessToken`      | string | Yes      | Asana personal access token for API authentication         |
| `defaultWorkspace` | string | No       | Default Asana workspace GID to use when none is specified  |
| `defaultProject`   | string | No       | Default Asana project GID to use when none is specified    |

## Tools

| Tool                 | Description                                  |
| -------------------- | -------------------------------------------- |
| `asana_create_task`  | Create a new task in a project               |
| `asana_update_task`  | Update task details, assignee, or due date   |
| `asana_list_tasks`   | List tasks in a project or section           |
| `asana_complete_task`| Mark a task as completed                     |

## License

MIT
