/**
 * MCP Skill Adapter — BigCommerce
 *
 * Maps BigCommerce REST API v3 endpoints to MCP tool handlers.
 * BigCommerce uses a dynamic base URL: https://api.bigcommerce.com/stores/{store_hash}/v3
 *
 * The store hash is read from ctx.skillConfig.storeHash.
 *
 * BigCommerce API docs: https://developer.bigcommerce.com/docs/rest-catalog
 *
 * Tools:
 *   - bc_list_products      List products in the store
 *   - bc_create_product     Create a new product
 *   - bc_list_orders        List orders
 *   - bc_list_customers     List customers
 *   - bc_get_store_info     Get store information
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the BigCommerce store base URL from skill config */
function bcUrl(ctx: ToolExecutionContext): string {
  const storeHash = ctx.skillConfig.storeHash;
  if (!storeHash) {
    throw new Error('BigCommerce store hash is required in skillConfig (e.g. { storeHash: "abc123" })');
  }
  return `https://api.bigcommerce.com/stores/${storeHash}/v3`;
}

/** V2 URL for orders (BigCommerce orders are still on v2) */
function bcV2Url(ctx: ToolExecutionContext): string {
  const storeHash = ctx.skillConfig.storeHash;
  if (!storeHash) {
    throw new Error('BigCommerce store hash is required in skillConfig');
  }
  return `https://api.bigcommerce.com/stores/${storeHash}/v2`;
}

function bcError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const title = data.title || '';
      const detail = data.detail || data.message || err.message;
      const errors = data.errors ? ` -- ${JSON.stringify(data.errors)}` : '';
      return { content: `BigCommerce API error [${title}]: ${detail}${errors}`, isError: true };
    }
    return { content: `BigCommerce API error: ${err.message}`, isError: true };
  }
  return { content: `BigCommerce API error: ${String(err)}`, isError: true };
}

/** Format a BigCommerce product for display */
function formatProduct(product: any): string {
  const name = product.name || '(untitled)';
  const price = product.price !== undefined ? `$${product.price}` : 'N/A';
  const sku = product.sku || 'no sku';
  const availability = product.availability || 'unknown';
  const inventory = product.inventory_level !== undefined ? product.inventory_level : 'N/A';
  return `${name} (ID: ${product.id}) -- ${price} -- SKU: ${sku} -- ${availability} -- stock: ${inventory}`;
}

/** Format a BigCommerce order for display */
function formatOrder(order: any): string {
  const id = order.id;
  const status = order.status || 'unknown';
  const total = order.total_inc_tax ? `$${order.total_inc_tax}` : 'N/A';
  const customer = order.billing_address
    ? `${order.billing_address.first_name || ''} ${order.billing_address.last_name || ''}`.trim()
    : 'unknown';
  const created = order.date_created ? order.date_created.slice(0, 10) : '';
  return `#${id} -- ${status} -- ${total} -- ${customer} -- ${created}`;
}

/** Format a BigCommerce customer for display */
function formatCustomer(customer: any): string {
  const name = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || '(no name)';
  const email = customer.email || '(no email)';
  const orders = customer.orders_count ?? 0;
  return `${name} <${email}> (ID: ${customer.id}) -- ${orders} orders`;
}

// ─── Tool: bc_list_products ─────────────────────────────

const listProducts: ToolHandler = {
  description:
    'List products in the BigCommerce store. Returns product names, prices, SKUs, and availability.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Max products to return (default 25, max 250)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      name: {
        type: 'string',
        description: 'Filter by product name (partial match)',
      },
      keyword: {
        type: 'string',
        description: 'Search keyword across product fields',
      },
      is_visible: {
        type: 'boolean',
        description: 'Filter by visibility (true = visible on storefront)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = bcUrl(ctx);
      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
        page: String(params.page ?? 1),
      };
      if (params.name) query.name = params.name;
      if (params.keyword) query.keyword = params.keyword;
      if (params.is_visible !== undefined) query.is_visible = String(params.is_visible);

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/catalog/products`,
        query,
      });

      const products: any[] = result.data || [];
      if (products.length === 0) {
        return { content: 'No products found.', metadata: { productCount: 0 } };
      }

      const lines = products.map((p: any) => formatProduct(p));
      const total = result.meta?.pagination?.total ?? products.length;
      return {
        content: `${products.length} of ${total} product(s):\n${lines.join('\n')}`,
        metadata: { productCount: products.length, total },
      };
    } catch (err) {
      return bcError(err);
    }
  },
};

// ─── Tool: bc_create_product ────────────────────────────

const createProduct: ToolHandler = {
  description:
    'Create a new product in the BigCommerce store. Provide a name, price, type, and weight.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Product name',
      },
      price: {
        type: 'number',
        description: 'Product price',
      },
      type: {
        type: 'string',
        enum: ['physical', 'digital'],
        description: 'Product type (default: "physical")',
      },
      weight: {
        type: 'number',
        description: 'Product weight (required for physical products)',
      },
      sku: {
        type: 'string',
        description: 'Stock keeping unit',
      },
      description: {
        type: 'string',
        description: 'Product description (HTML supported)',
      },
      categories: {
        type: 'array',
        items: { type: 'number' },
        description: 'Array of category IDs',
      },
    },
    required: ['name', 'price', 'weight', 'type'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = bcUrl(ctx);
      const body: Record<string, any> = {
        name: params.name,
        price: params.price,
        type: params.type || 'physical',
        weight: params.weight,
      };
      if (params.sku) body.sku = params.sku;
      if (params.description) body.description = params.description;
      if (params.categories) body.categories = params.categories;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/catalog/products`,
        body,
      });

      const p = result.data;
      return {
        content: `Product created: "${p.name}" (ID: ${p.id}) -- $${p.price} -- type: ${p.type}`,
        metadata: {
          productId: p.id,
          name: p.name,
          price: p.price,
        },
      };
    } catch (err) {
      return bcError(err);
    }
  },
};

