# Figma Design

Export assets, list files, and retrieve comments from Figma projects. Manage design components.

## Installation

Install this skill from the AgenticMail skill marketplace or add it manually:

```
agenticmail skills install figma-design
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accessToken` | string | Yes | Figma personal access token. Generate one in Figma > Account settings > Personal access tokens. |
| `defaultTeamId` | string | No | Default Figma team ID to scope file listings. Found in the team URL. |

## Tools

### Export Assets (`figma_export_assets`)
Export images and assets from a Figma file.

### List Files (`figma_list_files`)
List files in a Figma project.

### Get Comments (`figma_get_comments`)
Retrieve comments on a Figma file.

### Create Component (`figma_create_component`)
Create a reusable design component.

## License

MIT
