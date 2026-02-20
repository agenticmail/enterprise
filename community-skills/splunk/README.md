# Splunk

Integrate with Splunk to search, list, get and more.

## Tools

- **Search** (`splunk_search`) — Create and run a Splunk search job. Provide an SPL query and optional time range. Returns the search job ID for result retrieval.
- **List Saved Searches** (`splunk_list_saved_searches`) — List saved searches in Splunk. Returns search names, schedules, and next run times.
- **Get Search Results** (`splunk_get_search_results`) — Retrieve results of a completed Splunk search job by its SID. Returns result rows with field values.
- **List Indexes** (`splunk_list_indexes`) — List Splunk indexes. Returns index names, sizes, event counts, and data models.
- **Create Alert** (`splunk_create_alert`) — Create a new Splunk saved search configured as an alert. Specify the search query, schedule, and alert conditions.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | token | splunk authentication |

## Category

monitoring · Risk: medium
