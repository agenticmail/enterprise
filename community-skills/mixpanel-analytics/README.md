# Mixpanel Analytics

Query Mixpanel events, funnels, and user cohorts. Track product analytics and retention.

## Installation

Install this skill from the AgenticMail skill marketplace:

```
agenticmail skills install mixpanel-analytics
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | string | Yes | Mixpanel project ID |
| `serviceAccountUsername` | string | Yes | Mixpanel service account username |
| `serviceAccountSecret` | string | Yes | Mixpanel service account secret |

## Tools

### Query Events (`mixpanel_query_events`)
Query event data with filters and breakdowns.

### Get Funnel (`mixpanel_get_funnel`)
Retrieve funnel conversion data.

### Get Retention (`mixpanel_get_retention`)
Get user retention cohort data.

## License

MIT
