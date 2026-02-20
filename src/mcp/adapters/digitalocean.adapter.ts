/**
 * MCP Skill Adapter — DigitalOcean
 *
 * Maps DigitalOcean API v2 endpoints to MCP tool handlers.
 * Provides access to droplet management, database listing,
 * domain listing, and account information.
 *
 * DigitalOcean API docs: https://docs.digitalocean.com/reference/api/api-reference/
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function doError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message || err.message;
      const id = data.id || '';
      const detail = id ? `${msg} (id: ${id})` : msg;
      return { content: `DigitalOcean API error: ${detail}`, isError: true };
    }
    return { content: `DigitalOcean API error: ${err.message}`, isError: true };
  }
  return { content: `DigitalOcean API error: ${String(err)}`, isError: true };
}

// ─── Tool: do_list_droplets ─────────────────────────────

const listDroplets: ToolHandler = {
  description:
    'List all droplets (virtual machines) in the DigitalOcean account. Returns names, IDs, regions, sizes, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
      per_page: {
        type: 'number',
        description: 'Number of droplets per page (default 20, max 200)',
      },
      tag_name: {
        type: 'string',
        description: 'Filter droplets by tag name',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        page: String(params.page ?? 1),
        per_page: String(params.per_page ?? 20),
      };
      if (params.tag_name) query.tag_name = params.tag_name;

      const result = await ctx.apiExecutor.get('/droplets', query);

      const droplets: any[] = result.droplets || [];
      if (droplets.length === 0) {
        return { content: 'No droplets found.' };
      }

      const lines = droplets.map((d: any) => {
        const name = d.name || 'unknown';
        const id = d.id || 'unknown';
        const status = d.status || 'unknown';
        const region = d.region?.slug || 'unknown';
        const size = d.size_slug || d.size?.slug || 'unknown';
        const image = d.image?.name || d.image?.slug || 'unknown';
        const ip = d.networks?.v4?.find((n: any) => n.type === 'public')?.ip_address || 'N/A';
        return `${name} (ID: ${id}) — ${status}, region: ${region}, size: ${size}, IP: ${ip}\n  image: ${image}`;
      });

      const total = result.meta?.total || droplets.length;

      return {
        content: `Found ${droplets.length} of ${total} droplet(s):\n${lines.join('\n')}`,
        metadata: { count: droplets.length, total },
      };
    } catch (err) {
      return doError(err);
    }
  },
};

// ─── Tool: do_create_droplet ────────────────────────────

const createDroplet: ToolHandler = {
  description:
    'Create a new DigitalOcean droplet. Specify the name, region, size, and image.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Droplet name (hostname)',
      },
      region: {
        type: 'string',
        description: 'Region slug (e.g. "nyc3", "sfo3", "lon1")',
      },
      size: {
        type: 'string',
        description: 'Size slug (e.g. "s-1vcpu-1gb", "s-2vcpu-4gb")',
      },
      image: {
        type: 'string',
        description: 'Image slug or ID (e.g. "ubuntu-22-04-x64", "docker-20-04")',
      },
      ssh_keys: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of SSH key fingerprints or IDs to add to the droplet',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to apply to the droplet',
      },
      backups: {
        type: 'boolean',
        description: 'Enable automated backups (default false)',
      },
      monitoring: {
        type: 'boolean',
        description: 'Enable monitoring agent (default false)',
      },
    },
    required: ['name', 'region', 'size', 'image'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        name: params.name,
        region: params.region,
        size: params.size,
        image: params.image,
      };
      if (params.ssh_keys?.length) body.ssh_keys = params.ssh_keys;
      if (params.tags?.length) body.tags = params.tags;
      if (params.backups !== undefined) body.backups = params.backups;
      if (params.monitoring !== undefined) body.monitoring = params.monitoring;

      const result = await ctx.apiExecutor.post('/droplets', body);

      const droplet = result.droplet || {};
      return {
        content: [
          `Droplet created: ${droplet.name || params.name}`,
          `ID: ${droplet.id || 'pending'}`,
          `Status: ${droplet.status || 'new'}`,
          `Region: ${params.region}`,
          `Size: ${params.size}`,
          `Image: ${params.image}`,
        ].join('\n'),
        metadata: {
          id: droplet.id,
          name: droplet.name || params.name,
          region: params.region,
          status: droplet.status || 'new',
        },
      };
    } catch (err) {
      return doError(err);
    }
  },
};

// ─── Tool: do_list_databases ────────────────────────────

const listDatabases: ToolHandler = {
  description:
    'List all managed database clusters in the DigitalOcean account. Returns engines, versions, regions, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      tag_name: {
        type: 'string',
        description: 'Filter databases by tag name',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {};
      if (params.tag_name) query.tag_name = params.tag_name;

      const result = await ctx.apiExecutor.get('/databases', query);

      const databases: any[] = result.databases || [];
      if (databases.length === 0) {
        return { content: 'No managed databases found.' };
      }

      const lines = databases.map((db: any) => {
        const name = db.name || 'unknown';
        const id = db.id || 'unknown';
        const engine = db.engine || 'unknown';
        const version = db.version || 'unknown';
        const status = db.status || 'unknown';
        const region = db.region || 'unknown';
        const size = db.size || 'unknown';
        const numNodes = db.num_nodes || 1;
        return `${name} (ID: ${id}) — ${engine} v${version}, ${status}\n  region: ${region}, size: ${size}, nodes: ${numNodes}`;
      });

      return {
        content: `Found ${databases.length} managed database(s):\n${lines.join('\n')}`,
        metadata: { count: databases.length },
      };
    } catch (err) {
      return doError(err);
    }
  },
};

// ─── Tool: do_list_domains ──────────────────────────────

const listDomains: ToolHandler = {
  description:
    'List all domains registered in the DigitalOcean account. Returns domain names and TTL values.',
  inputSchema: {
    type: 'object',
    properties: {
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
      per_page: {
        type: 'number',
        description: 'Domains per page (default 20, max 200)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        page: String(params.page ?? 1),
        per_page: String(params.per_page ?? 20),
      };

      const result = await ctx.apiExecutor.get('/domains', query);

      const domains: any[] = result.domains || [];
      if (domains.length === 0) {
        return { content: 'No domains found.' };
      }

      const lines = domains.map((d: any) => {
        const name = d.name || 'unknown';
        const ttl = d.ttl || 'default';
        const zoneFile = d.zone_file ? 'has zone file' : 'no zone file';
        return `${name} — TTL: ${ttl}, ${zoneFile}`;
      });

      const total = result.meta?.total || domains.length;

      return {
        content: `Found ${domains.length} of ${total} domain(s):\n${lines.join('\n')}`,
        metadata: { count: domains.length, total },
      };
    } catch (err) {
      return doError(err);
    }
  },
};

// ─── Tool: do_get_account ───────────────────────────────

const getAccount: ToolHandler = {
  description:
    'Get DigitalOcean account information including email, droplet limit, team membership, and verification status.',
  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get('/account');

      const account = result.account || result;
      return {
        content: [
          `Email: ${account.email || 'unknown'}`,
          `UUID: ${account.uuid || 'unknown'}`,
          `Droplet Limit: ${account.droplet_limit ?? 'unknown'}`,
          `Floating IP Limit: ${account.floating_ip_limit ?? 'unknown'}`,
          `Volume Limit: ${account.volume_limit ?? 'unknown'}`,
          `Email Verified: ${account.email_verified ?? 'unknown'}`,
          `Status: ${account.status || 'unknown'}`,
          `Team: ${account.team?.name || 'none'}`,
        ].join('\n'),
        metadata: {
          email: account.email,
          uuid: account.uuid,
          status: account.status,
        },
      };
    } catch (err) {
      return doError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const digitaloceanAdapter: SkillAdapter = {
  skillId: 'digitalocean',
  name: 'DigitalOcean',
  baseUrl: 'https://api.digitalocean.com/v2',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    do_list_droplets: listDroplets,
    do_create_droplet: createDroplet,
    do_list_databases: listDatabases,
    do_list_domains: listDomains,
    do_get_account: getAccount,
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 15 },
};
