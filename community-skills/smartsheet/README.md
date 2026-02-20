# Smartsheet

Integrate with Smartsheet to list, get, add and more.

## Tools

- **List Sheets** (`smartsheet_list_sheets`) — List all sheets accessible to the authenticated Smartsheet user. Returns sheet names, IDs, and modification dates.
- **Get Sheet** (`smartsheet_get_sheet`) — Retrieve a Smartsheet sheet with its columns and rows. Returns structured data for analysis.
- **Add Rows** (`smartsheet_add_rows`) — Add one or more rows to a Smartsheet sheet. Each row specifies cell values mapped to column IDs.
- **Update Rows** (`smartsheet_update_rows`) — Update existing rows in a Smartsheet sheet. Each row specifies the row ID and new cell values.
- **Search** (`smartsheet_search`) — Search across all Smartsheet sheets for a query string. Returns matching sheets, rows, and cell values.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | token | smartsheet authentication |

## Category

project-management · Risk: medium
