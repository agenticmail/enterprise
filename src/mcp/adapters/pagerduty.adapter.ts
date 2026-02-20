/**
 * MCP Skill Adapter — PagerDuty
 *
 * Maps PagerDuty REST API endpoints to MCP tool handlers.
 * PagerDuty uses token-based authentication with the header format:
 * Authorization: Token token=<api_key>
 *
 * PagerDuty API docs: https://developer.pagerduty.com/api-reference/
 *
 * Tools:
 *   - pd_list_incidents         List incidents with optional filters
 *   - pd_create_incident        Create a new incident
 *   - pd_acknowledge_incident   Acknowledge an incident
 *   - pd_resolve_incident       Resolve an incident
 *   - pd_list_services          List services
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function pdError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const error = data.error;
      if (error && typeof error === 'object') {
        const details = error.errors ? ` -- ${error.errors.join('; ')}` : '';
        return { content: `PagerDuty API error [${error.code || ''}]: ${error.message || err.message}${details}`, isError: true };
      }
      return { content: `PagerDuty API error: ${data.message || err.message}`, isError: true };
    }
    return { content: `PagerDuty API error: ${err.message}`, isError: true };
  }
  return { content: `PagerDuty API error: ${String(err)}`, isError: true };
}

/** Format a PagerDuty incident for display */
function formatIncident(inc: any): string {
  const number = inc.incident_number || inc.id;
  const title = inc.title || '(no title)';
  const status = inc.status || 'unknown';
  const urgency = inc.urgency || 'N/A';
  const service = inc.service?.summary || 'unknown';
  const assignee = inc.assignments?.[0]?.assignee?.summary || 'unassigned';
  const created = inc.created_at ? inc.created_at.slice(0, 16) : '';
  return `#${number} "${title}" -- ${status} (${urgency}) -- service: ${service} -- assignee: ${assignee} -- ${created}`;
}

/** Format a PagerDuty service for display */
function formatService(svc: any): string {
  const name = svc.name || '(unnamed)';
  const status = svc.status || 'unknown';
  const policy = svc.escalation_policy?.summary || 'N/A';
  return `${name} (ID: ${svc.id}) -- ${status} -- escalation: ${policy}`;
}

// ─── Tool: pd_list_incidents ────────────────────────────

const listIncidents: ToolHandler = {
  description:
    'List incidents from PagerDuty. Optionally filter by status, urgency, or service.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Max incidents to return (default 25, max 100)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
      statuses: {
        type: 'array',
        items: { type: 'string', enum: ['triggered', 'acknowledged', 'resolved'] },
        description: 'Filter by one or more statuses',
      },
      urgencies: {
        type: 'array',
        items: { type: 'string', enum: ['high', 'low'] },
        description: 'Filter by urgency',
      },
      service_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by service IDs',
      },
      since: {
        type: 'string',
        description: 'Start date for incident range (ISO 8601)',
      },
      until: {
        type: 'string',
        description: 'End date for incident range (ISO 8601)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
        offset: String(params.offset ?? 0),
      };
      if (params.statuses?.length) query['statuses[]'] = params.statuses.join(',');
      if (params.urgencies?.length) query['urgencies[]'] = params.urgencies.join(',');
      if (params.service_ids?.length) query['service_ids[]'] = params.service_ids.join(',');
      if (params.since) query.since = params.since;
      if (params.until) query.until = params.until;

      const result = await ctx.apiExecutor.get('/incidents', query);

      const incidents: any[] = result.incidents || [];
      if (incidents.length === 0) {
        return { content: 'No incidents found.', metadata: { incidentCount: 0 } };
      }

      const lines = incidents.map((i: any) => formatIncident(i));
      const total = result.total ?? incidents.length;
      return {
        content: `${incidents.length} of ${total} incident(s):\n${lines.join('\n')}`,
        metadata: { incidentCount: incidents.length, total },
      };
    } catch (err) {
      return pdError(err);
    }
  },
};

// ─── Tool: pd_create_incident ───────────────────────────

const createIncident: ToolHandler = {
  description:
    'Create a new incident in PagerDuty. Requires a title and service ID.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Incident title',
      },
      service_id: {
        type: 'string',
        description: 'The ID of the service to create the incident on',
      },
      urgency: {
        type: 'string',
        enum: ['high', 'low'],
        description: 'Incident urgency (default: "high")',
      },
      body: {
        type: 'string',
        description: 'Detailed incident body / description',
      },
      escalation_policy_id: {
        type: 'string',
        description: 'Override the default escalation policy',
      },
      from_email: {
        type: 'string',
        description: 'Email of the user creating the incident (required by PagerDuty API)',
      },
    },
    required: ['title', 'service_id', 'from_email'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const incident: Record<string, any> = {
        type: 'incident',
        title: params.title,
        service: {
          id: params.service_id,
          type: 'service_reference',
        },
        urgency: params.urgency || 'high',
      };
      if (params.body) {
        incident.body = {
          type: 'incident_body',
          details: params.body,
        };
      }
      if (params.escalation_policy_id) {
        incident.escalation_policy = {
          id: params.escalation_policy_id,
          type: 'escalation_policy_reference',
        };
      }

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        path: '/incidents',
        headers: { 'From': params.from_email },
        body: { incident },
      });

      const inc = result.incident;
      return {
        content: `Incident created: #${inc.incident_number} "${inc.title}" -- ${inc.status} (${inc.urgency})`,
        metadata: {
          incidentId: inc.id,
          incidentNumber: inc.incident_number,
          status: inc.status,
          urgency: inc.urgency,
        },
      };
    } catch (err) {
      return pdError(err);
    }
  },
};

