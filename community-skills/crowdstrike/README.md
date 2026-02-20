# CrowdStrike

Integrate with CrowdStrike to list, get, list and more.

## Tools

- **List Detections** (`cs_list_detections`) — List CrowdStrike Falcon detections. Returns detection IDs for further detail retrieval. Optionally filter by query.
- **Get Detection** (`cs_get_detection`) — Retrieve detailed information about specific CrowdStrike detections by their IDs. Returns behaviors, severity, device info, and status.
- **List Hosts** (`cs_list_hosts`) — List CrowdStrike Falcon hosts (endpoints). Returns host IDs, hostnames, platforms, and last seen times.
- **Contain Host** (`cs_contain_host`) — Contain or lift containment on a CrowdStrike host. Containment isolates the host from the network while maintaining sensor connectivity.
- **Search Iocs** (`cs_search_iocs`) — Search for Indicators of Compromise (IOCs) in CrowdStrike. Query by type (ip, domain, sha256, etc.) and value.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | crowdstrike authentication |

## Category

security · Risk: high
