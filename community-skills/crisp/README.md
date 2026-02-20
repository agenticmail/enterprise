# Crisp Chat

Integrate with Crisp Chat to list, send, get and more.

## Tools

- **List Conversations** (`crisp_list_conversations`) — List conversations from Crisp. Returns session IDs, visitor info, states, and last messages.
- **Send Message** (`crisp_send_message`) — Send a message in a Crisp conversation. Can send text or a note (internal message).
- **Get Conversation** (`crisp_get_conversation`) — Get details of a specific Crisp conversation by session ID. Returns visitor info, state, and message history.
- **List People** (`crisp_list_people`) — List people (contacts) from Crisp. Optionally search by name or email.
- **Update Conversation** (`crisp_update_conversation`) — Update a Crisp conversation state or metadata. Can change state to resolved, pending, or unresolved.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | credentials | crisp authentication |

## Category

customer-support · Risk: medium
