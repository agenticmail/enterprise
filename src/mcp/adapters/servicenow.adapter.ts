/**
 * MCP Skill Adapter — ServiceNow
 *
 * Maps ServiceNow REST API endpoints to MCP tool handlers.
 * ServiceNow uses a dynamic instance URL: https://{instance}.service-now.com/api
 *
 * The instance name is read from ctx.skillConfig.instance.
 *
 * ServiceNow API docs: https://developer.servicenow.com/dev.do#!/reference/api/
 *
 * Tools:
 *   - snow_list_incidents     List incidents with optional filters
 *   - snow_create_incident    Create a new incident
 *   - snow_update_incident    Update an existing incident
 *   - snow_list_changes       List change requests
 *   - snow_search             Search records using encoded queries
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the ServiceNow instance base URL from skill config */
function snowUrl(ctx: ToolExecutionContext): string {
  const instance = ctx.skillConfig.instance;
  if (!instance) {
    throw new Error('ServiceNow instance name is required in skillConfig (e.g. { instance: "mycompany" })');
  }
  return `https://${instance}.service-now.com/api/now`;
}

function snowError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const error = data.error;
      if (error && typeof error === 'object') {
        return { content: `ServiceNow API error [${error.message || ''}]: ${error.detail || err.message}`, isError: true };
      }
      return { content: `ServiceNow API error: ${data.message || err.message}`, isError: true };
    }
    return { content: `ServiceNow API error: ${err.message}`, isError: true };
  }
  return { content: `ServiceNow API error: ${String(err)}`, isError: true };
}

/** Format a ServiceNow incident for display */
function formatIncident(inc: any): string {
  const number = inc.number || inc.sys_id;
  const shortDesc = inc.short_description || '(no description)';
  const state = inc.state || 'unknown';
  const priority = inc.priority || 'N/A';
  const assignedTo = inc.assigned_to?.display_value || inc.assigned_to || 'unassigned';
  const opened = inc.opened_at ? inc.opened_at.slice(0, 16) : '';
  return `${number} -- ${shortDesc} -- state: ${state}, priority: ${priority} -- assigned: ${assignedTo} -- ${opened}`;
}

/** Format a ServiceNow change request for display */
function formatChange(change: any): string {
  const number = change.number || change.sys_id;
  const shortDesc = change.short_description || '(no description)';
  const state = change.state || 'unknown';
  const type = change.type || 'N/A';
  const risk = change.risk || 'N/A';
  const assignedTo = change.assigned_to?.display_value || change.assigned_to || 'unassigned';
  return `${number} -- ${shortDesc} -- state: ${state}, type: ${type}, risk: ${risk} -- assigned: ${assignedTo}`;
}

// ─── Tool: snow_list_incidents ──────────────────────────

