# Terraform IaC

Plan, apply, and manage Terraform infrastructure. View state and manage workspaces.

## Installation

Install this skill from the AgenticMail skill marketplace:

```
agenticmail skills install terraform-iac
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cloudToken` | string | No | Terraform Cloud token |
| `organization` | string | No | Terraform Cloud organization name |
| `defaultWorkspace` | string | No | Default Terraform workspace name |

## Tools

### Terraform Plan (`tf_plan`)
Generate and show an execution plan.

### Terraform Apply (`tf_apply`)
Apply the planned changes to infrastructure.

### List State (`tf_list_state`)
List resources in the current state.

## License

Apache-2.0
