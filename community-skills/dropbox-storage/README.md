# Dropbox Storage

Upload, download, and manage files in Dropbox. Share folders and create file requests.

## Installation

Install this skill from the AgenticMail skill marketplace or add it manually:

```
agenticmail skills install dropbox-storage
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accessToken` | string | Yes | Dropbox OAuth 2.0 access token. Generate one from the Dropbox App Console. |
| `rootNamespaceId` | string | No | Root namespace ID for Dropbox Business accounts. Scopes file operations to a specific namespace. |

## Tools

### Upload File (`dropbox_upload_file`)
Upload a file to Dropbox.

### Download File (`dropbox_download_file`)
Download a file from Dropbox.

### List Files (`dropbox_list_files`)
List files in a folder.

### Share Folder (`dropbox_share_folder`)
Share a folder with collaborators.

## License

MIT
