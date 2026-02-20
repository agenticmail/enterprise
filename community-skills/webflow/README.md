# Webflow

Integrate with Webflow to list, list, list and more.

## Tools

- **List Sites** (`webflow_list_sites`) — List all Webflow sites accessible with the current authorization. Returns site names, IDs, and custom domains.
- **List Collections** (`webflow_list_collections`) — List CMS collections for a Webflow site. Returns collection names, slugs, and item counts.
- **List Items** (`webflow_list_items`) — List items in a Webflow CMS collection. Returns item names, slugs, and field data.
- **Create Item** (`webflow_create_item`) — Create a new item in a Webflow CMS collection. Provide field data matching the collection schema.
- **Publish Site** (`webflow_publish_site`) — Publish a Webflow site to make all staged changes live. Optionally publish to specific custom domains.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | webflow authentication |

## Category

marketing · Risk: medium
