# Stripe Billing

Manage Stripe customers, subscriptions, invoices, and payment methods.

## Installation

Install this skill from the AgenticMail skill registry:

```
agenticmail skill install stripe
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `secretKey` | string | Yes | Stripe secret API key (sk_live_... or sk_test_...) |
| `webhookSecret` | string | No | Stripe webhook signing secret (whsec_...) |

Example configuration:

```json
{
  "secretKey": "sk_test_xxxxxxxxxxxxxxxxxxxx",
  "webhookSecret": "whsec_xxxxxxxxxxxxxxxxxxxx"
}
```

## Tools

### Create Customer
- **ID:** `stripe_create_customer`
- **Description:** Create a Stripe customer

### Create Invoice
- **ID:** `stripe_create_invoice`
- **Description:** Generate an invoice

### List Subscriptions
- **ID:** `stripe_list_subscriptions`
- **Description:** List active subscriptions

## License

MIT
