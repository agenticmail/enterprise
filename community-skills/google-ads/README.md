# Google Ads

Manage Google Ads campaigns, ad groups, and keywords. Retrieve performance reports and metrics.

## Installation

Install this skill from the AgenticMail skill marketplace or add it manually:

```
agenticmail skills install google-ads
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `developerToken` | string | Yes | Google Ads API developer token. Found in the API Center of your Google Ads manager account. |
| `clientId` | string | Yes | OAuth 2.0 client ID from Google Cloud Console. |
| `clientSecret` | string | Yes | OAuth 2.0 client secret from Google Cloud Console. |
| `refreshToken` | string | Yes | OAuth 2.0 refresh token obtained through the authorization flow. |
| `customerId` | string | Yes | Google Ads customer ID (10-digit number without dashes, e.g. `1234567890`). |

## Tools

### List Campaigns (`gads_list_campaigns`)
List all campaigns in the account.

### Get Performance (`gads_get_performance`)
Get campaign performance metrics.

### Update Budget (`gads_update_budget`)
Update a campaign budget.

## License

MIT
