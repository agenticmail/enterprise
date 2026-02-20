# PayPal

Integrate with PayPal to list, create, get and more.

## Tools

- **List Transactions** (`paypal_list_transactions`) — List PayPal transactions within a date range. Returns transaction IDs, amounts, statuses, and payer info.
- **Create Payment** (`paypal_create_payment`) — Create a PayPal payment order. Specify the amount, currency, and intent. Returns an order ID and approval URL.
- **Get Order** (`paypal_get_order`) — Retrieve details of a PayPal order by its ID. Returns order status, amounts, and payer information.
- **Create Payout** (`paypal_create_payout`) — Create a PayPal batch payout to send money to one or more recipients via email.
- **List Disputes** (`paypal_list_disputes`) — List PayPal payment disputes. Optionally filter by status or date range. Returns dispute IDs, reasons, and amounts.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | paypal authentication |

## Category

finance · Risk: high
