# Vercel Deployments

Deploy projects, manage domains, and monitor deployments on Vercel.

## Installation

```bash
agenticmail skill install vercel-deployments
```

## Configuration

| Field           | Type   | Required | Description                                      |
| --------------- | ------ | -------- | ------------------------------------------------ |
| `authToken`     | string | Yes      | Vercel authentication token for API access       |
| `defaultTeamId` | string | No       | Default Vercel team ID to scope API requests     |

## Tools

| Tool                       | Description                              |
| -------------------------- | ---------------------------------------- |
| `vercel_create_deployment` | Deploy a project to Vercel               |
| `vercel_list_deployments`  | List recent deployments                  |
| `vercel_manage_domains`    | Add or remove custom domains             |
| `vercel_get_logs`          | Retrieve deployment and function logs    |

## License

MIT
