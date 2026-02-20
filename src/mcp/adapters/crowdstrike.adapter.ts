/**
 * MCP Skill Adapter — CrowdStrike
 *
 * Maps CrowdStrike Falcon API endpoints to MCP tool handlers.
 * Covers detection management, host listing, host containment, and IOC search.
 *
 * CrowdStrike uses OAuth2 for authentication.
 *
 * CrowdStrike API docs: https://falcon.crowdstrike.com/documentation/
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function csError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errors: any[] = data.errors || [];
      if (errors.length > 0) {
        const details = errors.map((e: any) => `[${e.code || ''}] ${e.message || ''}`).join('; ');
        return { content: `CrowdStrike API error: ${details}`, isError: true };
      }
      const message = data.message || err.message;
      return { content: `CrowdStrike API error: ${message}`, isError: true };
    }
    return { content: `CrowdStrike API error: ${err.message}`, isError: true };
  }
  return { content: `CrowdStrike API error: ${String(err)}`, isError: true };
}

/** Map CrowdStrike detection severity to a label. */
function severityName(severity: number | undefined): string {
  if (severity === undefined) return 'UNKNOWN';
  if (severity >= 80) return 'CRITICAL';
  if (severity >= 60) return 'HIGH';
  if (severity >= 40) return 'MEDIUM';
  if (severity >= 20) return 'LOW';
  return 'INFORMATIONAL';
}

// ─── Tool: cs_list_detections ───────────────────────────

const listDetections: ToolHandler = {
  description:
    'List CrowdStrike Falcon detections. Returns detection IDs for further detail retrieval. Optionally filter by query.',
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'FQL filter expression (e.g. "status:\'new\'+severity:>=60")',
      },
      sort: {
        type: 'string',
        description: 'Sort expression (e.g. "last_behavior|desc")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of detection IDs to return (default 20, max 9999)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        offset: String(params.offset ?? 0),
      };
      if (params.filter) query.filter = params.filter;
      if (params.sort) query.sort = params.sort;

      const result = await ctx.apiExecutor.get('/detects/queries/detects/v1', query);

      const resources: string[] = result.resources || [];
      const total = result.meta?.pagination?.total || resources.length;

      if (resources.length === 0) {
        return {
          content: 'No detections found.',
          metadata: { detectionCount: 0, total: 0 },
        };
      }

      const lines = resources.map((id: string, idx: number) => {
        return `  ${idx + 1}. ${id}`;
      });

      return {
        content: `Found ${resources.length} of ${total} detection(s):\n\n${lines.join('\n')}\n\nUse cs_get_detection to retrieve details for each ID.`,
        metadata: { detectionCount: resources.length, total },
      };
    } catch (err) {
      return csError(err);
    }
  },
};

// ─── Tool: cs_get_detection ─────────────────────────────

const getDetection: ToolHandler = {
  description:
    'Retrieve detailed information about specific CrowdStrike detections by their IDs. Returns behaviors, severity, device info, and status.',
  inputSchema: {
    type: 'object',
    properties: {
      ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of detection IDs to retrieve (max 20)',
      },
    },
    required: ['ids'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.post('/detects/entities/summaries/GET/v1', {
        ids: params.ids,
      });

      const resources: any[] = result.resources || [];

      if (resources.length === 0) {
        return {
          content: 'No detection details found for the provided IDs.',
          metadata: { detectionCount: 0 },
        };
      }

      const detections = resources.map((d: any) => {
        const device = d.device || {};
        const hostname = device.hostname || 'unknown';
        const platform = device.platform_name || 'unknown';
        const severity = severityName(d.max_severity);
        const status = d.status || 'unknown';
        const firstBehavior = d.first_behavior ? new Date(d.first_behavior).toLocaleString() : 'unknown';
        const lastBehavior = d.last_behavior ? new Date(d.last_behavior).toLocaleString() : 'unknown';

        const behaviors = (d.behaviors || []).map((b: any) => {
          return `    - ${b.tactic || 'N/A'}/${b.technique || 'N/A'}: ${b.description || b.scenario || 'N/A'}`;
        });

        return [
          `Detection: ${d.detection_id}`,
          `  Host: ${hostname} (${platform})`,
          `  Severity: ${severity} (${d.max_severity || 0})`,
          `  Status: ${status}`,
          `  First behavior: ${firstBehavior}`,
          `  Last behavior: ${lastBehavior}`,
          `  Behaviors:`,
          ...behaviors,
        ].join('\n');
      });

      return {
        content: `${resources.length} detection(s):\n\n${detections.join('\n\n')}`,
        metadata: { detectionCount: resources.length },
      };
    } catch (err) {
      return csError(err);
    }
  },
};

// ─── Tool: cs_list_hosts ────────────────────────────────

