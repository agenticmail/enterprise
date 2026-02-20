# NetSuite ERP

Integrate with NetSuite ERP to search, get, create and more.

## Tools

- **Search** (`netsuite_search`) — Search for records in NetSuite by record type. Supports filtering and field selection. Returns a list of matching records.
- **Get Record** (`netsuite_get_record`) — Get a specific NetSuite record by its type and internal ID. Returns all accessible fields for the record.
- **Create Record** (`netsuite_create_record`) — Create a new record in NetSuite. Specify the record type and field values.
- **List Saved Searches** (`netsuite_list_saved_searches`) — List saved searches in NetSuite. Returns search names, types, and IDs. Useful for discovering available reports.
- **Run Suiteql** (`netsuite_run_suiteql`) — Execute a SuiteQL query against NetSuite. SuiteQL is a SQL-like query language for NetSuite data. Returns a formatted result set.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | netsuite authentication |

## Category

finance · Risk: high
