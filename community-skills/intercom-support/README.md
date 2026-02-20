# Intercom Messenger

Manage Intercom conversations, contacts, and articles. Automate customer communication.

## Installation

Install this skill from the AgenticMail skill marketplace or add it manually:

```
agenticmail skills install intercom-support
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accessToken` | string | Yes | Intercom access token for API authentication. Generate one from Developer Hub > Your App > Authentication. |
| `appId` | string | No | Your Intercom app ID. Found in Settings > Installation. |

## Tools

### Reply to Conversation (`intercom_reply_conversation`)
Send a reply in an Intercom conversation.

### Create Contact (`intercom_create_contact`)
Create a new lead or user contact.

### Search Articles (`intercom_search_articles`)
Search help center articles.

### List Conversations (`intercom_list_conversations`)
List open conversations.

## License

MIT
