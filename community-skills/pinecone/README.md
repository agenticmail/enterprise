# Pinecone

Integrate with Pinecone to list, query, upsert and more.

## Tools

- **List Indexes** (`pinecone_list_indexes`) — List all Pinecone indexes in the account. Returns index names, dimensions, and status.
- **Query** (`pinecone_query`) — Query a Pinecone index for the nearest vectors to a given query vector. Returns IDs, scores, and optional metadata.
- **Upsert** (`pinecone_upsert`) — Upsert vectors into a Pinecone index. Insert new vectors or update existing ones by ID.
- **Describe Index** (`pinecone_describe_index`) — Get detailed information about a specific Pinecone index including its configuration, status, and stats.
- **Delete Vectors** (`pinecone_delete_vectors`) — Delete vectors from a Pinecone index by ID list, by metadata filter, or delete all vectors in a namespace.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | pinecone authentication |

## Category

database · Risk: medium
