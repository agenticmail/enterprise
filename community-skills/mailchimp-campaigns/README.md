# Mailchimp Campaigns

Create and send Mailchimp email campaigns. Manage audiences, segments, and templates.

## Installation

Install this skill from the AgenticMail skill marketplace or add it manually:

```
agenticmail skills install mailchimp-campaigns
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `apiKey` | string | Yes | Mailchimp API key. Generate one in Account > Extras > API keys. |
| `serverPrefix` | string | Yes | Mailchimp data center prefix (e.g. `us1`). Found in the API key after the dash. |
| `defaultListId` | string | No | Default audience/list ID to use when none is specified. Found in Audience > Settings. |

## Tools

### Create Campaign (`mailchimp_create_campaign`)
Create a new email campaign.

### Send Campaign (`mailchimp_send_campaign`)
Send a campaign to an audience.

### Add Subscriber (`mailchimp_add_subscriber`)
Add a subscriber to an audience.

### Get Report (`mailchimp_get_report`)
Get campaign performance report.

## License

MIT
