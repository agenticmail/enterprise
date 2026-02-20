# BambooHR

Integrate with BambooHR to list, get, get and more.

## Tools

- **List Employees** (`bamboohr_list_employees`) — List employees from BambooHR. Returns a directory of all active employees with their basic information.
- **Get Employee** (`bamboohr_get_employee`) — Get detailed information about a specific BambooHR employee by their ID. Returns fields like name, email, department, job title, hire date, and more.
- **Get Directory** (`bamboohr_get_directory`) — Get the full employee directory from BambooHR. Returns a structured list of all employees with department and contact info.
- **Request Time Off** (`bamboohr_request_time_off`) — Submit a time-off request in BambooHR for a specific employee. Specify the date range and time-off type.
- **List Time Off** (`bamboohr_list_time_off`) — List time-off requests from BambooHR. Filter by employee, date range, or status.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | bamboohr authentication |

## Category

hr · Risk: medium
