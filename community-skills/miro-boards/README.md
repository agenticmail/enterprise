# Miro

Integrate with Miro to list, create, create and more.

## Tools

- **List Boards** (`miro_list_boards`) — List Miro boards accessible to the authenticated user. Returns board names, IDs, and last modification dates.
- **Create Board** (`miro_create_board`) — Create a new Miro board. Provide a name and optional description.
- **Create Sticky Note** (`miro_create_sticky_note`) — Create a sticky note on a Miro board. Specify the board ID, note content, and optional position and color.
- **List Items** (`miro_list_items`) — List items on a Miro board. Returns sticky notes, shapes, text, and other board items.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | miro authentication |

## Category

collaboration · Risk: medium
