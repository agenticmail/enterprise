# Discord Bot

Send messages, manage servers, and moderate channels in Discord.

## Installation

Install this skill from the AgenticMail skill registry:

```
agenticmail skill install discord
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `botToken` | string | Yes | Discord bot token from the Developer Portal |
| `guildId` | string | No | Default Discord server (guild) ID |

Example configuration:

```json
{
  "botToken": "your-discord-token",
  "guildId": "123456789012345678"
}
```

## Tools

### Send Message
- **ID:** `discord_send_message`
- **Description:** Send a message to a Discord channel

### Create Channel
- **ID:** `discord_create_channel`
- **Description:** Create a new channel in a server

### Manage Roles
- **ID:** `discord_manage_roles`
- **Description:** Assign or remove roles from members

## License

MIT
