# HubSpot CRM

Manage HubSpot contacts, deals, companies, and tickets. Automate sales and marketing workflows.

## Installation

Install this skill from the AgenticMail skill marketplace:

```
agenticmail skills install hubspot-crm
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accessToken` | string | Yes | HubSpot private app access token |
| `portalId` | string | No | HubSpot portal (account) ID |

## Tools

### Create Contact (`hubspot_create_contact`)
Create a new contact in HubSpot.

### Update Deal (`hubspot_update_deal`)
Update a deal stage or properties.

### List Companies (`hubspot_list_companies`)
List companies with filters.

### Search Contacts (`hubspot_search_contacts`)
Search contacts by name, email, or properties.

## License

MIT