const listHosts: ToolHandler = {
  description:
    'List CrowdStrike Falcon hosts (endpoints). Returns host IDs, hostnames, platforms, and last seen times.',
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'FQL filter expression (e.g. "platform_name:\'Windows\'")',
      },
      sort: {
        type: 'string',
        description: 'Sort expression (e.g. "hostname|asc")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of hosts to return (default 20)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      // First, get host IDs
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        offset: String(params.offset ?? 0),
      };
      if (params.filter) query.filter = params.filter;
      if (params.sort) query.sort = params.sort;

      const idResult = await ctx.apiExecutor.get('/devices/queries/devices-scroll/v1', query);
      const hostIds: string[] = idResult.resources || [];

      if (hostIds.length === 0) {
        return {
          content: 'No hosts found.',
          metadata: { hostCount: 0 },
        };
      }

      // Then, get host details
      const detailResult = await ctx.apiExecutor.post('/devices/entities/devices/v2', {
        ids: hostIds,
      });

      const hosts: any[] = detailResult.resources || [];

      const lines = hosts.map((h: any) => {
        const hostname = h.hostname || 'unknown';
        const platform = h.platform_name || 'unknown';
        const osVersion = h.os_version || 'unknown';
        const lastSeen = h.last_seen ? new Date(h.last_seen).toLocaleString() : 'unknown';
        const status = h.status || 'unknown';
        const contained = h.containment_status === 'contained' ? ' [CONTAINED]' : '';
        return `• ${hostname} (${platform} ${osVersion}) — status: ${status}, last seen: ${lastSeen}${contained} (ID: ${h.device_id})`;
      });

      return {
        content: `Found ${hosts.length} host(s):\n\n${lines.join('\n')}`,
        metadata: { hostCount: hosts.length },
      };
    } catch (err) {
      return csError(err);
    }
  },
};

// ─── Tool: cs_contain_host ──────────────────────────────

const containHost: ToolHandler = {
  description:
    'Contain or lift containment on a CrowdStrike host. Containment isolates the host from the network while maintaining sensor connectivity.',
  inputSchema: {
    type: 'object',
    properties: {
      ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of host device IDs to contain or release',
      },
      action: {
        type: 'string',
        enum: ['contain', 'lift_containment'],
        description: 'Action to perform: "contain" to isolate or "lift_containment" to release',
      },
    },
    required: ['ids', 'action'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        action_name: params.action,
      };

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: '/devices/entities/devices-actions/v2',
        query,
        body: {
          ids: params.ids,
        },
      });

      const resources: any[] = result.resources || [];
      const actionLabel = params.action === 'contain' ? 'contained' : 'released from containment';

      return {
        content: `${params.ids.length} host(s) ${actionLabel} successfully.`,
        metadata: {
          hostIds: params.ids,
          action: params.action,
          processedCount: resources.length,
        },
      };
    } catch (err) {
      return csError(err);
    }
  },
};

// ─── Tool: cs_search_iocs ──────────────────────────────

const searchIocs: ToolHandler = {
  description:
    'Search for Indicators of Compromise (IOCs) in CrowdStrike. Query by type (ip, domain, sha256, etc.) and value.',
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'FQL filter expression (e.g. "type:\'ipv4\'+value:\'1.2.3.4\'")',
      },
      types: {
        type: 'string',
        description: 'Comma-separated IOC types to search (e.g. "ipv4,domain,sha256")',
      },
      values: {
        type: 'string',
        description: 'Comma-separated IOC values to search for',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of IOCs to return (default 20)',
      },
      sort: {
        type: 'string',
        description: 'Sort expression (e.g. "modified_on|desc")',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.filter) query.filter = params.filter;
      if (params.types) query.types = params.types;
      if (params.values) query.values = params.values;
      if (params.sort) query.sort = params.sort;

      const result = await ctx.apiExecutor.get('/iocs/combined/indicator/v1', query);

      const resources: any[] = result.resources || [];

      if (resources.length === 0) {
        return {
          content: 'No IOCs found matching the criteria.',
          metadata: { iocCount: 0 },
        };
      }

      const lines = resources.map((ioc: any) => {
        const type = ioc.type || 'unknown';
        const value = ioc.value || 'unknown';
        const action = ioc.action || 'none';
        const severity = ioc.severity || 'unknown';
        const created = ioc.created_on ? new Date(ioc.created_on).toLocaleString() : 'unknown';
        const expiration = ioc.expiration ? new Date(ioc.expiration).toLocaleString() : 'none';
        return `• [${type}] ${value} — action: ${action}, severity: ${severity}, created: ${created}, expires: ${expiration}`;
      });

      return {
        content: `Found ${resources.length} IOC(s):\n\n${lines.join('\n')}`,
        metadata: { iocCount: resources.length },
      };
    } catch (err) {
      return csError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const crowdstrikeAdapter: SkillAdapter = {
  skillId: 'crowdstrike',
  name: 'CrowdStrike',
  baseUrl: 'https://api.crowdstrike.com',
  auth: {
    type: 'oauth2',
    provider: 'crowdstrike',
  },
  tools: {
    cs_list_detections: listDetections,
    cs_get_detection: getDetection,
    cs_list_hosts: listHosts,
    cs_contain_host: containHost,
    cs_search_iocs: searchIocs,
  },
  rateLimits: { requestsPerSecond: 10, burstLimit: 20 },
  configSchema: {
    cloud: {
      type: 'select' as const,
      label: 'Cloud Region',
      description: 'CrowdStrike cloud region for API access',
      options: [
        { label: 'US-1', value: 'us-1' },
        { label: 'US-2', value: 'us-2' },
        { label: 'EU-1', value: 'eu-1' },
      ],
      default: 'us-1',
    },
  },
};
