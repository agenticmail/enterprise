# Google Drive

Upload, download, and organize files in Google Drive. Manage sharing permissions and folders.

## Installation

Install this skill from the AgenticMail skill marketplace or add it manually:

```
agenticmail skills install google-drive
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `serviceAccountKey` | string | Yes | Google Cloud service account key in JSON format. Download from Google Cloud Console > IAM & Admin > Service Accounts. |
| `defaultFolderId` | string | No | Default Google Drive folder ID for uploads and file listings. Found in the folder URL. |

## Tools

### Upload File (`gdrive_upload_file`)
Upload a file to Google Drive.

### List Files (`gdrive_list_files`)
List files and folders.

### Share File (`gdrive_share_file`)
Share a file or folder with users.

### Search Files (`gdrive_search_files`)
Search files by name or content.

## License

MIT
