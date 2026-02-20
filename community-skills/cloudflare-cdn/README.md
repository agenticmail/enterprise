# Cloudflare

Manage Cloudflare DNS records, firewall rules, and Workers. Purge cache and view analytics.

## Installation

Install this skill from the AgenticMail skill marketplace:

```
agenticmail skills install cloudflare-cdn
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `apiToken` | string | Yes | Cloudflare API token |
| `accountId` | string | No | Cloudflare account ID |
| `defaultZoneId` | string | No | Default Cloudflare zone ID |

## Tools

### List DNS Records (`cf_list_dns_records`)
List DNS records for a zone.

### Create DNS Record (`cf_create_dns_record`)
Create a new DNS record.

### Purge Cache (`cf_purge_cache`)
Purge cached content for a zone.

### List Workers (`cf_list_workers`)
List deployed Cloudflare Workers.

## License

MIT