const listIncidents: ToolHandler = {
  description:
    'List incidents from ServiceNow. Optionally filter by state, priority, or assignment group.',
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
      state: {
        type: 'string',
        enum: ['1', '2', '3', '4', '5', '6', '7'],
        description: 'Filter by state: 1=New, 2=In Progress, 3=On Hold, 4=Resolved, 5=Closed, 6=Canceled, 7=Awaiting',
      },
      priority: {
        type: 'string',
        enum: ['1', '2', '3', '4', '5'],
        description: 'Filter by priority: 1=Critical, 2=High, 3=Moderate, 4=Low, 5=Planning',
      },
      assignment_group: {
        type: 'string',
        description: 'Filter by assignment group sys_id',
      },
      sysparm_query: {
        type: 'string',
        description: 'Encoded query string for advanced filtering',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = snowUrl(ctx);
      const query: Record<string, string> = {
        sysparm_limit: String(params.limit ?? 25),
        sysparm_offset: String(params.offset ?? 0),
        sysparm_display_value: 'true',
      };

      const queryParts: string[] = [];
      if (params.state) queryParts.push(`state=${params.state}`);
      if (params.priority) queryParts.push(`priority=${params.priority}`);
      if (params.assignment_group) queryParts.push(`assignment_group=${params.assignment_group}`);
      if (params.sysparm_query) queryParts.push(params.sysparm_query);
      if (queryParts.length > 0) {
        query.sysparm_query = queryParts.join('^');
      }

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/table/incident`,
        query,
      });

      const incidents: any[] = result.result || [];
      if (incidents.length === 0) {
        return { content: 'No incidents found.', metadata: { incidentCount: 0 } };
      }

      const lines = incidents.map((i: any) => formatIncident(i));
      return {
        content: `${incidents.length} incident(s):\n${lines.join('\n')}`,
        metadata: { incidentCount: incidents.length },
      };
    } catch (err) {
      return snowError(err);
    }
  },
};

// ─── Tool: snow_create_incident ─────────────────────────

const createIncident: ToolHandler = {
  description:
    'Create a new incident in ServiceNow. Provide a short description and optional details.',
  inputSchema: {
    type: 'object',
    properties: {
      short_description: {
        type: 'string',
        description: 'Short description of the incident',
      },
      description: {
        type: 'string',
        description: 'Detailed description of the incident',
      },
      urgency: {
        type: 'string',
        enum: ['1', '2', '3'],
        description: 'Urgency: 1=High, 2=Medium, 3=Low (default: "2")',
      },
      impact: {
        type: 'string',
        enum: ['1', '2', '3'],
        description: 'Impact: 1=High, 2=Medium, 3=Low (default: "2")',
      },
      category: {
        type: 'string',
        description: 'Incident category',
      },
      assignment_group: {
        type: 'string',
        description: 'Assignment group sys_id',
      },
      caller_id: {
        type: 'string',
        description: 'Caller user sys_id',
      },
    },
    required: ['short_description'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = snowUrl(ctx);
      const body: Record<string, any> = {
        short_description: params.short_description,
        urgency: params.urgency || '2',
        impact: params.impact || '2',
      };
      if (params.description) body.description = params.description;
      if (params.category) body.category = params.category;
      if (params.assignment_group) body.assignment_group = params.assignment_group;
      if (params.caller_id) body.caller_id = params.caller_id;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/table/incident`,
        body,
      });

      const inc = result.result;
      return {
        content: `Incident created: ${inc.number || inc.sys_id} -- "${inc.short_description}" -- state: ${inc.state}`,
        metadata: {
          sysId: inc.sys_id,
          number: inc.number,
          state: inc.state,
        },
      };
    } catch (err) {
      return snowError(err);
    }
  },
};

// ─── Tool: snow_update_incident ─────────────────────────

const updateIncident: ToolHandler = {
  description:
    'Update an existing ServiceNow incident. Can change state, priority, assignment, or add work notes.',
  inputSchema: {
    type: 'object',
    properties: {
      sys_id: {
        type: 'string',
        description: 'The incident sys_id to update',
      },
      state: {
        type: 'string',
        enum: ['1', '2', '3', '4', '5', '6', '7'],
        description: 'New state: 1=New, 2=In Progress, 3=On Hold, 4=Resolved, 5=Closed, 6=Canceled, 7=Awaiting',
      },
      assigned_to: {
        type: 'string',
        description: 'Assign to a user by sys_id',
      },
      work_notes: {
        type: 'string',
        description: 'Internal work notes to add',
      },
      comments: {
        type: 'string',
        description: 'Customer-visible comments to add',
      },
      close_code: {
        type: 'string',
        description: 'Close code (required when resolving)',
      },
      close_notes: {
        type: 'string',
        description: 'Close notes (required when resolving)',
      },
    },
    required: ['sys_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = snowUrl(ctx);
      const body: Record<string, any> = {};
      if (params.state) body.state = params.state;
      if (params.assigned_to) body.assigned_to = params.assigned_to;
      if (params.work_notes) body.work_notes = params.work_notes;
      if (params.comments) body.comments = params.comments;
      if (params.close_code) body.close_code = params.close_code;
      if (params.close_notes) body.close_notes = params.close_notes;

      const result = await ctx.apiExecutor.request({
        method: 'PATCH',
        url: `${baseUrl}/table/incident/${params.sys_id}`,
        body,
      });

      const inc = result.result;
      return {
        content: `Incident ${inc.number || params.sys_id} updated -- state: ${inc.state}${params.work_notes ? ' (work notes added)' : ''}`,
        metadata: {
          sysId: inc.sys_id,
          number: inc.number,
          state: inc.state,
        },
      };
    } catch (err) {
      return snowError(err);
    }
  },
};

