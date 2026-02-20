# MongoDB Atlas

Integrate with MongoDB Atlas to list, get, list and more.

## Tools

- **List Clusters** (`atlas_list_clusters`) — List all clusters in a MongoDB Atlas project. Returns cluster names, states, MongoDB versions, and provider settings.
- **Get Cluster** (`atlas_get_cluster`) — Get detailed information about a specific MongoDB Atlas cluster by name.
- **List Databases** (`atlas_list_databases`) — List databases in a MongoDB Atlas cluster. Returns database names and sizes.
- **List Projects** (`atlas_list_projects`) — List all projects (groups) accessible to the authenticated Atlas user.
- **Get Metrics** (`atlas_get_metrics`) — Get performance metrics for a MongoDB Atlas cluster process. Returns metrics such as connections, opcounters, and memory usage.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | credentials | mongodb-atlas authentication |

## Category

database · Risk: medium
