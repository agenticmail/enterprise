/**
 * MCP Skill Adapter — SAP S/4HANA Cloud
 *
 * Maps SAP S/4HANA OData API endpoints to MCP tool handlers.
 * Handles business partners, sales orders, materials, purchase orders, and financials.
 *
 * The SAP host is dynamic and read from ctx.skillConfig.host.
 *
 * SAP API docs: https://api.sap.com/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the SAP base URL from skill config */
function sapBaseUrl(ctx: ToolExecutionContext): string {
  const host = ctx.skillConfig.host;
  if (!host) {
    throw new Error('SAP host is required in skillConfig (e.g. { host: "mycompany.s4hana.ondemand.com" })');
  }
  const client = ctx.skillConfig.client || '100';
  return `https://${host}/sap/opu/odata/sap`;
}

/** Resolve the SAP client parameter */
function sapClient(ctx: ToolExecutionContext): string {
  return ctx.skillConfig.client || '100';
}

function sapError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // SAP OData returns { error: { code, message: { value } } }
      const errorObj = data.error || data;
      const msg = errorObj.message?.value || errorObj.message || err.message;
      const code = errorObj.code || '';
      const codePart = code ? `[${code}] ` : '';
      return { content: `SAP API error: ${codePart}${msg}`, isError: true };
    }
    return { content: `SAP API error: ${err.message}`, isError: true };
  }
  return { content: `SAP API error: ${String(err)}`, isError: true };
}

/** Format an SAP OData entity for display */
function formatEntity(entity: any, fields: string[]): string {
  return fields
    .map(f => `${f}: ${entity[f] ?? 'N/A'}`)
    .filter(Boolean)
    .join(' | ');
}

// ─── Tool: sap_list_business_partners ───────────────────

const listBusinessPartners: ToolHandler = {
  description:
    'List business partners from SAP S/4HANA. Returns partner names, IDs, categories, and addresses.',
  inputSchema: {
    type: 'object',
    properties: {
      top: {
        type: 'number',
        description: 'Maximum number of results (default 20, max 100)',
      },
      skip: {
        type: 'number',
        description: 'Number of records to skip for pagination (default 0)',
      },
      filter: {
        type: 'string',
        description: 'OData $filter expression (e.g. "BusinessPartnerCategory eq \'1\'" for organizations)',
      },
      search: {
        type: 'string',
        description: 'Free-text search across business partner fields',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = sapBaseUrl(ctx);

      const query: Record<string, string> = {
        '$top': String(params.top ?? 20),
        '$skip': String(params.skip ?? 0),
        '$format': 'json',
        'sap-client': sapClient(ctx),
      };
      if (params.filter) query['$filter'] = params.filter;
      if (params.search) query['$search'] = params.search;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/API_BUSINESS_PARTNER/A_BusinessPartner`,
        query,
      });

      const partners: any[] = result.d?.results || result.value || [];
      if (partners.length === 0) {
        return { content: 'No business partners found.' };
      }

      const lines = partners.map((bp: any) => {
        const name = bp.BusinessPartnerFullName || bp.BusinessPartnerName || '(unnamed)';
        const category = bp.BusinessPartnerCategory === '1' ? 'Organization' : bp.BusinessPartnerCategory === '2' ? 'Person' : bp.BusinessPartnerCategory || 'N/A';
        const city = bp.CityName || '';
        const country = bp.Country || '';
        const locationPart = city || country ? ` -- ${[city, country].filter(Boolean).join(', ')}` : '';
        return `${name} [${category}]${locationPart} (ID: ${bp.BusinessPartner})`;
      });

      return {
        content: `Found ${partners.length} business partners:\n${lines.join('\n')}`,
        metadata: { count: partners.length },
      };
    } catch (err) {
      return sapError(err);
    }
  },
};

// ─── Tool: sap_get_sales_order ──────────────────────────

const getSalesOrder: ToolHandler = {
  description:
    'Get details of a specific SAP sales order by its ID. Returns order header, items, pricing, and status.',
  inputSchema: {
    type: 'object',
    properties: {
      sales_order: {
        type: 'string',
        description: 'SAP Sales Order number (e.g. "0000000100")',
      },
    },
    required: ['sales_order'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = sapBaseUrl(ctx);

      const query: Record<string, string> = {
        '$format': 'json',
        '$expand': 'to_Item',
        'sap-client': sapClient(ctx),
      };

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/API_SALES_ORDER_SRV/A_SalesOrder('${params.sales_order}')`,
        query,
      });

      const order = result.d || result;
      const items: any[] = order.to_Item?.results || order.to_Item || [];

      const details = [
        `Sales Order: ${order.SalesOrder || params.sales_order}`,
        `Type: ${order.SalesOrderType || 'N/A'}`,
        `Organization: ${order.SalesOrganization || 'N/A'}`,
        `Sold-To Party: ${order.SoldToParty || 'N/A'}`,
        `Net Amount: ${order.TotalNetAmount ?? 'N/A'} ${order.TransactionCurrency || ''}`,
        `Status: ${order.OverallSDProcessStatus || 'N/A'}`,
        `Delivery Status: ${order.TotalDeliveryStatus || 'N/A'}`,
        `Created: ${order.CreationDate || 'N/A'}`,
        `Requested Delivery: ${order.RequestedDeliveryDate || 'N/A'}`,
      ];

      if (items.length > 0) {
        details.push('', `Items (${items.length}):`);
        for (const item of items) {
          details.push(`  - ${item.Material || 'N/A'}: ${item.OrderQuantity ?? 'N/A'} ${item.OrderQuantityUnit || ''} -- ${item.NetAmount ?? 'N/A'} ${item.TransactionCurrency || ''}`);
        }
      }

      return {
        content: details.join('\n'),
        metadata: {
          salesOrder: params.sales_order,
          netAmount: order.TotalNetAmount,
          currency: order.TransactionCurrency,
          itemCount: items.length,
        },
      };
    } catch (err) {
      return sapError(err);
    }
  },
};

