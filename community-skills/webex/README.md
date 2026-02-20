# Webex

Integrate with Webex to send, list, create and more.

## Tools

- **Send Message** (`webex_send_message`) — Send a message to a Webex room (space). Provide the room ID and message text. Supports Markdown formatting.
- **List Rooms** (`webex_list_rooms`) — List Webex rooms (spaces) the authenticated user belongs to. Returns room names, IDs, and types.
- **Create Room** (`webex_create_room`) — Create a new Webex room (space). Provide a title for the room.
- **List People** (`webex_list_people`) — Search for people in the Webex organization. Filter by email, display name, or organization ID.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | webex authentication |

## Category

communication · Risk: medium
