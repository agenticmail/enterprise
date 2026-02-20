/**
 * MCP Skill Adapter — Atlassian Statuspage
 *
 * Maps Statuspage REST API endpoints to MCP tool handlers.
 * Statuspage is used for public status pages and incident communication.
 *
 * The page ID is read from ctx.skillConfig.pageId.
 *
 * Statuspage API docs: https://developer.statuspage.io/
 *
 * Tools:
 *   - statuspage_list_incidents      List incidents
 *   - statuspage_create_incident     Create a new incident
 *   - statuspage_update_incident     Update an existing incident
 *   - statuspage_list_components     List components
 *   - statuspage_update_component    Update a component's status
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the page ID from skill config */
function pageId(ctx: ToolExecutionContext): string {
  const id = ctx.skillConfig.pageId;
  if (!id) {
    throw new Error('Statuspage page ID is required in skillConfig (e.g. { pageId: "abc123def456" })');
  }
  return id;
}

function statuspageError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const errors = data.error || data.errors;
      if (Array.isArray(errors)) {
        return { content: `Statuspage API error: ${errors.join('; ')}`, isError: true };
      }
      if (typeof errors === 'string') {
        return { content: `Statuspage API error: ${errors}`, isError: true };
      }
      return { content: `Statuspage API error: ${data.message || err.message}`, isError: true };
    }
    return { content: `Statuspage API error: ${err.message}`, isError: true };
  }
  return { content: `Statuspage API error: ${String(err)}`, isError: true };
}

/** Format a Statuspage incident for display */
function formatIncident(inc: any): string {
  const name = inc.name || '(untitled)';
  const status = inc.status || 'unknown';
  const impact = inc.impact || 'none';
  const created = inc.created_at ? inc.created_at.slice(0, 16) : '';
  const resolved = inc.resolved_at ? ` -- resolved: ${inc.resolved_at.slice(0, 16)}` : '';
  return `${name} (ID: ${inc.id}) -- ${status} (impact: ${impact}) -- ${created}${resolved}`;
}

/** Format a Statuspage component for display */
function formatComponent(comp: any): string {
  const name = comp.name || '(unnamed)';
  const status = comp.status || 'unknown';
  const group = comp.group_id ? ` [group: ${comp.group_id}]` : '';
  const desc = comp.description ? ` -- ${comp.description}` : '';
  return `${name} (ID: ${comp.id}) -- ${status}${group}${desc}`;
}

// ─── Tool: statuspage_list_incidents ────────────────────

const listIncidents: ToolHandler = {
  description:
    'List incidents from the Statuspage. Returns incident names, statuses, and impact levels.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Max incidents to return (default 25, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
      status: {
        type: 'string',
        enum: ['investigating', 'identified', 'monitoring', 'resolved', 'postmortem'],
        description: 'Filter by incident status',
      },
      unresolved_only: {
        type: 'boolean',
        description: 'Only return unresolved incidents (default: false)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const pid = pageId(ctx);
      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
        page: String(params.page ?? 1),
      };

      const endpoint = params.unresolved_only
        ? `/pages/${pid}/incidents/unresolved`
        : `/pages/${pid}/incidents`;

      const result = await ctx.apiExecutor.get(endpoint, query);

      const incidents: any[] = Array.isArray(result) ? result : [];
      if (incidents.length === 0) {
        return { content: 'No incidents found.', metadata: { incidentCount: 0 } };
      }

      // If status filter is specified, filter client-side
      let filtered = incidents;
      if (params.status) {
        filtered = incidents.filter((i: any) => i.status === params.status);
      }

      if (filtered.length === 0) {
        return { content: `No incidents found with status "${params.status}".`, metadata: { incidentCount: 0 } };
      }

      const lines = filtered.map((i: any) => formatIncident(i));
      return {
        content: `${filtered.length} incident(s):\n${lines.join('\n')}`,
        metadata: { incidentCount: filtered.length },
      };
    } catch (err) {
      return statuspageError(err);
    }
  },
};

// ─── Tool: statuspage_create_incident ───────────────────

const createIncident: ToolHandler = {
  description:
    'Create a new incident on the Statuspage. Provide a name, status, and optional impact and component IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Incident name / title',
      },
      status: {
        type: 'string',
        enum: ['investigating', 'identified', 'monitoring', 'resolved'],
        description: 'Initial incident status (default: "investigating")',
      },
      impact_override: {
        type: 'string',
        enum: ['none', 'minor', 'major', 'critical'],
        description: 'Override the calculated impact level',
      },
      body: {
        type: 'string',
        description: 'Incident update body text (appears as the initial update message)',
      },
      component_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Component IDs affected by this incident',
      },
      deliver_notifications: {
        type: 'boolean',
        description: 'Whether to send notifications to subscribers (default: true)',
      },
    },
    required: ['name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const pid = pageId(ctx);
      const incident: Record<string, any> = {
        name: params.name,
        status: params.status || 'investigating',
        deliver_notifications: params.deliver_notifications ?? true,
      };
      if (params.impact_override) incident.impact_override = params.impact_override;
      if (params.body) incident.body = params.body;
      if (params.component_ids?.length) incident.component_ids = params.component_ids;

      const result = await ctx.apiExecutor.post(`/pages/${pid}/incidents`, { incident });

      return {
        content: `Incident created: "${result.name}" (ID: ${result.id}) -- ${result.status} (impact: ${result.impact || 'none'})`,
        metadata: {
          incidentId: result.id,
          name: result.name,
          status: result.status,
          impact: result.impact,
        },
      };
    } catch (err) {
      return statuspageError(err);
    }
  },
};

