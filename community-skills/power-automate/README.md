# Microsoft Power Automate

Integrate with Microsoft Power Automate to list, run, get and more.

## Tools

- **List Flows** (`pa_list_flows`) — List flows (automations) in the Power Automate environment. Returns flow names, states, and trigger types.
- **Run Flow** (`pa_run_flow`) — Trigger a Power Automate flow (must have an HTTP request or manual trigger). Optionally pass input data as the request body.
- **Get Flow** (`pa_get_flow`) — Get detailed information about a specific Power Automate flow. Returns name, state, trigger details, action count, and connection references.
- **List Runs** (`pa_list_runs`) — List recent runs (execution history) for a Power Automate flow. Returns run IDs, statuses, and durations.
- **Get Run** (`pa_get_run`) — Get detailed information about a specific Power Automate flow run. Returns status, duration, trigger details, and action results.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | microsoft authentication |

## Category

automation · Risk: high
