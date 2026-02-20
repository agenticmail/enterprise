# Zuora

Integrate with Zuora to list, create, list and more.

## Tools

- **List Subscriptions** (`zuora_list_subscriptions`) — List subscriptions in Zuora. Optionally filter by account or status. Returns subscription numbers, statuses, and terms.
- **Create Subscription** (`zuora_create_subscription`) — Create a new subscription in Zuora. Specify an account and rate plan.
- **List Accounts** (`zuora_list_accounts`) — List billing accounts in Zuora. Returns account names, numbers, statuses, and balances.
- **List Invoices** (`zuora_list_invoices`) — List invoices in Zuora. Optionally filter by account. Returns invoice numbers, amounts, statuses, and dates.
- **Query** (`zuora_query`) — Execute a ZOQL (Zuora Object Query Language) query against Zuora. Returns matching records. Example: "SELECT Id, Name, Status FROM Account WHERE Status = 'Active'".

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | zuora authentication |

## Category

finance · Risk: high
