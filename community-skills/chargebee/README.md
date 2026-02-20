# Chargebee

Integrate with Chargebee to list, create, list and more.

## Tools

- **List Subscriptions** (`chargebee_list_subscriptions`) — List Chargebee subscriptions. Optionally filter by status, customer, or plan. Returns subscription IDs, plans, and statuses.
- **Create Subscription** (`chargebee_create_subscription`) — Create a new subscription in Chargebee. Specify a plan and customer details.
- **List Customers** (`chargebee_list_customers`) — List customers in Chargebee. Optionally filter by email or name. Returns customer names, emails, and IDs.
- **List Invoices** (`chargebee_list_invoices`) — List invoices in Chargebee. Optionally filter by status or customer. Returns invoice IDs, amounts, and statuses.
- **Cancel Subscription** (`chargebee_cancel_subscription`) — Cancel a Chargebee subscription. Choose to cancel immediately or at the end of the current term.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | chargebee authentication |

## Category

finance · Risk: high