// ─── Tool: pd_acknowledge_incident ──────────────────────

const acknowledgeIncident: ToolHandler = {
  description:
    'Acknowledge one or more PagerDuty incidents. Changes the status from "triggered" to "acknowledged".',
  inputSchema: {
    type: 'object',
    properties: {
      incident_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of incident IDs to acknowledge',
      },
      from_email: {
        type: 'string',
        description: 'Email of the user acknowledging the incident(s)',
      },
    },
    required: ['incident_ids', 'from_email'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const incidents = params.incident_ids.map((id: string) => ({
        id,
        type: 'incident_reference',
        status: 'acknowledged',
      }));

      const result = await ctx.apiExecutor.request({
        method: 'PUT',
        path: '/incidents',
        headers: { 'From': params.from_email },
        body: { incidents },
      });

      const updated: any[] = result.incidents || [];
      const ids = updated.map((i: any) => `#${i.incident_number || i.id}`).join(', ');
      return {
        content: `${updated.length} incident(s) acknowledged: ${ids}`,
        metadata: { acknowledgedCount: updated.length },
      };
    } catch (err) {
      return pdError(err);
    }
  },
};

// ─── Tool: pd_resolve_incident ──────────────────────────

const resolveIncident: ToolHandler = {
  description:
    'Resolve one or more PagerDuty incidents. Changes the status to "resolved".',
  inputSchema: {
    type: 'object',
    properties: {
      incident_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of incident IDs to resolve',
      },
      from_email: {
        type: 'string',
        description: 'Email of the user resolving the incident(s)',
      },
      resolution: {
        type: 'string',
        description: 'Resolution note to add to the incident(s)',
      },
    },
    required: ['incident_ids', 'from_email'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const incidents = params.incident_ids.map((id: string) => ({
        id,
        type: 'incident_reference',
        status: 'resolved',
      }));

      const result = await ctx.apiExecutor.request({
        method: 'PUT',
        path: '/incidents',
        headers: { 'From': params.from_email },
        body: { incidents },
      });

      const updated: any[] = result.incidents || [];
      const ids = updated.map((i: any) => `#${i.incident_number || i.id}`).join(', ');

      // If a resolution note was provided, add it as a note to each incident
      if (params.resolution) {
        for (const inc of updated) {
          try {
            await ctx.apiExecutor.request({
              method: 'POST',
              path: `/incidents/${inc.id}/notes`,
              headers: { 'From': params.from_email },
              body: { note: { content: params.resolution } },
            });
          } catch {
            // Best effort — resolution note is optional
          }
        }
      }

      return {
        content: `${updated.length} incident(s) resolved: ${ids}`,
        metadata: { resolvedCount: updated.length },
      };
    } catch (err) {
      return pdError(err);
    }
  },
};

// ─── Tool: pd_list_services ─────────────────────────────

const listServices: ToolHandler = {
  description:
    'List services from PagerDuty. Returns service names, statuses, and escalation policies.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Max services to return (default 25, max 100)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
      query: {
        type: 'string',
        description: 'Search query to filter services by name',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 25),
        offset: String(params.offset ?? 0),
      };
      if (params.query) query.query = params.query;

      const result = await ctx.apiExecutor.get('/services', query);

      const services: any[] = result.services || [];
      if (services.length === 0) {
        return { content: 'No services found.', metadata: { serviceCount: 0 } };
      }

      const lines = services.map((s: any) => formatService(s));
      const total = result.total ?? services.length;
      return {
        content: `${services.length} of ${total} service(s):\n${lines.join('\n')}`,
        metadata: { serviceCount: services.length, total },
      };
    } catch (err) {
      return pdError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const pagerdutyAdapter: SkillAdapter = {
  skillId: 'pagerduty',
  name: 'PagerDuty',
  baseUrl: 'https://api.pagerduty.com',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'Token token=',
  },
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
  tools: {
    pd_list_incidents: listIncidents,
    pd_create_incident: createIncident,
    pd_acknowledge_incident: acknowledgeIncident,
    pd_resolve_incident: resolveIncident,
    pd_list_services: listServices,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
