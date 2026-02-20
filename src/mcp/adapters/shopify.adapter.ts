/**
 * MCP Skill Adapter — Shopify
 *
 * Maps Shopify Admin REST API endpoints to MCP tool handlers.
 * Shopify uses a dynamic store URL: https://{store}.myshopify.com/admin/api/2024-01
 *
 * The store name is read from ctx.skillConfig.store.
 *
 * Shopify API docs: https://shopify.dev/docs/api/admin-rest
 *
 * Tools:
 *   - shopify_list_products      List products in the store
 *   - shopify_create_product     Create a new product
 *   - shopify_list_orders        List orders with optional filters
 *   - shopify_get_order          Get a single order by ID
 *   - shopify_list_customers     List customers with optional filters
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Shopify store base URL from skill config */
function shopifyUrl(ctx: ToolExecutionContext): string {
  const store = ctx.skillConfig.store;
  if (!store) {
    throw new Error('Shopify store name is required in skillConfig (e.g. { store: "mystore" })');
  }
  return `https://${store}.myshopify.com/admin/api/2024-01`;
}

function shopifyError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errors = data.errors;
      if (typeof errors === 'string') {
        return { content: `Shopify API error: ${errors}`, isError: true };
      }
      if (typeof errors === 'object') {
        return { content: `Shopify API error: ${JSON.stringify(errors)}`, isError: true };
      }
      return { content: `Shopify API error: ${data.message || err.message}`, isError: true };
    }
    return { content: `Shopify API error: ${err.message}`, isError: true };
  }
  return { content: `Shopify API error: ${String(err)}`, isError: true };
}

/** Format a Shopify product for display */
function formatProduct(product: any): string {
  const title = product.title || '(untitled)';
  const status = product.status || 'unknown';
  const vendor = product.vendor || 'N/A';
  const variantCount = product.variants?.length ?? 0;
  const created = product.created_at ? product.created_at.slice(0, 10) : '';
  return `${title} (ID: ${product.id}) -- ${status} -- vendor: ${vendor} -- ${variantCount} variant(s) -- ${created}`;
}

/** Format a Shopify order for display */
function formatOrder(order: any): string {
  const name = order.name || `#${order.order_number || order.id}`;
  const status = order.financial_status || 'unknown';
  const fulfillment = order.fulfillment_status || 'unfulfilled';
  const total = order.total_price ? `${order.total_price} ${order.currency}` : 'N/A';
  const customer = order.customer?.first_name
    ? `${order.customer.first_name} ${order.customer.last_name || ''}`
    : order.email || 'unknown';
  const created = order.created_at ? order.created_at.slice(0, 10) : '';
  return `${name} -- ${status}/${fulfillment} -- ${total} -- ${customer} -- ${created}`;
}

/** Format a Shopify customer for display */
function formatCustomer(customer: any): string {
  const name = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || '(no name)';
  const email = customer.email || '(no email)';
  const orders = customer.orders_count ?? 0;
  const spent = customer.total_spent ? `${customer.total_spent} ${customer.currency || ''}` : 'N/A';
  return `${name} <${email}> (ID: ${customer.id}) -- ${orders} orders -- total spent: ${spent}`;
}

// ─── Tool: shopify_list_products ────────────────────────

const listProducts: ToolHandler = {
  description:
    'List products in the Shopify store. Returns product titles, statuses, vendors, and variant counts.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Max products to return (default 25, max 250)',
      },
      status: {
        type: 'string',
        enum: ['active', 'archived', 'draft'],
        description: 'Filter by product status',
      },
      collection_id: {
        type: 'string',
        description: 'Filter by collection ID',
      },
      since_id: {
        type: 'string',
        description: 'Return products after this ID (for pagination)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = shopifyUrl(ctx);
      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
      };
      if (params.status) query.status = params.status;
      if (params.collection_id) query.collection_id = params.collection_id;
      if (params.since_id) query.since_id = params.since_id;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/products.json`,
        query,
      });

      const products: any[] = result.products || [];
      if (products.length === 0) {
        return { content: 'No products found.', metadata: { productCount: 0 } };
      }

      const lines = products.map((p: any) => formatProduct(p));
      return {
        content: `${products.length} product(s):\n${lines.join('\n')}`,
        metadata: { productCount: products.length },
      };
    } catch (err) {
      return shopifyError(err);
    }
  },
};

// ─── Tool: shopify_create_product ───────────────────────

const createProduct: ToolHandler = {
  description:
    'Create a new product in the Shopify store. Provide a title and optional body HTML, vendor, product type, and tags.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Product title',
      },
      body_html: {
        type: 'string',
        description: 'Product description in HTML',
      },
      vendor: {
        type: 'string',
        description: 'Product vendor name',
      },
      product_type: {
        type: 'string',
        description: 'Product type / category',
      },
      tags: {
        type: 'string',
        description: 'Comma-separated list of tags',
      },
      status: {
        type: 'string',
        enum: ['active', 'archived', 'draft'],
        description: 'Product status (default: "draft")',
      },
    },
    required: ['title'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = shopifyUrl(ctx);
      const product: Record<string, any> = {
        title: params.title,
        status: params.status || 'draft',
      };
      if (params.body_html) product.body_html = params.body_html;
      if (params.vendor) product.vendor = params.vendor;
      if (params.product_type) product.product_type = params.product_type;
      if (params.tags) product.tags = params.tags;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/products.json`,
        body: { product },
      });

      const p = result.product;
      return {
        content: `Product created: "${p.title}" (ID: ${p.id}) -- status: ${p.status}`,
        metadata: {
          productId: p.id,
          title: p.title,
          status: p.status,
        },
      };
    } catch (err) {
      return shopifyError(err);
    }
  },
};

