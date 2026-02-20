# Zoom Meetings

Create, update, and manage Zoom meetings and webinars. Retrieve recordings and participant lists.

## Installation

Install this skill from the AgenticMail skill registry:

```
agenticmail skill install zoom-meetings
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accountId` | string | Yes | Zoom account ID from the Server-to-Server OAuth app |
| `clientId` | string | Yes | Zoom OAuth app client ID |
| `clientSecret` | string | Yes | Zoom OAuth app client secret |

Example configuration:

```json
{
  "accountId": "your-zoom-account-id",
  "clientId": "your-zoom-client-id",
  "clientSecret": "your-zoom-client-secret"
}
```

## Tools

### Create Meeting
- **ID:** `zoom_create_meeting`
- **Description:** Create a new Zoom meeting

### List Meetings
- **ID:** `zoom_list_meetings`
- **Description:** List upcoming meetings

### Get Recording
- **ID:** `zoom_get_recording`
- **Description:** Retrieve a meeting recording

### List Participants
- **ID:** `zoom_list_participants`
- **Description:** List participants of a meeting

## License

MIT
