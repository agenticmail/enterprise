# Adobe Acrobat Sign

Integrate with Adobe Acrobat Sign to list, create, get and more.

## Tools

- **List Agreements** (`adobesign_list_agreements`) — List agreements in Adobe Acrobat Sign. Filter by status and pagination. Returns agreement names, statuses, and IDs.
- **Create Agreement** (`adobesign_create_agreement`) — Create and send a new agreement in Adobe Acrobat Sign. Specify recipients, document (template or transient), and signing options.
- **Get Agreement** (`adobesign_get_agreement`) — Get detailed information about a specific Adobe Sign agreement. Returns name, status, participants, and event history.
- **Send Reminder** (`adobesign_send_reminder`) — Send a reminder to participants of an Adobe Sign agreement. Specify which participant to remind and an optional message.
- **List Templates** (`adobesign_list_templates`) — List library document templates in Adobe Acrobat Sign. Returns template names, IDs, and sharing modes.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | adobe authentication |

## Category

legal · Risk: medium
