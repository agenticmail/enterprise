# Azure DevOps

Integrate with Azure DevOps to list, list, create and more.

## Tools

- **List Projects** (`azdo_list_projects`) — List all projects in the Azure DevOps organization. Returns project names, IDs, states, and descriptions.
- **List Work Items** (`azdo_list_work_items`) — Query work items in an Azure DevOps project using WIQL (Work Item Query Language). Returns IDs, titles, states, and types.
- **Create Work Item** (`azdo_create_work_item`) — Create a new work item in an Azure DevOps project. Specify the type (Bug, Task, User Story, etc.) and fields.
- **List Repos** (`azdo_list_repos`) — List Git repositories in an Azure DevOps project. Returns repo names, IDs, default branches, and sizes.
- **List Pipelines** (`azdo_list_pipelines`) — List build/release pipelines in an Azure DevOps project. Returns pipeline names, IDs, and folders.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | token | azure-devops authentication |

## Category

devops · Risk: medium