// ─── Tool: sap_list_materials ───────────────────────────

const listMaterials: ToolHandler = {
  description:
    'List materials (products) from SAP S/4HANA. Returns material numbers, descriptions, types, and groups.',
  inputSchema: {
    type: 'object',
    properties: {
      top: {
        type: 'number',
        description: 'Maximum number of results (default 20, max 100)',
      },
      skip: {
        type: 'number',
        description: 'Number of records to skip for pagination (default 0)',
      },
      filter: {
        type: 'string',
        description: 'OData $filter expression (e.g. "MaterialType eq \'FERT\'")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = sapBaseUrl(ctx);

      const query: Record<string, string> = {
        '$top': String(params.top ?? 20),
        '$skip': String(params.skip ?? 0),
        '$format': 'json',
        'sap-client': sapClient(ctx),
      };
      if (params.filter) query['$filter'] = params.filter;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/API_PRODUCT_SRV/A_Product`,
        query,
      });

      const materials: any[] = result.d?.results || result.value || [];
      if (materials.length === 0) {
        return { content: 'No materials found.' };
      }

      const lines = materials.map((m: any) => {
        const desc = m.ProductDescription || m.MaterialName || '(no description)';
        const type = m.MaterialType || m.ProductType || 'N/A';
        const group = m.MaterialGroup || m.ProductGroup || '';
        const groupPart = group ? ` [${group}]` : '';
        return `${m.Material || m.Product || 'N/A'}: ${desc} (Type: ${type})${groupPart}`;
      });

      return {
        content: `Found ${materials.length} materials:\n${lines.join('\n')}`,
        metadata: { count: materials.length },
      };
    } catch (err) {
      return sapError(err);
    }
  },
};

// ─── Tool: sap_create_purchase_order ────────────────────

const createPurchaseOrder: ToolHandler = {
  description:
    'Create a new purchase order in SAP S/4HANA. Specify vendor, items, and delivery details.',
  inputSchema: {
    type: 'object',
    properties: {
      vendor: {
        type: 'string',
        description: 'Vendor (supplier) business partner ID',
      },
      purchase_order_type: {
        type: 'string',
        description: 'Purchase order type (e.g. "NB" for standard PO). Default: "NB".',
      },
      purchasing_organization: {
        type: 'string',
        description: 'Purchasing organization code',
      },
      purchasing_group: {
        type: 'string',
        description: 'Purchasing group code',
      },
      items: {
        type: 'array',
        description: 'Purchase order line items',
        items: {
          type: 'object',
          properties: {
            material: {
              type: 'string',
              description: 'Material number',
            },
            quantity: {
              type: 'number',
              description: 'Order quantity',
            },
            plant: {
              type: 'string',
              description: 'Receiving plant code',
            },
            net_price: {
              type: 'number',
              description: 'Net price per unit',
            },
          },
          required: ['material', 'quantity', 'plant'],
        },
        minItems: 1,
      },
    },
    required: ['vendor', 'purchasing_organization', 'items'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = sapBaseUrl(ctx);

      const poItems = params.items.map((item: any, idx: number) => ({
        PurchaseOrderItem: String((idx + 1) * 10).padStart(5, '0'),
        Material: item.material,
        OrderQuantity: String(item.quantity),
        Plant: item.plant,
        ...(item.net_price !== undefined ? { NetPriceAmount: String(item.net_price) } : {}),
      }));

      const body = {
        CompanyCode: ctx.skillConfig.companyCode || '1000',
        PurchaseOrderType: params.purchase_order_type || 'NB',
        Supplier: params.vendor,
        PurchasingOrganization: params.purchasing_organization,
        PurchasingGroup: params.purchasing_group || '001',
        to_PurchaseOrderItem: poItems,
      };

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder`,
        body,
        headers: {
          'sap-client': sapClient(ctx),
          'Content-Type': 'application/json',
        },
      });

      const po = result.d || result;
      const poNumber = po.PurchaseOrder || 'unknown';

      return {
        content: `Purchase Order created: ${poNumber}\nVendor: ${params.vendor}\nItems: ${params.items.length}\nOrganization: ${params.purchasing_organization}`,
        metadata: {
          purchaseOrder: poNumber,
          vendor: params.vendor,
          itemCount: params.items.length,
        },
      };
    } catch (err) {
      return sapError(err);
    }
  },
};

