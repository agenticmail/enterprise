# Box

Integrate with Box to list, get, upload and more.

## Tools

- **List Files** (`box_list_files`) — List files and folders in a Box folder. Defaults to the root folder (ID "0"). Returns names, sizes, and modification dates.
- **Get File** (`box_get_file`) — Get detailed information about a specific Box file by its ID. Returns name, size, version, shared link, and metadata.
- **Upload File** (`box_upload_file`) — Upload a file to Box. Provide the file content as base64 and specify the target folder. Returns the new file ID and details.
- **Search** (`box_search`) — Search for files and folders in Box by name, content, or metadata. Returns matching items with relevance scores.
- **Create Folder** (`box_create_folder`) — Create a new folder in Box. Specify the parent folder and the new folder name.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | box authentication |

## Category

storage · Risk: medium
