# Notion Sync

Read, create, and update Notion pages and databases. Supports rich content blocks.

## Installation

Install this skill from the AgenticMail skill registry:

```
agenticmail skill install notion
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `apiKey` | string | Yes | Notion internal integration token (secret_...) |
| `defaultDatabaseId` | string | No | Default Notion database ID to query |

Example configuration:

```json
{
  "apiKey": "secret_xxxxxxxxxxxxxxxxxxxx",
  "defaultDatabaseId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

## Tools

### Read Page
- **ID:** `notion_read_page`
- **Description:** Read a Notion page

### Create Page
- **ID:** `notion_create_page`
- **Description:** Create a new page

### Update Page
- **ID:** `notion_update_page`
- **Description:** Update page content

### Query Database
- **ID:** `notion_query_database`
- **Description:** Query a Notion database

## License

Apache-2.0
