# PandaDoc

Integrate with PandaDoc to list, create, send and more.

## Tools

- **List Documents** (`pandadoc_list_documents`) — List documents in PandaDoc. Filter by status, search query, or date range. Returns document names, statuses, and IDs.
- **Create Document** (`pandadoc_create_document`) — Create a new document in PandaDoc from a template. Specify recipients, tokens, and metadata.
- **Send Document** (`pandadoc_send_document`) — Send a PandaDoc document to its recipients for viewing or signing. The document must be in draft status.
- **Get Document** (`pandadoc_get_document`) — Get detailed information about a PandaDoc document by its ID. Returns name, status, recipients, and field values.
- **List Templates** (`pandadoc_list_templates`) — List available PandaDoc templates. Returns template names, IDs, and creation dates.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | pandadoc authentication |

## Category

legal · Risk: medium