// ─── Tool: shopify_list_orders ──────────────────────────

const listOrders: ToolHandler = {
  description:
    'List orders from the Shopify store. Optionally filter by status, fulfillment status, or financial status.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Max orders to return (default 25, max 250)',
      },
      status: {
        type: 'string',
        enum: ['open', 'closed', 'cancelled', 'any'],
        description: 'Filter by order status (default: "any")',
      },
      financial_status: {
        type: 'string',
        enum: ['authorized', 'pending', 'paid', 'partially_paid', 'refunded', 'voided', 'any'],
        description: 'Filter by financial status',
      },
      fulfillment_status: {
        type: 'string',
        enum: ['shipped', 'partial', 'unshipped', 'unfulfilled', 'any'],
        description: 'Filter by fulfillment status',
      },
      since_id: {
        type: 'string',
        description: 'Return orders after this ID (for pagination)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = shopifyUrl(ctx);
      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
        status: params.status || 'any',
      };
      if (params.financial_status) query.financial_status = params.financial_status;
      if (params.fulfillment_status) query.fulfillment_status = params.fulfillment_status;
      if (params.since_id) query.since_id = params.since_id;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/orders.json`,
        query,
      });

      const orders: any[] = result.orders || [];
      if (orders.length === 0) {
        return { content: 'No orders found.', metadata: { orderCount: 0 } };
      }

      const lines = orders.map((o: any) => formatOrder(o));
      return {
        content: `${orders.length} order(s):\n${lines.join('\n')}`,
        metadata: { orderCount: orders.length },
      };
    } catch (err) {
      return shopifyError(err);
    }
  },
};

// ─── Tool: shopify_get_order ────────────────────────────

const getOrder: ToolHandler = {
  description:
    'Get details of a single Shopify order by its ID. Returns full order information including line items.',
  inputSchema: {
    type: 'object',
    properties: {
      order_id: {
        type: 'string',
        description: 'The Shopify order ID',
      },
    },
    required: ['order_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = shopifyUrl(ctx);
      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/orders/${params.order_id}.json`,
      });

      const o = result.order;
      const lineItems = (o.line_items || []).map((li: any) =>
        `  - ${li.title} x${li.quantity} @ ${li.price} ${o.currency}`
      ).join('\n');

      const customer = o.customer?.first_name
        ? `${o.customer.first_name} ${o.customer.last_name || ''}`
        : o.email || 'unknown';

      const content = [
        `Order ${o.name || '#' + o.id}`,
        `Status: ${o.financial_status} / ${o.fulfillment_status || 'unfulfilled'}`,
        `Customer: ${customer}`,
        `Total: ${o.total_price} ${o.currency}`,
        `Created: ${o.created_at?.slice(0, 16) || 'unknown'}`,
        lineItems ? `\nLine items:\n${lineItems}` : '',
      ].filter(Boolean).join('\n');

      return {
        content,
        metadata: {
          orderId: o.id,
          orderName: o.name,
          financialStatus: o.financial_status,
          fulfillmentStatus: o.fulfillment_status,
          total: o.total_price,
          currency: o.currency,
        },
      };
    } catch (err) {
      return shopifyError(err);
    }
  },
};

// ─── Tool: shopify_list_customers ───────────────────────

const listCustomers: ToolHandler = {
  description:
    'List customers in the Shopify store. Optionally search by query string.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Max customers to return (default 25, max 250)',
      },
      query: {
        type: 'string',
        description: 'Search query (searches name, email, etc.)',
      },
      since_id: {
        type: 'string',
        description: 'Return customers after this ID (for pagination)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = shopifyUrl(ctx);

      // If a search query is provided, use the search endpoint
      if (params.query) {
        const result = await ctx.apiExecutor.request({
          method: 'GET',
          url: `${baseUrl}/customers/search.json`,
          query: {
            query: params.query,
            limit: String(params.limit ?? 25),
          },
        });

        const customers: any[] = result.customers || [];
        if (customers.length === 0) {
          return { content: `No customers found matching "${params.query}".`, metadata: { customerCount: 0 } };
        }

        const lines = customers.map((c: any) => formatCustomer(c));
        return {
          content: `${customers.length} customer(s) matching "${params.query}":\n${lines.join('\n')}`,
          metadata: { customerCount: customers.length, query: params.query },
        };
      }

      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
      };
      if (params.since_id) query.since_id = params.since_id;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/customers.json`,
        query,
      });

      const customers: any[] = result.customers || [];
      if (customers.length === 0) {
        return { content: 'No customers found.', metadata: { customerCount: 0 } };
      }

      const lines = customers.map((c: any) => formatCustomer(c));
      return {
        content: `${customers.length} customer(s):\n${lines.join('\n')}`,
        metadata: { customerCount: customers.length },
      };
    } catch (err) {
      return shopifyError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const shopifyAdapter: SkillAdapter = {
  skillId: 'shopify',
  name: 'Shopify',
  // Base URL is dynamic based on store name; tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://STORE.myshopify.com/admin/api/2024-01',
  auth: {
    type: 'api_key',
    headerName: 'X-Shopify-Access-Token',
  },
  tools: {
    shopify_list_products: listProducts,
    shopify_create_product: createProduct,
    shopify_list_orders: listOrders,
    shopify_get_order: getOrder,
    shopify_list_customers: listCustomers,
  },
  configSchema: {
    store: {
      type: 'string' as const,
      label: 'Store Name',
      description: 'Your Shopify store name (e.g. "mystore" for mystore.myshopify.com)',
      required: true,
      placeholder: 'mystore',
    },
  },
  rateLimits: {
    requestsPerSecond: 2,
    burstLimit: 10,
  },
};
