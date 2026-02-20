# Salesforce CRM

Manage Salesforce records, opportunities, contacts, and run SOQL queries.

## Installation

Install this skill from the AgenticMail skill registry:

```
agenticmail skill install salesforce
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instanceUrl` | string | Yes | Salesforce instance URL (e.g., https://yourorg.my.salesforce.com) |
| `clientId` | string | Yes | Connected app consumer key |
| `clientSecret` | string | Yes | Connected app consumer secret |
| `refreshToken` | string | Yes | OAuth refresh token for persistent authentication |

Example configuration:

```json
{
  "instanceUrl": "https://yourorg.my.salesforce.com",
  "clientId": "your-connected-app-consumer-key",
  "clientSecret": "your-connected-app-consumer-secret",
  "refreshToken": "your-oauth-refresh-token"
}
```

## Tools

### Create Record
- **ID:** `sf_create_record`
- **Description:** Create a Salesforce record

### Update Record
- **ID:** `sf_update_record`
- **Description:** Update a Salesforce record

### SOQL Query
- **ID:** `sf_query`
- **Description:** Run a SOQL query

### List Opportunities
- **ID:** `sf_list_opportunities`
- **Description:** List open opportunities

## License

MIT
