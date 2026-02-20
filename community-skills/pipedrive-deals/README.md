# Pipedrive Deals

Manage Pipedrive deals, contacts, and organizations. Track sales pipeline and activities.

## Installation

Install this skill from the AgenticMail skill marketplace or add it manually:

```
agenticmail skills install pipedrive-deals
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `apiToken` | string | Yes | Pipedrive API token for authentication. Found in Settings > Personal preferences > API. |
| `companyDomain` | string | Yes | Your Pipedrive company subdomain (e.g. `yourcompany` from yourcompany.pipedrive.com). |

## Tools

### Create Deal (`pipedrive_create_deal`)
Create a new deal in Pipedrive.

### Update Deal (`pipedrive_update_deal`)
Update deal stage or value.

### List Activities (`pipedrive_list_activities`)
List scheduled and completed activities.

## License

MIT
