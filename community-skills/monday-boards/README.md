# Monday.com Boards

Manage boards, items, and columns in Monday.com. Automate status updates and notifications.

## Installation

```bash
agenticmail skill install monday-boards
```

## Configuration

| Field            | Type   | Required | Description                                      |
| ---------------- | ------ | -------- | ------------------------------------------------ |
| `apiToken`       | string | Yes      | Monday.com API token for authentication          |
| `defaultBoardId` | string | No       | Default board ID to use when none is specified   |

## Tools

| Tool                  | Description                          |
| --------------------- | ------------------------------------ |
| `monday_create_item`  | Create a new item on a board         |
| `monday_update_item`  | Update column values of an item      |
| `monday_list_boards`  | List all boards in the workspace     |

## License

MIT
