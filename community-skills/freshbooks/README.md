# FreshBooks

Integrate with FreshBooks to list, create, list and more.

## Tools

- **List Clients** (`freshbooks_list_clients`) — List clients in FreshBooks. Optionally search by organization name or email. Returns client names, emails, and IDs.
- **Create Invoice** (`freshbooks_create_invoice`) — Create a new invoice in FreshBooks for a client. Provide at least one line item with name and amount.
- **List Invoices** (`freshbooks_list_invoices`) — List invoices in FreshBooks. Optionally filter by status or customer. Returns invoice numbers, amounts, and dates.
- **List Expenses** (`freshbooks_list_expenses`) — List expenses in FreshBooks. Optionally filter by category or date range. Returns expense descriptions, amounts, and vendors.
- **Get Profit Loss** (`freshbooks_get_profit_loss`) — Retrieve the profit & loss report from FreshBooks. Specify a date range for the report period.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | freshbooks authentication |

## Category

finance · Risk: high
