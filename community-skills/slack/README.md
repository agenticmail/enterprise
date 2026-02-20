# Slack Notifications

Send messages, create channels, and manage notifications in Slack workspaces.

## Installation

Install this skill from the AgenticMail skill registry:

```
agenticmail skill install slack
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `botToken` | string | Yes | Slack Bot User OAuth token (xoxb-...) |
| `defaultChannel` | string | No | Default Slack channel to send messages to |

Example configuration:

```json
{
  "botToken": "xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx",
  "defaultChannel": "#general"
}
```

## Tools

### Send Message
- **ID:** `slack_send_message`
- **Description:** Send a message to a Slack channel

### Create Channel
- **ID:** `slack_create_channel`
- **Description:** Create a new Slack channel

### List Channels
- **ID:** `slack_list_channels`
- **Description:** List available channels

## License

MIT
