# Front

Integrate with Front to list, send, list and more.

## Tools

- **List Conversations** (`front_list_conversations`) — List conversations from Front. Returns subjects, statuses, assignees, and tags.
- **Send Reply** (`front_send_reply`) — Send a reply to a Front conversation. The reply is sent as an email from the assigned inbox.
- **List Inboxes** (`front_list_inboxes`) — List inboxes from Front. Returns inbox names, types, and addresses.
- **Assign Conversation** (`front_assign_conversation`) — Assign a Front conversation to a specific teammate. Can also unassign by omitting assignee_id.
- **Tag Conversation** (`front_tag_conversation`) — Add or remove tags on a Front conversation.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | token | front authentication |

## Category

crm · Risk: medium
