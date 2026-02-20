# Sanity CMS

Integrate with Sanity CMS to query, create, patch and more.

## Tools

- **Query** (`sanity_query`) — Execute a GROQ query against a Sanity dataset. Returns matching documents. GROQ is Sanity's query language (e.g. *[_type == "post"]{title, slug}).
- **Create Document** (`sanity_create_document`) — Create a new document in a Sanity dataset. Provide the document type and fields.
- **Patch Document** (`sanity_patch_document`) — Patch (update) an existing document in a Sanity dataset. Supports set, unset, and inc operations.
- **Delete Document** (`sanity_delete_document`) — Delete a document from a Sanity dataset by ID.
- **List Datasets** (`sanity_list_datasets`) — List all datasets in the Sanity project. Returns dataset names and visibility settings.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | token | sanity authentication |

## Category

marketing · Risk: medium
