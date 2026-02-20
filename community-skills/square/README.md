# Square

Integrate with Square to list, create, list and more.

## Tools

- **List Payments** (`square_list_payments`) — List Square payments with optional filters by date range, status, or location. Returns payment IDs, amounts, and statuses.
- **Create Payment** (`square_create_payment`) — Create a payment in Square. Requires a source ID (e.g. nonce from a card) and an amount.
- **List Customers** (`square_list_customers`) — List customers in Square. Optionally sort or paginate. Returns customer names, emails, and IDs.
- **List Catalog** (`square_list_catalog`) — List catalog objects in Square (items, categories, discounts, taxes). Returns object names, types, and IDs.
- **Create Invoice** (`square_create_invoice`) — Create an invoice in Square for a customer and order. Specify the location, payment request, and delivery method.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | square authentication |

## Category

finance · Risk: high
