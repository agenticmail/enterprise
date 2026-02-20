/**
 * MCP Skill Adapter — Lever Recruiting
 *
 * Maps Lever API v1 endpoints to MCP tool handlers.
 * Covers opportunities, postings, candidates, and notes.
 *
 * Lever API docs: https://hire.lever.co/developer/documentation
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function leverError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.message || data.error || err.message;
      const code = data.code ? ` [${data.code}]` : '';
      return { content: `Lever API error${code}: ${msg}`, isError: true };
    }
    return { content: `Lever API error: ${err.message}`, isError: true };
  }
  return { content: `Lever API error: ${String(err)}`, isError: true };
}

/** Format a Lever opportunity for display */
function formatOpportunity(opp: any): string {
  const name = opp.name || '(no name)';
  const stage = opp.stage?.text || opp.stage || 'N/A';
  const origin = opp.origin || 'N/A';
  const created = opp.createdAt ? new Date(opp.createdAt).toISOString().slice(0, 10) : 'N/A';
  const posting = opp.applications?.[0]?.posting?.text || '';
  const postingPart = posting ? ` -- Role: ${posting}` : '';
  return `${name} -- Stage: ${stage} -- Origin: ${origin}${postingPart} -- Created: ${created} (ID: ${opp.id})`;
}

// ─── Tool: lever_list_opportunities ─────────────────────

const listOpportunities: ToolHandler = {
  description:
    'List opportunities (candidates in pipeline) from Lever. Filter by stage, posting, or archive status.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 20, max 100)',
      },
      offset: {
        type: 'string',
        description: 'Pagination offset from a previous response',
      },
      stage_id: {
        type: 'string',
        description: 'Filter by stage ID',
      },
      posting_id: {
        type: 'string',
        description: 'Filter by posting ID',
      },
      archived: {
        type: 'boolean',
        description: 'Include archived opportunities (default: false)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.offset) query.offset = params.offset;
      if (params.stage_id) query.stage_id = params.stage_id;
      if (params.posting_id) query.posting_id = params.posting_id;
      if (params.archived !== undefined) query.archived = String(params.archived);

      const result = await ctx.apiExecutor.get('/opportunities', query);

      const opportunities: any[] = result.data || [];
      if (opportunities.length === 0) {
        return { content: 'No opportunities found.' };
      }

      const lines = opportunities.map((o: any) => formatOpportunity(o));
      const hasNext = result.hasNext ?? false;

      return {
        content: `Found ${opportunities.length} opportunities:\n${lines.join('\n')}${hasNext ? '\n\n(More results available)' : ''}`,
        metadata: {
          count: opportunities.length,
          hasNext,
          next: result.next,
        },
      };
    } catch (err) {
      return leverError(err);
    }
  },
};

// ─── Tool: lever_create_opportunity ─────────────────────

const createOpportunity: ToolHandler = {
  description:
    'Create a new opportunity (candidate) in Lever. Provide candidate name, contact info, and optionally associate with a posting.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Full name of the candidate',
      },
      email: {
        type: 'string',
        description: 'Email address of the candidate',
      },
      phone: {
        type: 'string',
        description: 'Phone number (optional)',
      },
      posting_id: {
        type: 'string',
        description: 'Lever posting ID to associate with (optional)',
      },
      origin: {
        type: 'string',
        description: 'Source origin (e.g. "sourced", "applied", "referred")',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to apply to the opportunity',
      },
    },
    required: ['name'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        name: params.name,
        emails: params.email ? [params.email] : [],
      };
      if (params.phone) body.phones = [{ value: params.phone }];
      if (params.posting_id) body.postings = [params.posting_id];
      if (params.origin) body.origin = params.origin;
      if (params.tags?.length) body.tags = params.tags;

      const result = await ctx.apiExecutor.post('/opportunities', body);

      const opp = result.data || result;
      return {
        content: `Opportunity created for ${params.name} (ID: ${opp.id})${params.email ? ` -- ${params.email}` : ''}`,
        metadata: {
          opportunityId: opp.id,
          name: params.name,
          email: params.email,
        },
      };
    } catch (err) {
      return leverError(err);
    }
  },
};

// ─── Tool: lever_list_postings ──────────────────────────

