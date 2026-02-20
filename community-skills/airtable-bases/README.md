# Airtable Bases

Read, create, and update records in Airtable bases. Query views and manage field configurations.

## Installation

```bash
agenticmail skill install airtable-bases
```

## Configuration

| Field              | Type   | Required | Description                                                              |
| ------------------ | ------ | -------- | ------------------------------------------------------------------------ |
| `apiKey`           | string | Yes      | Airtable personal access token for API authentication                    |
| `defaultBaseId`    | string | No       | Default Airtable base ID to use when none is specified (starts with app) |
| `defaultTableName` | string | No       | Default table name to use when none is specified                         |

## Tools

| Tool                    | Description                                      |
| ----------------------- | ------------------------------------------------ |
| `airtable_list_records` | List records from a table with optional filters  |
| `airtable_create_record`| Create a new record in a table                   |
| `airtable_update_record`| Update fields on an existing record              |

## License

MIT
