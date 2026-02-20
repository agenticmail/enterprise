/**
 * MCP Skill Adapter — Cloudflare
 *
 * Maps Cloudflare v4 API endpoints to MCP tool handlers.
 * Covers zone listing, DNS record management, and cache purging.
 *
 * Cloudflare API docs: https://developers.cloudflare.com/api/
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function cfError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errors: any[] = data.errors || [];
      if (errors.length > 0) {
        const details = errors.map((e: any) => `[${e.code}] ${e.message}`).join('; ');
        return { content: `Cloudflare API error: ${details}`, isError: true };
      }
    }
    return { content: err.message, isError: true };
  }
  return { content: String(err), isError: true };
}

// ─── Tool: cloudflare_list_zones ────────────────────────

const listZones: ToolHandler = {
  description:
    'List Cloudflare zones (domains) in the account. Returns zone names, IDs, statuses, and plan info.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Filter by domain name (e.g. "example.com")',
      },
      status: {
        type: 'string',
        enum: ['active', 'pending', 'initializing', 'moved', 'deleted', 'deactivated'],
        description: 'Filter by zone status',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 20, max 50)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        page: String(params.page ?? 1),
        per_page: String(params.per_page ?? 20),
      };
      if (params.name) query.name = params.name;
      if (params.status) query.status = params.status;

      const result = await ctx.apiExecutor.get('/zones', query);

      const zones: any[] = result.result || [];

      if (zones.length === 0) {
        return { content: 'No Cloudflare zones found.' };
      }

      const lines = zones.map((z: any) => {
        const name = z.name || 'unknown';
        const id = z.id || 'unknown';
        const status = z.status || 'unknown';
        const plan = z.plan?.name || 'unknown plan';
        const nameServers = (z.name_servers || []).join(', ') || 'none';
        return `• ${name} (ID: ${id}) — ${status}, plan: ${plan}\n  NS: ${nameServers}`;
      });

      const total = result.result_info?.total_count || zones.length;

      return {
        content: `${zones.length} of ${total} zone(s):\n\n${lines.join('\n')}`,
        metadata: {
          zoneCount: zones.length,
          totalCount: total,
          page: result.result_info?.page || 1,
          totalPages: result.result_info?.total_pages || 1,
        },
      };
    } catch (err) {
      return cfError(err);
    }
  },
};

// ─── Tool: cloudflare_list_dns_records ──────────────────

const listDnsRecords: ToolHandler = {
  description:
    'List DNS records for a Cloudflare zone. Returns record types, names, values, and proxy status.',
  inputSchema: {
    type: 'object',
    properties: {
      zone_id: {
        type: 'string',
        description: 'Cloudflare zone ID',
      },
      type: {
        type: 'string',
        enum: ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'CAA'],
        description: 'Filter by DNS record type',
      },
      name: {
        type: 'string',
        description: 'Filter by record name (e.g. "www.example.com")',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 20, max 100)',
      },
    },
    required: ['zone_id'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        page: String(params.page ?? 1),
        per_page: String(params.per_page ?? 20),
      };
      if (params.type) query.type = params.type;
      if (params.name) query.name = params.name;

      const result = await ctx.apiExecutor.get(
        `/zones/${params.zone_id}/dns_records`,
        query,
      );

      const records: any[] = result.result || [];

      if (records.length === 0) {
        return {
          content: `No DNS records found for zone ${params.zone_id}.`,
          metadata: { recordCount: 0, zoneId: params.zone_id },
        };
      }

      const lines = records.map((r: any) => {
        const type = r.type || '?';
        const name = r.name || 'unknown';
        const content = r.content || '';
        const proxied = r.proxied ? 'proxied' : 'DNS only';
        const ttl = r.ttl === 1 ? 'auto' : `${r.ttl}s`;
        return `• [${type}] ${name} -> ${content} (${proxied}, TTL: ${ttl}, ID: ${r.id})`;
      });

      const total = result.result_info?.total_count || records.length;

      return {
        content: `${records.length} of ${total} DNS record(s) for zone ${params.zone_id}:\n\n${lines.join('\n')}`,
        metadata: {
          recordCount: records.length,
          totalCount: total,
          zoneId: params.zone_id,
        },
      };
    } catch (err) {
      return cfError(err);
    }
  },
};

// ─── Tool: cloudflare_create_dns_record ─────────────────

const createDnsRecord: ToolHandler = {
  description:
    'Create a new DNS record in a Cloudflare zone. Supports A, AAAA, CNAME, TXT, MX, and other record types.',
  inputSchema: {
    type: 'object',
    properties: {
      zone_id: {
        type: 'string',
        description: 'Cloudflare zone ID',
      },
      type: {
        type: 'string',
        description: 'DNS record type (e.g. "A", "CNAME", "TXT", "MX")',
      },
      name: {
        type: 'string',
        description: 'DNS record name (e.g. "www" or "www.example.com")',
      },
      content: {
        type: 'string',
        description: 'DNS record content (e.g. IP address, hostname, or TXT value)',
      },
      ttl: {
        type: 'number',
        description: 'TTL in seconds (1 = automatic). Default: 1',
      },
      proxied: {
        type: 'boolean',
        description: 'Whether traffic is proxied through Cloudflare (default false)',
      },
      priority: {
        type: 'number',
        description: 'Priority for MX and SRV records',
      },
    },
    required: ['zone_id', 'type', 'name', 'content'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        type: params.type,
        name: params.name,
        content: params.content,
        ttl: params.ttl ?? 1,
      };
      if (params.proxied !== undefined) body.proxied = params.proxied;
      if (params.priority !== undefined) body.priority = params.priority;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: `/zones/${params.zone_id}/dns_records`,
        body,
      });

      const record = result.result || {};
      return {
        content: `DNS record created: [${record.type}] ${record.name} -> ${record.content} (ID: ${record.id})`,
        metadata: {
          recordId: record.id,
          zoneId: params.zone_id,
          type: record.type,
          name: record.name,
          content: record.content,
        },
      };
    } catch (err) {
      return cfError(err);
    }
  },
};

// ─── Tool: cloudflare_purge_cache ───────────────────────

const purgeCache: ToolHandler = {
  description:
    'Purge the Cloudflare cache for a zone. Can purge everything or specific URLs/tags.',
  inputSchema: {
    type: 'object',
    properties: {
      zone_id: {
        type: 'string',
        description: 'Cloudflare zone ID',
      },
      purge_everything: {
        type: 'boolean',
        description: 'Purge all cached content for the zone (default false)',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of URLs to purge from cache (e.g. ["https://example.com/style.css"])',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of cache tags to purge (Enterprise plan only)',
      },
      hosts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of hostnames to purge (e.g. ["www.example.com"])',
      },
    },
    required: ['zone_id'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {};

      if (params.purge_everything) {
        body.purge_everything = true;
      } else if (params.files && params.files.length > 0) {
        body.files = params.files;
      } else if (params.tags && params.tags.length > 0) {
        body.tags = params.tags;
      } else if (params.hosts && params.hosts.length > 0) {
        body.hosts = params.hosts;
      } else {
        return {
          content: 'Error: Must specify purge_everything, files, tags, or hosts.',
          isError: true,
        };
      }

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: `/zones/${params.zone_id}/purge_cache`,
        body,
      });

      const purgeId = result.result?.id || 'unknown';

      if (params.purge_everything) {
        return {
          content: `Cache purged for entire zone ${params.zone_id} (purge ID: ${purgeId})`,
          metadata: { zoneId: params.zone_id, purgeId, type: 'everything' },
        };
      }

      const targetCount = (params.files || params.tags || params.hosts || []).length;
      const targetType = params.files ? 'URL(s)' : params.tags ? 'tag(s)' : 'host(s)';

      return {
        content: `Cache purged for ${targetCount} ${targetType} in zone ${params.zone_id} (purge ID: ${purgeId})`,
        metadata: {
          zoneId: params.zone_id,
          purgeId,
          type: params.files ? 'files' : params.tags ? 'tags' : 'hosts',
          targetCount,
        },
      };
    } catch (err) {
      return cfError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const cloudflareAdapter: SkillAdapter = {
  skillId: 'cloudflare-cdn',
  name: 'Cloudflare',
  baseUrl: 'https://api.cloudflare.com/client/v4',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    cloudflare_list_zones: listZones,
    cloudflare_list_dns_records: listDnsRecords,
    cloudflare_create_dns_record: createDnsRecord,
    cloudflare_purge_cache: purgeCache,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 25 },
  configSchema: {
    accountId: {
      type: 'string' as const,
      label: 'Cloudflare Account ID',
      description: 'Your Cloudflare account ID (found in dashboard URL)',
      required: true,
      placeholder: 'abcdef1234567890',
    },
  },
};
