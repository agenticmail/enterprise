# SendGrid Email

Send transactional and marketing emails via SendGrid. Manage contacts and templates.

## Installation

Install this skill from the AgenticMail skill registry:

```
agenticmail skill install sendgrid-email
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `apiKey` | string | Yes | SendGrid API key with appropriate permissions |
| `fromEmail` | string | Yes | Verified sender email address |
| `fromName` | string | No | Display name for the sender |

Example configuration:

```json
{
  "apiKey": "SG.xxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "fromEmail": "noreply@yourdomain.com",
  "fromName": "Your Company"
}
```

## Tools

### Send Email
- **ID:** `sendgrid_send_email`
- **Description:** Send an email via SendGrid

### Create Template
- **ID:** `sendgrid_create_template`
- **Description:** Create a dynamic email template

### Add Contact
- **ID:** `sendgrid_add_contact`
- **Description:** Add a contact to a mailing list

### Get Stats
- **ID:** `sendgrid_get_stats`
- **Description:** Retrieve email delivery statistics

## License

MIT
