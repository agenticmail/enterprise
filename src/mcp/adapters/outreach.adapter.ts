/**
 * MCP Skill Adapter — Outreach
 *
 * Maps Outreach Sales Engagement API v2 endpoints to MCP tool handlers.
 * Outreach uses JSON:API format for requests and responses.
 *
 * Outreach API docs: https://api.outreach.io/api/v2/docs
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function outreachError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      if (Array.isArray(data.errors)) {
        const details = data.errors.map((e: any) => `${e.title || 'Error'}: ${e.detail || e.message || ''}`).join('; ');
        return { content: `Outreach API error: ${details}`, isError: true };
      }
      return { content: `Outreach API error: ${data.message || err.message}`, isError: true };
    }
    return { content: `Outreach API error: ${err.message}`, isError: true };
  }
  return { content: `Outreach API error: ${String(err)}`, isError: true };
}

/** Format an Outreach prospect for display */
function formatProspect(item: any): string {
  const attrs = item.attributes || {};
  const name = [attrs.firstName, attrs.lastName].filter(Boolean).join(' ') || '(no name)';
  const email = attrs.emailAddresses?.[0] || attrs.emails?.[0] || '(no email)';
  const title = attrs.title || '';
  const company = attrs.company || '';
  const titlePart = title ? `, ${title}` : '';
  const companyPart = company ? ` @ ${company}` : '';
  return `${name} <${email}>${titlePart}${companyPart} (ID: ${item.id})`;
}

/** Format an Outreach sequence for display */
function formatSequence(item: any): string {
  const attrs = item.attributes || {};
  const name = attrs.name || '(unnamed)';
  const enabled = attrs.enabled ? 'enabled' : 'disabled';
  const sequenceType = attrs.sequenceType || 'unknown';
  const stepCount = attrs.sequenceStepCount || 0;
  return `${name} -- ${enabled} -- type: ${sequenceType} -- ${stepCount} steps (ID: ${item.id})`;
}

/** Format an Outreach mailing for display */
function formatMailing(item: any): string {
  const attrs = item.attributes || {};
  const subject = attrs.subject || '(no subject)';
  const state = attrs.state || 'unknown';
  const openCount = attrs.openCount || 0;
  const clickCount = attrs.clickCount || 0;
  const delivered = attrs.deliveredAt ? attrs.deliveredAt.slice(0, 16) : 'not delivered';
  return `"${subject}" -- ${state} -- opens: ${openCount}, clicks: ${clickCount} -- ${delivered} (ID: ${item.id})`;
}

// ─── Tool: outreach_list_prospects ──────────────────────

const listProspects: ToolHandler = {
  description:
    'List prospects from Outreach. Returns prospect names, emails, titles, and companies.',
  inputSchema: {
    type: 'object',
    properties: {
      page_size: {
        type: 'number',
        description: 'Number of prospects per page (default 25, max 50)',
      },
      page_after: {
        type: 'string',
        description: 'Pagination cursor from a previous response',
      },
      sort: {
        type: 'string',
        description: 'Sort field (e.g. "createdAt", "-updatedAt")',
      },
      filter_email: {
        type: 'string',
        description: 'Filter prospects by email address',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        'page[size]': String(params.page_size ?? 25),
      };
      if (params.page_after) query['page[after]'] = params.page_after;
      if (params.sort) query.sort = params.sort;
      if (params.filter_email) query['filter[emails]'] = params.filter_email;

      const result = await ctx.apiExecutor.get('/prospects', query);

      const prospects: any[] = result.data || [];
      if (prospects.length === 0) {
        return { content: 'No prospects found.' };
      }

      const lines = prospects.map((p: any) => formatProspect(p));
      const nextCursor = result.links?.next;

      return {
        content: `Found ${prospects.length} prospects:\n${lines.join('\n')}${nextCursor ? '\n\n(More available)' : ''}`,
        metadata: { count: prospects.length, hasMore: !!nextCursor },
      };
    } catch (err) {
      return outreachError(err);
    }
  },
};

// ─── Tool: outreach_create_prospect ─────────────────────

const createProspect: ToolHandler = {
  description:
    'Create a new prospect in Outreach. Provide at least an email address.',
  inputSchema: {
    type: 'object',
    properties: {
      emails: {
        type: 'array',
        items: { type: 'string' },
        description: 'Email addresses for the prospect',
      },
      firstName: {
        type: 'string',
        description: 'First name',
      },
      lastName: {
        type: 'string',
        description: 'Last name',
      },
      title: {
        type: 'string',
        description: 'Job title',
      },
      company: {
        type: 'string',
        description: 'Company name',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to apply to the prospect',
      },
    },
    required: ['emails'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const attributes: Record<string, any> = {
        emails: params.emails,
      };
      if (params.firstName) attributes.firstName = params.firstName;
      if (params.lastName) attributes.lastName = params.lastName;
      if (params.title) attributes.title = params.title;
      if (params.company) attributes.company = params.company;
      if (params.tags?.length) attributes.tags = params.tags;

      const result = await ctx.apiExecutor.post('/prospects', {
        data: {
          type: 'prospect',
          attributes,
        },
      });

      const prospect = result.data;
      return {
        content: `Prospect created: ${formatProspect(prospect)}`,
        metadata: {
          prospectId: prospect.id,
          email: prospect.attributes?.emails?.[0],
        },
      };
    } catch (err) {
      return outreachError(err);
    }
  },
};

