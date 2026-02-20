# Gusto Payroll

Integrate with Gusto Payroll to list, get, list and more.

## Tools

- **List Employees** (`gusto_list_employees`) — List employees from a Gusto company. Returns names, emails, departments, and employment status.
- **Get Employee** (`gusto_get_employee`) — Get detailed information about a specific Gusto employee by their UUID. Returns personal info, compensation, and employment details.
- **List Payrolls** (`gusto_list_payrolls`) — List payroll runs for a Gusto company. Returns payroll dates, status, and totals.
- **Get Company** (`gusto_get_company`) — Get company information from Gusto. Returns company name, EIN, addresses, and configuration details.
- **List Benefits** (`gusto_list_benefits`) — List company-level benefits from Gusto. Returns benefit types, descriptions, and whether they are active.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | gusto authentication |

## Category

hr · Risk: medium
