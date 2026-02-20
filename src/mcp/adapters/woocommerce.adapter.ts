/**
 * MCP Skill Adapter — WooCommerce
 *
 * Maps WooCommerce REST API endpoints to MCP tool handlers.
 * WooCommerce uses a dynamic site URL: https://{site}/wp-json/wc/v3
 *
 * Authentication uses consumer key and consumer secret passed as query params
 * or via Basic auth depending on the site configuration.
 *
 * WooCommerce API docs: https://woocommerce.github.io/woocommerce-rest-api-docs/
 *
 * Tools:
 *   - woo_list_products      List products in the store
 *   - woo_create_product     Create a new product
 *   - woo_list_orders        List orders with optional filters
 *   - woo_update_order       Update an existing order
 *   - woo_list_customers     List customers
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the WooCommerce base URL from skill config */
function wooUrl(ctx: ToolExecutionContext): string {
  const siteUrl = ctx.skillConfig.siteUrl;
  if (!siteUrl) {
    throw new Error('WooCommerce site URL is required in skillConfig (e.g. { siteUrl: "https://mysite.com" })');
  }
  return `${siteUrl.replace(/\/$/, '')}/wp-json/wc/v3`;
}

/** Build auth query params from credentials */
function wooAuthQuery(ctx: ToolExecutionContext): Record<string, string> {
  const consumerKey = ctx.credentials.fields?.consumerKey ?? '';
  const consumerSecret = ctx.credentials.fields?.consumerSecret ?? '';
  return {
    consumer_key: consumerKey,
    consumer_secret: consumerSecret,
  };
}

function wooError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const code = data.code || '';
      const message = data.message || err.message;
      return { content: `WooCommerce API error [${code}]: ${message}`, isError: true };
    }
    return { content: `WooCommerce API error: ${err.message}`, isError: true };
  }
  return { content: `WooCommerce API error: ${String(err)}`, isError: true };
}

/** Format a WooCommerce product for display */
function formatProduct(product: any): string {
  const name = product.name || '(untitled)';
  const status = product.status || 'unknown';
  const price = product.price || 'N/A';
  const sku = product.sku || 'no sku';
  const stock = product.stock_status || 'unknown';
  return `${name} (ID: ${product.id}) -- ${status} -- $${price} -- SKU: ${sku} -- stock: ${stock}`;
}

/** Format a WooCommerce order for display */
function formatOrder(order: any): string {
  const number = order.number || order.id;
  const status = order.status || 'unknown';
  const total = order.total ? `${order.total} ${order.currency}` : 'N/A';
  const billing = order.billing?.first_name
    ? `${order.billing.first_name} ${order.billing.last_name || ''}`
    : order.billing?.email || 'unknown';
  const created = order.date_created ? order.date_created.slice(0, 10) : '';
  return `#${number} -- ${status} -- ${total} -- ${billing} -- ${created}`;
}

/** Format a WooCommerce customer for display */
function formatCustomer(customer: any): string {
  const name = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || '(no name)';
  const email = customer.email || '(no email)';
  const orders = customer.orders_count ?? 0;
  const spent = customer.total_spent || '0';
  return `${name} <${email}> (ID: ${customer.id}) -- ${orders} orders -- spent: $${spent}`;
}

// ─── Tool: woo_list_products ────────────────────────────

const listProducts: ToolHandler = {
  description:
    'List products in the WooCommerce store. Returns product names, prices, stock status, and SKUs.',
  inputSchema: {
    type: 'object',
    properties: {
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      status: {
        type: 'string',
        enum: ['any', 'draft', 'pending', 'private', 'publish'],
        description: 'Filter by product status',
      },
      search: {
        type: 'string',
        description: 'Search term to filter products',
      },
      category: {
        type: 'string',
        description: 'Filter by category ID',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = wooUrl(ctx);
      const authQuery = wooAuthQuery(ctx);
      const query: Record<string, string> = {
        ...authQuery,
        per_page: String(params.per_page ?? 25),
        page: String(params.page ?? 1),
      };
      if (params.status) query.status = params.status;
      if (params.search) query.search = params.search;
      if (params.category) query.category = params.category;

      const products = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/products`,
        query,
      });

      const items: any[] = Array.isArray(products) ? products : [];
      if (items.length === 0) {
        return { content: 'No products found.', metadata: { productCount: 0 } };
      }

      const lines = items.map((p: any) => formatProduct(p));
      return {
        content: `${items.length} product(s):\n${lines.join('\n')}`,
        metadata: { productCount: items.length },
      };
    } catch (err) {
      return wooError(err);
    }
  },
};

// ─── Tool: woo_create_product ───────────────────────────

const createProduct: ToolHandler = {
  description:
    'Create a new product in the WooCommerce store. Provide a name and optional price, description, SKU, and status.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Product name',
      },
      regular_price: {
        type: 'string',
        description: 'Regular price as a string (e.g. "29.99")',
      },
      description: {
        type: 'string',
        description: 'Full product description (HTML supported)',
      },
      short_description: {
        type: 'string',
        description: 'Short product description (HTML supported)',
      },
      sku: {
        type: 'string',
        description: 'Stock keeping unit',
      },
      status: {
        type: 'string',
        enum: ['draft', 'pending', 'private', 'publish'],
        description: 'Product status (default: "draft")',
      },
      type: {
        type: 'string',
        enum: ['simple', 'grouped', 'external', 'variable'],
        description: 'Product type (default: "simple")',
      },
    },
    required: ['name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = wooUrl(ctx);
      const authQuery = wooAuthQuery(ctx);
      const body: Record<string, any> = {
        name: params.name,
        status: params.status || 'draft',
        type: params.type || 'simple',
      };
      if (params.regular_price) body.regular_price = params.regular_price;
      if (params.description) body.description = params.description;
      if (params.short_description) body.short_description = params.short_description;
      if (params.sku) body.sku = params.sku;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/products`,
        query: authQuery,
        body,
      });

      return {
        content: `Product created: "${result.name}" (ID: ${result.id}) -- status: ${result.status} -- price: $${result.regular_price || 'N/A'}`,
        metadata: {
          productId: result.id,
          name: result.name,
          status: result.status,
        },
      };
    } catch (err) {
      return wooError(err);
    }
  },
};