// ─── Tool: sap_get_financials ───────────────────────────

const getFinancials: ToolHandler = {
  description:
    'Get financial journal entries from SAP S/4HANA. Filter by company code, fiscal year, and posting date range.',
  inputSchema: {
    type: 'object',
    properties: {
      company_code: {
        type: 'string',
        description: 'SAP company code (e.g. "1000")',
      },
      fiscal_year: {
        type: 'string',
        description: 'Fiscal year (e.g. "2024")',
      },
      posting_date_from: {
        type: 'string',
        description: 'Start posting date in YYYY-MM-DD format (optional)',
      },
      posting_date_to: {
        type: 'string',
        description: 'End posting date in YYYY-MM-DD format (optional)',
      },
      top: {
        type: 'number',
        description: 'Maximum number of results (default 20, max 100)',
      },
    },
    required: ['company_code', 'fiscal_year'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = sapBaseUrl(ctx);

      const filters: string[] = [
        `CompanyCode eq '${params.company_code}'`,
        `FiscalYear eq '${params.fiscal_year}'`,
      ];
      if (params.posting_date_from) {
        filters.push(`PostingDate ge datetime'${params.posting_date_from}T00:00:00'`);
      }
      if (params.posting_date_to) {
        filters.push(`PostingDate le datetime'${params.posting_date_to}T23:59:59'`);
      }

      const query: Record<string, string> = {
        '$top': String(params.top ?? 20),
        '$filter': filters.join(' and '),
        '$format': 'json',
        'sap-client': sapClient(ctx),
      };

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/API_JOURNALENTRYITEMBASIC_SRV/A_JournalEntryItemBasic`,
        query,
      });

      const entries: any[] = result.d?.results || result.value || [];
      if (entries.length === 0) {
        return { content: `No journal entries found for company ${params.company_code}, FY ${params.fiscal_year}.` };
      }

      const lines = entries.map((e: any) => {
        const docNo = e.AccountingDocument || 'N/A';
        const glAccount = e.GLAccount || 'N/A';
        const amount = `${e.AmountInCompanyCodeCurrency ?? 'N/A'} ${e.CompanyCodeCurrency || ''}`;
        const postDate = e.PostingDate || 'N/A';
        const debitCredit = e.DebitCreditCode === 'S' ? 'Debit' : e.DebitCreditCode === 'H' ? 'Credit' : e.DebitCreditCode || '';
        return `Doc ${docNo} | GL: ${glAccount} | ${debitCredit}: ${amount} | Posted: ${postDate}`;
      });

      return {
        content: `${entries.length} journal entries (Company: ${params.company_code}, FY: ${params.fiscal_year}):\n${lines.join('\n')}`,
        metadata: {
          count: entries.length,
          companyCode: params.company_code,
          fiscalYear: params.fiscal_year,
        },
      };
    } catch (err) {
      return sapError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const sapAdapter: SkillAdapter = {
  skillId: 'sap',
  name: 'SAP S/4HANA',
  // Base URL is dynamic from ctx.skillConfig.host; tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://HOST/sap/opu/odata/sap',
  auth: {
    type: 'oauth2',
    provider: 'sap',
  },
  tools: {
    sap_list_business_partners: listBusinessPartners,
    sap_get_sales_order: getSalesOrder,
    sap_list_materials: listMaterials,
    sap_create_purchase_order: createPurchaseOrder,
    sap_get_financials: getFinancials,
  },
  configSchema: {
    host: {
      type: 'string' as const,
      label: 'SAP Host',
      description: 'Your SAP S/4HANA Cloud host (e.g. "mycompany.s4hana.ondemand.com")',
      required: true,
      placeholder: 'mycompany.s4hana.ondemand.com',
    },
    client: {
      type: 'string' as const,
      label: 'SAP Client',
      description: 'SAP client number',
      default: '100',
    },
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 10 },
};
