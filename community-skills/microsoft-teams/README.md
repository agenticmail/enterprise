# Microsoft Teams

Send messages, manage channels, and schedule meetings in Microsoft Teams.

## Installation

Install this skill from the AgenticMail skill registry:

```
agenticmail skill install microsoft-teams
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tenantId` | string | Yes | Azure AD tenant ID |
| `clientId` | string | Yes | Azure AD application (client) ID |
| `clientSecret` | string | Yes | Azure AD client secret |

Example configuration:

```json
{
  "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "clientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "clientSecret": "your-azure-ad-client-secret"
}
```

## Tools

### Send Message
- **ID:** `teams_send_message`
- **Description:** Send a message to a Teams channel or chat

### Create Channel
- **ID:** `teams_create_channel`
- **Description:** Create a new channel in a team

### Schedule Meeting
- **ID:** `teams_schedule_meeting`
- **Description:** Schedule a Teams meeting with attendees

### List Channels
- **ID:** `teams_list_channels`
- **Description:** List channels in a team

## License

MIT
