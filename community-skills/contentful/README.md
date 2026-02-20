# Contentful CMS

Integrate with Contentful CMS to list, get, create and more.

## Tools

- **List Entries** (`contentful_list_entries`) — List content entries from Contentful. Optionally filter by content type, search query, or field values.
- **Get Entry** (`contentful_get_entry`) — Get a single content entry from Contentful by ID. Returns all fields and metadata.
- **Create Entry** (`contentful_create_entry`) — Create a new content entry in Contentful. Provide the content type and field values.
- **List Content Types** (`contentful_list_content_types`) — List content types defined in the Contentful space. Returns type names, IDs, and field definitions.
- **Publish Entry** (`contentful_publish_entry`) — Publish a content entry in Contentful. The entry must have been saved first. Requires the current version number for optimistic locking.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | token | contentful authentication |

## Category

marketing · Risk: medium
