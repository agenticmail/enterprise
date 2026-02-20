# QuickBooks Accounting

Manage QuickBooks invoices, expenses, and customers. Generate financial reports and summaries.

## Installation

Install this skill from the AgenticMail skill marketplace or add it manually:

```
agenticmail skills install quickbooks-accounting
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `clientId` | string | Yes | OAuth 2.0 client ID from the Intuit Developer portal. |
| `clientSecret` | string | Yes | OAuth 2.0 client secret from the Intuit Developer portal. |
| `refreshToken` | string | Yes | OAuth 2.0 refresh token obtained through the QuickBooks authorization flow. |
| `realmId` | string | Yes | QuickBooks company ID (realm ID). Found in the URL when logged into QuickBooks Online. |

## Tools

### Create Invoice (`qb_create_invoice`)
Create a new invoice for a customer.

### List Expenses (`qb_list_expenses`)
List recent expenses and purchases.

### Get Report (`qb_get_report`)
Generate a financial report (P&L, balance sheet).

### List Customers (`qb_list_customers`)
List all customers.

## License

MIT
