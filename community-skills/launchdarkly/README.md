# LaunchDarkly

Integrate with LaunchDarkly to list, get, toggle and more.

## Tools

- **List Flags** (`ld_list_flags`) — List feature flags in a LaunchDarkly project. Returns flag names, keys, statuses, and variation counts.
- **Get Flag** (`ld_get_flag`) — Retrieve details of a specific feature flag by key. Returns the flag configuration, variations, targets, and environment states.
- **Toggle Flag** (`ld_toggle_flag`) — Toggle a feature flag on or off in a specific environment. Uses a JSON Patch operation to update the flag state.
- **List Projects** (`ld_list_projects`) — List LaunchDarkly projects. Returns project names, keys, and environment counts.
- **List Environments** (`ld_list_environments`) — List environments within a LaunchDarkly project. Returns environment names, keys, colors, and SDK keys.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | launchdarkly authentication |

## Category

devops · Risk: medium
