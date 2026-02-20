# Fly.io

Integrate with Fly.io to list, get, list and more.

## Tools

- **List Apps** (`fly_list_apps`) — List all Fly.io apps in the organization. Returns app names, statuses, and networks.
- **Get App** (`fly_get_app`) — Get detailed information about a specific Fly.io app by name.
- **List Machines** (`fly_list_machines`) — List all machines (VMs) for a Fly.io app. Returns machine IDs, states, regions, and image info.
- **Start Machine** (`fly_start_machine`) — Start a stopped Fly.io machine. The machine must be in a stopped state.
- **Stop Machine** (`fly_stop_machine`) — Stop a running Fly.io machine. Optionally send a specific signal.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | token | flyio authentication |

## Category

cloud-infrastructure · Risk: medium
