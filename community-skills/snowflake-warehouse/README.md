# Snowflake Data Warehouse

Run SQL queries, manage warehouses, and list databases in Snowflake.

## Installation

Install this skill from the AgenticMail skill marketplace:

```
agenticmail skills install snowflake-warehouse
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `account` | string | Yes | Snowflake account identifier (e.g. `xy12345.us-east-1`) |
| `username` | string | Yes | Snowflake username |
| `password` | string | Yes | Snowflake password |
| `warehouse` | string | No | Default warehouse to use for queries |
| `database` | string | No | Default database |
| `schema` | string | No | Default schema |

## Tools

### Run Query (`snowflake_run_query`)
Execute a SQL query on Snowflake.

### List Databases (`snowflake_list_databases`)
List available databases and schemas.

### Query History (`snowflake_get_query_history`)
View recent query execution history.

## License

Apache-2.0
