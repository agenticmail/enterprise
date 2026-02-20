# SAP S/4HANA

Integrate with SAP S/4HANA to list, get, list and more.

## Tools

- **List Business Partners** (`sap_list_business_partners`) — List business partners from SAP S/4HANA. Returns partner names, IDs, categories, and addresses.
- **Get Sales Order** (`sap_get_sales_order`) — Get details of a specific SAP sales order by its ID. Returns order header, items, pricing, and status.
- **List Materials** (`sap_list_materials`) — List materials (products) from SAP S/4HANA. Returns material numbers, descriptions, types, and groups.
- **Create Purchase Order** (`sap_create_purchase_order`) — Create a new purchase order in SAP S/4HANA. Specify vendor, items, and delivery details.
- **Get Financials** (`sap_get_financials`) — Get financial journal entries from SAP S/4HANA. Filter by company code, fiscal year, and posting date range.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | oauth2 | sap authentication |

## Category

platform · Risk: high