// ─── Tool: outreach_list_sequences ──────────────────────

const listSequences: ToolHandler = {
  description:
    'List email sequences from Outreach. Returns sequence names, states, and step counts.',
  inputSchema: {
    type: 'object',
    properties: {
      page_size: {
        type: 'number',
        description: 'Results per page (default 25, max 50)',
      },
      page_after: {
        type: 'string',
        description: 'Pagination cursor',
      },
      filter_enabled: {
        type: 'boolean',
        description: 'Filter by enabled state',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        'page[size]': String(params.page_size ?? 25),
      };
      if (params.page_after) query['page[after]'] = params.page_after;
      if (params.filter_enabled !== undefined) query['filter[enabled]'] = String(params.filter_enabled);

      const result = await ctx.apiExecutor.get('/sequences', query);

      const sequences: any[] = result.data || [];
      if (sequences.length === 0) {
        return { content: 'No sequences found.' };
      }

      const lines = sequences.map((s: any) => formatSequence(s));
      return {
        content: `Found ${sequences.length} sequences:\n${lines.join('\n')}`,
        metadata: { count: sequences.length },
      };
    } catch (err) {
      return outreachError(err);
    }
  },
};

// ─── Tool: outreach_add_to_sequence ─────────────────────

const addToSequence: ToolHandler = {
  description:
    'Add a prospect to an Outreach sequence. Creates a sequence state linking the prospect to the sequence.',
  inputSchema: {
    type: 'object',
    properties: {
      prospect_id: {
        type: 'number',
        description: 'The prospect ID to add to the sequence',
      },
      sequence_id: {
        type: 'number',
        description: 'The sequence ID to add the prospect to',
      },
      mailbox_id: {
        type: 'number',
        description: 'The mailbox ID to use for sending (optional)',
      },
    },
    required: ['prospect_id', 'sequence_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const relationships: Record<string, any> = {
        prospect: { data: { type: 'prospect', id: params.prospect_id } },
        sequence: { data: { type: 'sequence', id: params.sequence_id } },
      };
      if (params.mailbox_id) {
        relationships.mailbox = { data: { type: 'mailbox', id: params.mailbox_id } };
      }

      const result = await ctx.apiExecutor.post('/sequenceStates', {
        data: {
          type: 'sequenceState',
          relationships,
        },
      });

      const state = result.data;
      return {
        content: `Prospect ${params.prospect_id} added to sequence ${params.sequence_id} (state ID: ${state.id})`,
        metadata: {
          sequenceStateId: state.id,
          prospectId: params.prospect_id,
          sequenceId: params.sequence_id,
        },
      };
    } catch (err) {
      return outreachError(err);
    }
  },
};

// ─── Tool: outreach_list_mailings ───────────────────────

const listMailings: ToolHandler = {
  description:
    'List mailings (sent emails) from Outreach. Returns email subjects, states, and engagement metrics.',
  inputSchema: {
    type: 'object',
    properties: {
      page_size: {
        type: 'number',
        description: 'Results per page (default 25, max 50)',
      },
      page_after: {
        type: 'string',
        description: 'Pagination cursor',
      },
      filter_prospect_id: {
        type: 'number',
        description: 'Filter mailings by prospect ID',
      },
      filter_sequence_id: {
        type: 'number',
        description: 'Filter mailings by sequence ID',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        'page[size]': String(params.page_size ?? 25),
      };
      if (params.page_after) query['page[after]'] = params.page_after;
      if (params.filter_prospect_id) query['filter[prospect][id]'] = String(params.filter_prospect_id);
      if (params.filter_sequence_id) query['filter[sequence][id]'] = String(params.filter_sequence_id);

      const result = await ctx.apiExecutor.get('/mailings', query);

      const mailings: any[] = result.data || [];
      if (mailings.length === 0) {
        return { content: 'No mailings found.' };
      }

      const lines = mailings.map((m: any) => formatMailing(m));
      return {
        content: `Found ${mailings.length} mailings:\n${lines.join('\n')}`,
        metadata: { count: mailings.length },
      };
    } catch (err) {
      return outreachError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const outreachAdapter: SkillAdapter = {
  skillId: 'outreach',
  name: 'Outreach Sales Engagement',
  baseUrl: 'https://api.outreach.io/api/v2',
  auth: {
    type: 'oauth2',
    provider: 'outreach',
  },
  defaultHeaders: {
    'Content-Type': 'application/vnd.api+json',
    'Accept': 'application/vnd.api+json',
  },
  tools: {
    outreach_list_prospects: listProspects,
    outreach_create_prospect: createProspect,
    outreach_list_sequences: listSequences,
    outreach_add_to_sequence: addToSequence,
    outreach_list_mailings: listMailings,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
