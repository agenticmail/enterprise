# Postmark

Integrate with Postmark to send, list, send and more.

## Tools

- **Send Email** (`postmark_send_email`) — Send a transactional email via Postmark. Supports plain text and HTML content, plus CC and BCC recipients.
- **List Templates** (`postmark_list_templates`) — List email templates from Postmark. Returns template names, IDs, and types.
- **Send Template** (`postmark_send_template`) — Send a templated email via Postmark. Provide the template ID or alias and the template model (variables).
- **Get Delivery Stats** (`postmark_get_delivery_stats`) — Get delivery statistics from Postmark. Returns counts for bounces by type (hard, soft, spam complaints, etc.).
- **Search Messages** (`postmark_search_messages`) — Search outbound messages sent via Postmark. Filter by recipient, tag, subject, or status.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | postmark authentication |

## Category

communication · Risk: medium
