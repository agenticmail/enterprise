# Bitbucket Repos

Manage Bitbucket repositories, pull requests, and branch permissions.

## Installation

```bash
agenticmail skill install bitbucket-repos
```

## Configuration

| Field              | Type   | Required | Description                                                  |
| ------------------ | ------ | -------- | ------------------------------------------------------------ |
| `username`         | string | Yes      | Bitbucket username for authentication                        |
| `appPassword`      | string | Yes      | Bitbucket app password for API access                        |
| `defaultWorkspace` | string | No       | Default Bitbucket workspace slug to use when none is specified |

## Tools

| Tool                  | Description                         |
| --------------------- | ----------------------------------- |
| `bitbucket_create_pr` | Create a new pull request           |
| `bitbucket_list_repos`| List repositories in a workspace    |
| `bitbucket_merge_pr`  | Merge an approved pull request      |

## License

Apache-2.0
