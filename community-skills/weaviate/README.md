# Weaviate

Integrate with Weaviate to query, create, get and more.

## Tools

- **Query** (`weaviate_query`) — Query objects from a Weaviate class using GraphQL. Supports nearVector, nearText, and BM25 search strategies.
- **Create Object** (`weaviate_create_object`) — Create a new object in a Weaviate class. Provide the class name and property values.
- **Get Schema** (`weaviate_get_schema`) — Retrieve the full Weaviate schema including all classes, their properties, vectorizer config, and module settings.
- **List Classes** (`weaviate_list_classes`) — List all classes in the Weaviate schema with summary info (name, property count, vectorizer).
- **Search** (`weaviate_search`) — Perform a hybrid (BM25 + vector) search across a Weaviate class. Combines keyword and semantic matching.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | weaviate authentication |

## Category

database · Risk: medium
