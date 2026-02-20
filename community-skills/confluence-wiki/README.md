# Confluence Wiki

Create, edit, and search Confluence pages and spaces. Manage documentation and knowledge bases.

## Installation

```bash
agenticmail skill install confluence-wiki
```

## Configuration

| Field          | Type   | Required | Description                                                            |
| -------------- | ------ | -------- | ---------------------------------------------------------------------- |
| `host`         | string | Yes      | Confluence instance URL (e.g., https://your-domain.atlassian.net/wiki) |
| `email`        | string | Yes      | Email address associated with your Atlassian account                   |
| `apiToken`     | string | Yes      | Atlassian API token for authentication                                 |
| `defaultSpace` | string | No       | Default Confluence space key to use when none is specified             |

## Tools

| Tool                     | Description                     |
| ------------------------ | ------------------------------- |
| `confluence_create_page` | Create a new Confluence page    |
| `confluence_update_page` | Update an existing page         |
| `confluence_search`      | Search pages using CQL          |
| `confluence_list_spaces` | List all Confluence spaces      |

## License

MIT
