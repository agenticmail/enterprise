# Trello Cards

Create and manage Trello cards, lists, and boards. Move cards across lists and add labels.

## Installation

```bash
agenticmail skill install trello-cards
```

## Configuration

| Field            | Type   | Required | Description                                          |
| ---------------- | ------ | -------- | ---------------------------------------------------- |
| `apiKey`         | string | Yes      | Trello API key for authentication                    |
| `apiToken`       | string | Yes      | Trello API token for authorization                   |
| `defaultBoardId` | string | No       | Default Trello board ID to use when none is specified |

## Tools

| Tool                 | Description                      |
| -------------------- | -------------------------------- |
| `trello_create_card` | Create a new card on a list      |
| `trello_move_card`   | Move a card to another list      |
| `trello_add_label`   | Add a label to a card            |
| `trello_list_boards` | List all boards for a member     |

## License

MIT
