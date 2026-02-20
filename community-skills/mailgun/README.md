# Mailgun

Integrate with Mailgun to send, list, validate and more.

## Tools

- **Send Email** (`mailgun_send_email`) — Send an email via Mailgun. Supports plain text and HTML content, plus CC and BCC recipients.
- **List Events** (`mailgun_list_events`) — List email events from Mailgun (deliveries, opens, clicks, bounces, etc.) for the configured domain.
- **Validate Email** (`mailgun_validate_email`) — Validate an email address using Mailgun's email validation service. Checks deliverability, risk, and suggests corrections.
- **List Domains** (`mailgun_list_domains`) — List sending domains configured in Mailgun. Returns domain names, states, and types.
- **Get Stats** (`mailgun_get_stats`) — Get email sending statistics from Mailgun for the configured domain. Returns delivery, open, click, bounce, and complaint counts.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | mailgun authentication |

## Category

communication · Risk: medium
