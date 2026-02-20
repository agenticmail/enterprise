# HashiCorp Vault

Integrate with HashiCorp Vault to read, list, write and more.

## Tools

- **Read Secret** (`vault_read_secret`) — Read a secret from HashiCorp Vault at a given path. Supports KV v1 and v2 engines. Returns secret key-value pairs.
- **List Secrets** (`vault_list_secrets`) — List secret keys at a given path in HashiCorp Vault. Returns a list of key names (not values).
- **Write Secret** (`vault_write_secret`) — Write a secret to HashiCorp Vault at a given path. Provide key-value pairs as the secret data.
- **List Mounts** (`vault_list_mounts`) — List all secret engine mounts in HashiCorp Vault. Returns mount paths, types, and descriptions.
- **Get Health** (`vault_get_health`) — Check the health status of the HashiCorp Vault server. Returns initialization, seal status, and version info.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | hashicorp-vault authentication |

## Category

security · Risk: high