// ─── Tool: snow_list_changes ────────────────────────────

const listChanges: ToolHandler = {
  description:
    'List change requests from ServiceNow. Optionally filter by state, type, or risk.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Max change requests to return (default 25, max 100)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
      state: {
        type: 'string',
        description: 'Filter by change state (e.g. "-5" for New, "-1" for Open)',
      },
      type: {
        type: 'string',
        enum: ['standard', 'normal', 'emergency'],
        description: 'Filter by change type',
      },
      sysparm_query: {
        type: 'string',
        description: 'Encoded query string for advanced filtering',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = snowUrl(ctx);
      const query: Record<string, string> = {
        sysparm_limit: String(params.limit ?? 25),
        sysparm_offset: String(params.offset ?? 0),
        sysparm_display_value: 'true',
      };

      const queryParts: string[] = [];
      if (params.state) queryParts.push(`state=${params.state}`);
      if (params.type) queryParts.push(`type=${params.type}`);
      if (params.sysparm_query) queryParts.push(params.sysparm_query);
      if (queryParts.length > 0) {
        query.sysparm_query = queryParts.join('^');
      }

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/table/change_request`,
        query,
      });

      const changes: any[] = result.result || [];
      if (changes.length === 0) {
        return { content: 'No change requests found.', metadata: { changeCount: 0 } };
      }

      const lines = changes.map((c: any) => formatChange(c));
      return {
        content: `${changes.length} change request(s):\n${lines.join('\n')}`,
        metadata: { changeCount: changes.length },
      };
    } catch (err) {
      return snowError(err);
    }
  },
};

// ─── Tool: snow_search ──────────────────────────────────

const search: ToolHandler = {
  description:
    'Search records across ServiceNow tables using encoded queries. Useful for finding records by keyword or advanced criteria.',
  inputSchema: {
    type: 'object',
    properties: {
      table: {
        type: 'string',
        description: 'The ServiceNow table to search (e.g. "incident", "change_request", "sys_user", "cmdb_ci")',
      },
      query: {
        type: 'string',
        description: 'Encoded query string (e.g. "short_descriptionLIKEnetwork^priority=1")',
      },
      fields: {
        type: 'string',
        description: 'Comma-separated list of fields to return (e.g. "number,short_description,state")',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 25, max 100)',
      },
    },
    required: ['table', 'query'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = snowUrl(ctx);
      const query: Record<string, string> = {
        sysparm_query: params.query,
        sysparm_limit: String(params.limit ?? 25),
        sysparm_display_value: 'true',
      };
      if (params.fields) query.sysparm_fields = params.fields;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/table/${params.table}`,
        query,
      });

      const records: any[] = result.result || [];
      if (records.length === 0) {
        return { content: `No records found in "${params.table}" matching query.`, metadata: { recordCount: 0 } };
      }

      const lines = records.map((r: any) => {
        const id = r.number || r.sys_id;
        const desc = r.short_description || r.name || r.display_name || r.sys_id;
        const state = r.state ? ` -- state: ${r.state}` : '';
        return `${id} -- ${desc}${state}`;
      });

      return {
        content: `${records.length} record(s) in "${params.table}":\n${lines.join('\n')}`,
        metadata: { recordCount: records.length, table: params.table },
      };
    } catch (err) {
      return snowError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const servicenowAdapter: SkillAdapter = {
  skillId: 'servicenow',
  name: 'ServiceNow',
  // Base URL is dynamic based on instance name; tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://INSTANCE.service-now.com/api',
  auth: {
    type: 'oauth2',
    provider: 'servicenow',
  },
  tools: {
    snow_list_incidents: listIncidents,
    snow_create_incident: createIncident,
    snow_update_incident: updateIncident,
    snow_list_changes: listChanges,
    snow_search: search,
  },
  configSchema: {
    instance: {
      type: 'string' as const,
      label: 'Instance Name',
      description: 'Your ServiceNow instance name (e.g. "mycompany" for mycompany.service-now.com)',
      required: true,
      placeholder: 'mycompany',
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