// ─── Tool: statuspage_update_incident ───────────────────

const updateIncident: ToolHandler = {
  description:
    'Update an existing Statuspage incident. Can change status, add an update message, or modify impact.',
  inputSchema: {
    type: 'object',
    properties: {
      incident_id: {
        type: 'string',
        description: 'The incident ID to update',
      },
      status: {
        type: 'string',
        enum: ['investigating', 'identified', 'monitoring', 'resolved', 'postmortem'],
        description: 'New incident status',
      },
      body: {
        type: 'string',
        description: 'Update message body',
      },
      impact_override: {
        type: 'string',
        enum: ['none', 'minor', 'major', 'critical'],
        description: 'Override the impact level',
      },
      deliver_notifications: {
        type: 'boolean',
        description: 'Whether to send notifications for this update (default: true)',
      },
    },
    required: ['incident_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const pid = pageId(ctx);
      const incident: Record<string, any> = {};
      if (params.status) incident.status = params.status;
      if (params.body) incident.body = params.body;
      if (params.impact_override) incident.impact_override = params.impact_override;
      if (params.deliver_notifications !== undefined) {
        incident.deliver_notifications = params.deliver_notifications;
      }

      const result = await ctx.apiExecutor.patch(
        `/pages/${pid}/incidents/${params.incident_id}`,
        { incident },
      );

      return {
        content: `Incident "${result.name}" (${result.id}) updated -- status: ${result.status}${params.body ? ' (update posted)' : ''}`,
        metadata: {
          incidentId: result.id,
          name: result.name,
          status: result.status,
        },
      };
    } catch (err) {
      return statuspageError(err);
    }
  },
};

// ─── Tool: statuspage_list_components ───────────────────

const listComponents: ToolHandler = {
  description:
    'List components on the Statuspage. Returns component names, statuses, and descriptions.',
  inputSchema: {
    type: 'object',
    properties: {
      page_number: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 100)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const pid = pageId(ctx);
      const query: Record<string, string> = {
        page: String(params.page_number ?? 1),
        per_page: String(params.per_page ?? 100),
      };

      const result = await ctx.apiExecutor.get(`/pages/${pid}/components`, query);

      const components: any[] = Array.isArray(result) ? result : [];
      if (components.length === 0) {
        return { content: 'No components found.', metadata: { componentCount: 0 } };
      }

      const lines = components.map((c: any) => formatComponent(c));
      return {
        content: `${components.length} component(s):\n${lines.join('\n')}`,
        metadata: { componentCount: components.length },
      };
    } catch (err) {
      return statuspageError(err);
    }
  },
};

// ─── Tool: statuspage_update_component ──────────────────

const updateComponent: ToolHandler = {
  description:
    'Update a component on the Statuspage. Typically used to change the operational status of a component.',
  inputSchema: {
    type: 'object',
    properties: {
      component_id: {
        type: 'string',
        description: 'The component ID to update',
      },
      status: {
        type: 'string',
        enum: ['operational', 'degraded_performance', 'partial_outage', 'major_outage', 'under_maintenance'],
        description: 'New component status',
      },
      description: {
        type: 'string',
        description: 'Updated component description',
      },
    },
    required: ['component_id', 'status'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const pid = pageId(ctx);
      const component: Record<string, any> = {
        status: params.status,
      };
      if (params.description) component.description = params.description;

      const result = await ctx.apiExecutor.patch(
        `/pages/${pid}/components/${params.component_id}`,
        { component },
      );

      return {
        content: `Component "${result.name}" (${result.id}) updated -- status: ${result.status}`,
        metadata: {
          componentId: result.id,
          name: result.name,
          status: result.status,
        },
      };
    } catch (err) {
      return statuspageError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const statuspageAdapter: SkillAdapter = {
  skillId: 'statuspage',
  name: 'Atlassian Statuspage',
  baseUrl: 'https://api.statuspage.io/v1',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'OAuth',
  },
  tools: {
    statuspage_list_incidents: listIncidents,
    statuspage_create_incident: createIncident,
    statuspage_update_incident: updateIncident,
    statuspage_list_components: listComponents,
    statuspage_update_component: updateComponent,
  },
  configSchema: {
    pageId: {
      type: 'string' as const,
      label: 'Page ID',
      description: 'Your Statuspage page ID (found in your Statuspage dashboard settings)',
      required: true,
    },
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
