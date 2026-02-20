# Jira Integration

Full Jira integration for creating tickets, managing sprints, and tracking progress.

## Installation

Install this skill from the AgenticMail skill registry:

```
agenticmail skill install jira
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `host` | string | Yes | Jira instance URL (e.g., https://yourcompany.atlassian.net) |
| `email` | string | Yes | Email address associated with your Jira account |
| `apiToken` | string | Yes | Jira API token for authentication |
| `defaultProject` | string | No | Default Jira project key (e.g., PROJ) |

Example configuration:

```json
{
  "host": "https://yourcompany.atlassian.net",
  "email": "you@company.com",
  "apiToken": "your-jira-api-token",
  "defaultProject": "PROJ"
}
```

## Tools

### Create Ticket
- **ID:** `jira_create_ticket`
- **Description:** Create a Jira ticket

### Update Ticket
- **ID:** `jira_update_ticket`
- **Description:** Update an existing ticket

### Transition Issue
- **ID:** `jira_transition`
- **Description:** Move issue to new status

### Search Issues
- **ID:** `jira_search`
- **Description:** Search Jira issues with JQL

## License

MIT