const listPostings: ToolHandler = {
  description:
    'List job postings from Lever. Returns posting titles, teams, locations, and states.',
  inputSchema: {
    type: 'object',
    properties: {
      state: {
        type: 'string',
        enum: ['published', 'internal', 'closed', 'draft', 'pending'],
        description: 'Filter by posting state (default: all)',
      },
      team: {
        type: 'string',
        description: 'Filter by team name',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 20)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };
      if (params.state) query.state = params.state;
      if (params.team) query.team = params.team;

      const result = await ctx.apiExecutor.get('/postings', query);

      const postings: any[] = result.data || [];
      if (postings.length === 0) {
        return { content: 'No postings found.' };
      }

      const lines = postings.map((p: any) => {
        const title = p.text || '(untitled)';
        const team = p.categories?.team || 'N/A';
        const location = p.categories?.location || 'N/A';
        const state = p.state || 'unknown';
        return `${title} -- Team: ${team} -- Location: ${location} -- ${state} (ID: ${p.id})`;
      });

      return {
        content: `Found ${postings.length} postings:\n${lines.join('\n')}`,
        metadata: { count: postings.length },
      };
    } catch (err) {
      return leverError(err);
    }
  },
};

// ─── Tool: lever_get_candidate ──────────────────────────

const getCandidate: ToolHandler = {
  description:
    'Get detailed information about a candidate (opportunity) in Lever by their opportunity ID.',
  inputSchema: {
    type: 'object',
    properties: {
      opportunity_id: {
        type: 'string',
        description: 'The Lever opportunity ID',
      },
    },
    required: ['opportunity_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/opportunities/${params.opportunity_id}`);

      const opp = result.data || result;
      const details = [
        `Name: ${opp.name || 'N/A'}`,
        `Emails: ${opp.emails?.join(', ') || 'N/A'}`,
        `Phones: ${opp.phones?.map((p: any) => p.value).join(', ') || 'N/A'}`,
        `Stage: ${opp.stage?.text || opp.stage || 'N/A'}`,
        `Origin: ${opp.origin || 'N/A'}`,
        `Owner: ${opp.owner?.name || opp.owner || 'N/A'}`,
        `Tags: ${opp.tags?.join(', ') || 'none'}`,
        `Created: ${opp.createdAt ? new Date(opp.createdAt).toISOString().slice(0, 10) : 'N/A'}`,
        `Last Interaction: ${opp.lastInteractionAt ? new Date(opp.lastInteractionAt).toISOString().slice(0, 10) : 'N/A'}`,
        `Archived: ${opp.isArchived ?? 'N/A'}`,
      ].join('\n');

      return {
        content: `Candidate Details:\n${details}`,
        metadata: {
          opportunityId: params.opportunity_id,
          name: opp.name,
          stage: opp.stage?.text || opp.stage,
        },
      };
    } catch (err) {
      return leverError(err);
    }
  },
};

// ─── Tool: lever_add_note ───────────────────────────────

const addNote: ToolHandler = {
  description:
    'Add a note to a candidate opportunity in Lever. Notes are visible to the hiring team.',
  inputSchema: {
    type: 'object',
    properties: {
      opportunity_id: {
        type: 'string',
        description: 'The Lever opportunity ID',
      },
      value: {
        type: 'string',
        description: 'The note content (supports plain text)',
      },
      notify_followers: {
        type: 'boolean',
        description: 'Notify followers of this opportunity (default: false)',
      },
    },
    required: ['opportunity_id', 'value'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        value: params.value,
      };
      if (params.notify_followers !== undefined) {
        body.notifyFollowers = params.notify_followers;
      }

      const result = await ctx.apiExecutor.post(
        `/opportunities/${params.opportunity_id}/notes`,
        body,
      );

      const note = result.data || result;
      return {
        content: `Note added to opportunity ${params.opportunity_id} (Note ID: ${note.id || 'N/A'})`,
        metadata: {
          opportunityId: params.opportunity_id,
          noteId: note.id,
        },
      };
    } catch (err) {
      return leverError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const leverAdapter: SkillAdapter = {
  skillId: 'lever',
  name: 'Lever Recruiting',
  baseUrl: 'https://api.lever.co/v1',
  auth: {
    type: 'oauth2',
    provider: 'lever',
    headerPrefix: 'Bearer',
  },
  tools: {
    lever_list_opportunities: listOpportunities,
    lever_create_opportunity: createOpportunity,
    lever_list_postings: listPostings,
    lever_get_candidate: getCandidate,
    lever_add_note: addNote,
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },
};
