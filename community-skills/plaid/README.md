# Plaid

Integrate with Plaid to get, get, get and more.

## Tools

- **Get Accounts** (`plaid_get_accounts`) — Get linked bank accounts via Plaid. Requires an access token. Returns account names, types, balances, and IDs.
- **Get Transactions** (`plaid_get_transactions`) — Get transactions for linked accounts via Plaid. Specify a date range and optional account filter.
- **Get Balance** (`plaid_get_balance`) — Get real-time account balances via Plaid. Returns current and available balances for all linked accounts.
- **Get Identity** (`plaid_get_identity`) — Get identity information for account holders via Plaid. Returns names, addresses, emails, and phone numbers.
- **Get Institutions** (`plaid_get_institutions`) — Search for financial institutions supported by Plaid. Returns institution names, IDs, and supported products.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | api_key | plaid authentication |

## Category

finance · Risk: high
