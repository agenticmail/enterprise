# Zendesk Tickets

Create, update, and resolve Zendesk support tickets. Manage users, organizations, and macros.

## Installation

Install this skill from the AgenticMail skill marketplace or add it manually:

```
agenticmail skills install zendesk-tickets
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subdomain` | string | Yes | Your Zendesk subdomain (e.g. `yourcompany` from yourcompany.zendesk.com). |
| `email` | string | Yes | Email address of the Zendesk agent or admin used for API authentication. |
| `apiToken` | string | Yes | Zendesk API token. Generate one in Admin Center > Apps and integrations > Zendesk API. |

## Tools

### Create Ticket (`zendesk_create_ticket`)
Create a new support ticket.

### Update Ticket (`zendesk_update_ticket`)
Update ticket status, priority, or assignee.

### Search Tickets (`zendesk_search_tickets`)
Search tickets with filters.

### List Users (`zendesk_list_users`)
List end users and agents.

## License

MIT
