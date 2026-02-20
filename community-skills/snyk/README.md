# Snyk Security

Integrate with Snyk Security to list, list, list and more.

## Tools

- **List Orgs** (`snyk_list_orgs`) — List Snyk organizations that the authenticated user belongs to. Returns org names, slugs, and IDs.
- **List Projects** (`snyk_list_projects`) — List Snyk projects within an organization. Returns project names, types, and last test dates.
- **List Issues** (`snyk_list_issues`) — List Snyk issues (vulnerabilities) for a project within an organization. Returns issue titles, severities, and remediation info.
- **Get Project** (`snyk_get_project`) — Retrieve details of a specific Snyk project. Returns project name, type, origin, issue counts, and last test date.
- **Test Package** (`snyk_test_package`) — Test a package for known vulnerabilities using Snyk. Provide the ecosystem, package name, and version.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | snyk authentication |

## Category

security · Risk: medium
