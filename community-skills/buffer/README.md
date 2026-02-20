# Buffer Social Media

Integrate with Buffer Social Media to list, create, list and more.

## Tools

- **List Profiles** (`buffer_list_profiles`) — List social media profiles connected to your Buffer account. Returns service names, usernames, and profile IDs.
- **Create Update** (`buffer_create_update`) — Create a new social media update (post) via Buffer. Can be scheduled or added to the queue.
- **List Updates** (`buffer_list_updates`) — List pending or sent updates for a specific Buffer profile. Returns update text, status, and scheduled times.
- **Get Analytics** (`buffer_get_analytics`) — Get interaction analytics for a specific Buffer update. Returns clicks, likes, shares, comments, and reach.
- **Shuffle Queue** (`buffer_shuffle_queue`) — Shuffle the order of pending updates in a Buffer profile queue. Randomizes the scheduled order.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | buffer authentication |

## Category

marketing · Risk: medium