// ─── Tool: woo_list_orders ──────────────────────────────

const listOrders: ToolHandler = {
  description:
    'List orders from the WooCommerce store. Optionally filter by status or date range.',
  inputSchema: {
    type: 'object',
    properties: {
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      status: {
        type: 'string',
        enum: ['any', 'pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'],
        description: 'Filter by order status',
      },
      after: {
        type: 'string',
        description: 'Limit to orders after this date (ISO 8601 format)',
      },
      before: {
        type: 'string',
        description: 'Limit to orders before this date (ISO 8601 format)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = wooUrl(ctx);
      const authQuery = wooAuthQuery(ctx);
      const query: Record<string, string> = {
        ...authQuery,
        per_page: String(params.per_page ?? 25),
        page: String(params.page ?? 1),
      };
      if (params.status) query.status = params.status;
      if (params.after) query.after = params.after;
      if (params.before) query.before = params.before;

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
      return wooError(err);
    }
  },
};

// ─── Tool: woo_update_order ─────────────────────────────

const updateOrder: ToolHandler = {
  description:
    'Update an existing WooCommerce order. Can change status, add a note, or update billing/shipping details.',
  inputSchema: {
    type: 'object',
    properties: {
      order_id: {
        type: 'number',
        description: 'The order ID to update',
      },
      status: {
        type: 'string',
        enum: ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'],
        description: 'New order status',
      },
      customer_note: {
        type: 'string',
        description: 'Customer-facing note to add to the order',
      },
      transaction_id: {
        type: 'string',
        description: 'Transaction ID for payment tracking',
      },
    },
    required: ['order_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = wooUrl(ctx);
      const authQuery = wooAuthQuery(ctx);
      const body: Record<string, any> = {};
      if (params.status) body.status = params.status;
      if (params.customer_note) body.customer_note = params.customer_note;
      if (params.transaction_id) body.transaction_id = params.transaction_id;

      const result = await ctx.apiExecutor.request({
        method: 'PUT',
        url: `${baseUrl}/orders/${params.order_id}`,
        query: authQuery,
        body,
      });

      return {
        content: `Order #${result.number || result.id} updated -- status: ${result.status}`,
        metadata: {
          orderId: result.id,
          orderNumber: result.number,
          status: result.status,
        },
      };
    } catch (err) {
      return wooError(err);
    }
  },
};

// ─── Tool: woo_list_customers ───────────────────────────

const listCustomers: ToolHandler = {
  description:
    'List customers in the WooCommerce store. Optionally search by name or email.',
  inputSchema: {
    type: 'object',
    properties: {
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      search: {
        type: 'string',
        description: 'Search term (searches name and email)',
      },
      role: {
        type: 'string',
        enum: ['all', 'customer', 'subscriber'],
        description: 'Filter by role (default: "all")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = wooUrl(ctx);
      const authQuery = wooAuthQuery(ctx);
      const query: Record<string, string> = {
        ...authQuery,
        per_page: String(params.per_page ?? 25),
        page: String(params.page ?? 1),
      };
      if (params.search) query.search = params.search;
      if (params.role) query.role = params.role;

      const customers = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/customers`,
        query,
      });

      const items: any[] = Array.isArray(customers) ? customers : [];
      if (items.length === 0) {
        return { content: 'No customers found.', metadata: { customerCount: 0 } };
      }

      const lines = items.map((c: any) => formatCustomer(c));
      return {
        content: `${items.length} customer(s):\n${lines.join('\n')}`,
        metadata: { customerCount: items.length },
      };
    } catch (err) {
      return wooError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const woocommerceAdapter: SkillAdapter = {
  skillId: 'woocommerce',
  name: 'WooCommerce',
  // Base URL is dynamic based on site URL; tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://SITE/wp-json/wc/v3',
  auth: {
    type: 'credentials',
    fields: ['consumerKey', 'consumerSecret'],
  },
  tools: {
    woo_list_products: listProducts,
    woo_create_product: createProduct,
    woo_list_orders: listOrders,
    woo_update_order: updateOrder,
    woo_list_customers: listCustomers,
  },
  configSchema: {
    siteUrl: {
      type: 'string' as const,
      label: 'Site URL',
      description: 'Your WooCommerce site URL (e.g. "https://mysite.com")',
      required: true,
    },
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 15,
  },
};
