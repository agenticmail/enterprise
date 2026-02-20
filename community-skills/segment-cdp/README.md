# Segment CDP

Manage Segment sources, destinations, and tracking plans. Send events and manage user profiles.

## Installation

Install this skill from the AgenticMail skill marketplace:

```
agenticmail skills install segment-cdp
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `writeKey` | string | Yes | Segment source write key |
| `workspaceSlug` | string | No | Segment workspace slug |
| `apiToken` | string | No | Segment API token for management operations |

## Tools

### Track Event (`segment_track_event`)
Send a track event to Segment.

### Identify User (`segment_identify_user`)
Identify a user with traits.

### List Sources (`segment_list_sources`)
List all configured sources.

### List Destinations (`segment_list_destinations`)
List all configured destinations.

## License

MIT
