# Recurly

Integrate with Recurly to list, list, list and more.

## Tools

- **List Accounts** (`recurly_list_accounts`) — List accounts (customers) in Recurly. Optionally filter by state or email. Returns account codes, emails, and statuses.
- **List Subscriptions** (`recurly_list_subscriptions`) — List subscriptions in Recurly. Optionally filter by state or plan. Returns subscription IDs, plans, statuses, and amounts.
- **List Invoices** (`recurly_list_invoices`) — List invoices in Recurly. Optionally filter by state or type. Returns invoice numbers, amounts, and statuses.
- **Get Account** (`recurly_get_account`) — Retrieve details of a single Recurly account by its ID or code. Returns account name, email, state, and billing info.
- **List Plans** (`recurly_list_plans`) — List subscription plans in Recurly. Returns plan names, codes, pricing, and statuses.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | recurly authentication |

## Category

finance · Risk: high
