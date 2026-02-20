# Xero Accounting

Integrate with Xero Accounting to list, create, list and more.

## Tools

- **List Invoices** (`xero_list_invoices`) — List Xero invoices with optional filters by status, contact, or date range. Returns invoice numbers, amounts, and statuses.
- **Create Invoice** (`xero_create_invoice`) — Create a new sales invoice in Xero for a given contact. Provide at least one line item with description and amount.
- **List Contacts** (`xero_list_contacts`) — List contacts in Xero. Optionally search by name or filter by active status. Returns contact names, emails, and IDs.
- **Get Balance Sheet** (`xero_get_balance_sheet`) — Retrieve the balance sheet report from Xero. Optionally specify a date for a point-in-time snapshot.
- **List Payments** (`xero_list_payments`) — List payments in Xero. Optionally filter by status or invoice. Returns payment amounts, dates, and references.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | xero authentication |

## Category

finance · Risk: high