// ─── Tool: bc_list_orders ───────────────────────────────

const listOrders: ToolHandler = {
  description:
    'List orders from the BigCommerce store. Optionally filter by status or date range.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Max orders to return (default 25, max 250)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      status_id: {
        type: 'number',
        description: 'Filter by order status ID',
      },
      min_date_created: {
        type: 'string',
        description: 'Filter orders created after this date (RFC 2822 or ISO 8601)',
      },
      max_date_created: {
        type: 'string',
        description: 'Filter orders created before this date (RFC 2822 or ISO 8601)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = bcV2Url(ctx);
      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
        page: String(params.page ?? 1),
      };
      if (params.status_id !== undefined) query.status_id = String(params.status_id);
      if (params.min_date_created) query.min_date_created = params.min_date_created;
      if (params.max_date_created) query.max_date_created = params.max_date_created;

      const orders = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/orders`,
        query,
      });

      const items: any[] = Array.isArray(orders) ? orders : [];
      if (items.length === 0) {
        return { content: 'No orders found.', metadata: { orderCount: 0 } };
      }

      const lines = items.map((o: any) => formatOrder(o));
      return {
        content: `${items.length} order(s):\n${lines.join('\n')}`,
        metadata: { orderCount: items.length },
      };
    } catch (err) {
      return bcError(err);
    }
  },
};

// ─── Tool: bc_list_customers ────────────────────────────

const listCustomers: ToolHandler = {
  description:
    'List customers in the BigCommerce store. Optionally filter by email or name.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Max customers to return (default 25, max 250)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      'email:in': {
        type: 'string',
        description: 'Filter by email address (comma-separated for multiple)',
      },
      'name:like': {
        type: 'string',
        description: 'Filter by name (partial match)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = bcUrl(ctx);
      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
        page: String(params.page ?? 1),
      };
      if (params['email:in']) query['email:in'] = params['email:in'];
      if (params['name:like']) query['name:like'] = params['name:like'];

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/customers`,
        query,
      });

      const customers: any[] = result.data || [];
      if (customers.length === 0) {
        return { content: 'No customers found.', metadata: { customerCount: 0 } };
      }

      const lines = customers.map((c: any) => formatCustomer(c));
      const total = result.meta?.pagination?.total ?? customers.length;
      return {
        content: `${customers.length} of ${total} customer(s):\n${lines.join('\n')}`,
        metadata: { customerCount: customers.length, total },
      };
    } catch (err) {
      return bcError(err);
    }
  },
};

// ─── Tool: bc_get_store_info ────────────────────────────

const getStoreInfo: ToolHandler = {
  description:
    'Get general information about the BigCommerce store, including name, domain, plan, and status.',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = bcV2Url(ctx);
      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/store`,
      });

      const content = [
        `Store: ${result.name || 'unknown'}`,
        `Domain: ${result.domain || 'N/A'}`,
        `Secure URL: ${result.secure_url || 'N/A'}`,
        `Plan: ${result.plan_name || 'N/A'}`,
        `Status: ${result.status || 'unknown'}`,
        `Currency: ${result.currency || 'N/A'}`,
        `Country: ${result.country || 'N/A'}`,
        `Weight Units: ${result.weight_units || 'N/A'}`,
      ].join('\n');

      return {
        content,
        metadata: {
          storeId: result.id,
          name: result.name,
          domain: result.domain,
          plan: result.plan_name,
        },
      };
    } catch (err) {
      return bcError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const bigcommerceAdapter: SkillAdapter = {
  skillId: 'bigcommerce',
  name: 'BigCommerce',
  // Base URL is dynamic based on store hash; tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://api.bigcommerce.com/stores/STORE_HASH/v3',
  auth: {
    type: 'api_key',
    headerName: 'X-Auth-Token',
  },
  tools: {
    bc_list_products: listProducts,
    bc_create_product: createProduct,
    bc_list_orders: listOrders,
    bc_list_customers: listCustomers,
    bc_get_store_info: getStoreInfo,
  },
  configSchema: {
    storeHash: {
      type: 'string' as const,
      label: 'Store Hash',
      description: 'Your BigCommerce store hash (found in your API account settings)',
      required: true,
    },
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 15,
  },
};
