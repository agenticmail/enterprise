/**
 * MCP Skill Adapter — LinkedIn
 *
 * Maps LinkedIn REST API v2 endpoints to MCP tool handlers.
 * Handles profile lookup, post creation, connections, people search, and company data.
 *
 * LinkedIn API docs: https://learn.microsoft.com/en-us/linkedin/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function linkedinError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // LinkedIn returns { message, serviceErrorCode, status }
      const msg = data.message || data.error_description || err.message;
      const code = data.serviceErrorCode || data.status || '';
      const codePart = code ? ` [${code}]` : '';
      return { content: `LinkedIn API error${codePart}: ${msg}`, isError: true };
    }
    return { content: `LinkedIn API error: ${err.message}`, isError: true };
  }
  return { content: `LinkedIn API error: ${String(err)}`, isError: true };
}

// ─── Tool: linkedin_get_profile ─────────────────────────

const getProfile: ToolHandler = {
  description:
    'Get the authenticated LinkedIn user\'s profile or another user\'s profile by URN. Returns name, headline, industry, and location.',
  inputSchema: {
    type: 'object',
    properties: {
      person_urn: {
        type: 'string',
        description: 'LinkedIn person URN (e.g. "urn:li:person:ABC123"). Omit to get the authenticated user\'s profile.',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      let result: any;
      if (params.person_urn) {
        const encodedUrn = encodeURIComponent(params.person_urn);
        result = await ctx.apiExecutor.get(`/people/${encodedUrn}`, {
          projection: '(id,firstName,lastName,headline,industryName,locationName,profilePicture)',
        });
      } else {
        result = await ctx.apiExecutor.get('/me', {
          projection: '(id,firstName,lastName,headline,industryName,locationName,profilePicture)',
        });
      }

      const firstName = result.firstName?.localized?.en_US || result.localizedFirstName || '';
      const lastName = result.lastName?.localized?.en_US || result.localizedLastName || '';
      const headline = result.headline?.localized?.en_US || result.localizedHeadline || 'N/A';

      const details = [
        `Name: ${firstName} ${lastName}`,
        `Headline: ${headline}`,
        `Industry: ${result.industryName || 'N/A'}`,
        `Location: ${result.locationName || 'N/A'}`,
        `ID: ${result.id}`,
      ].join('\n');

      return {
        content: `LinkedIn Profile:\n${details}`,
        metadata: { id: result.id, name: `${firstName} ${lastName}` },
      };
    } catch (err) {
      return linkedinError(err);
    }
  },
};

// ─── Tool: linkedin_create_post ─────────────────────────

const createPost: ToolHandler = {
  description:
    'Create a new post on LinkedIn on behalf of the authenticated user. Supports text content and visibility settings.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text content of the LinkedIn post',
      },
      visibility: {
        type: 'string',
        enum: ['PUBLIC', 'CONNECTIONS'],
        description: 'Post visibility: "PUBLIC" (anyone) or "CONNECTIONS" (connections only). Default: "PUBLIC".',
      },
      author_urn: {
        type: 'string',
        description: 'Author URN (e.g. "urn:li:person:ABC123"). Required — typically the authenticated user\'s URN.',
      },
    },
    required: ['text', 'author_urn'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body = {
        author: params.author_urn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: params.text,
            },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': params.visibility || 'PUBLIC',
        },
      };

      const result = await ctx.apiExecutor.post('/ugcPosts', body);

      const postId = result.id || result['X-RestLi-Id'] || 'unknown';
      return {
        content: `LinkedIn post created successfully (ID: ${postId})\nText: ${params.text.substring(0, 100)}${params.text.length > 100 ? '...' : ''}`,
        metadata: {
          postId,
          author: params.author_urn,
          visibility: params.visibility || 'PUBLIC',
        },
      };
    } catch (err) {
      return linkedinError(err);
    }
  },
};

// ─── Tool: linkedin_list_connections ────────────────────

const listConnections: ToolHandler = {
  description:
    'List the authenticated LinkedIn user\'s connections. Returns names and profile information.',
  inputSchema: {
    type: 'object',
    properties: {
      start: {
        type: 'number',
        description: 'Pagination start index (default 0)',
      },
      count: {
        type: 'number',
        description: 'Number of connections to return (default 50, max 500)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        start: String(params.start ?? 0),
        count: String(params.count ?? 50),
        q: 'viewer',
      };

      const result = await ctx.apiExecutor.get('/connections', query);

      const connections: any[] = result.elements || [];
      const total = result.paging?.total ?? connections.length;

      if (connections.length === 0) {
        return { content: 'No connections found.' };
      }

      const lines = connections.map((c: any) => {
        const firstName = c.firstName?.localized?.en_US || c.localizedFirstName || '';
        const lastName = c.lastName?.localized?.en_US || c.localizedLastName || '';
        const headline = c.headline?.localized?.en_US || c.localizedHeadline || '';
        const headlinePart = headline ? ` -- ${headline}` : '';
        return `${firstName} ${lastName}${headlinePart} (ID: ${c.id || 'N/A'})`;
      });

      return {
        content: `${total} total connections (showing ${connections.length}):\n${lines.join('\n')}`,
        metadata: { count: connections.length, total },
      };
    } catch (err) {
      return linkedinError(err);
    }
  },
};

// ─── Tool: linkedin_search_people ───────────────────────

const searchPeople: ToolHandler = {
  description:
    'Search for people on LinkedIn by keyword. Returns matching profiles with names, headlines, and locations.',
  inputSchema: {
    type: 'object',
    properties: {
      keywords: {
        type: 'string',
        description: 'Search keywords (e.g. "software engineer San Francisco")',
      },
      start: {
        type: 'number',
        description: 'Pagination start index (default 0)',
      },
      count: {
        type: 'number',
        description: 'Number of results to return (default 25, max 50)',
      },
    },
    required: ['keywords'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        keywords: params.keywords,
        start: String(params.start ?? 0),
        count: String(params.count ?? 25),
      };

      const result = await ctx.apiExecutor.get('/search/people', query);

      const people: any[] = result.elements || [];
      const total = result.paging?.total ?? people.length;

      if (people.length === 0) {
        return { content: `No people found matching "${params.keywords}".` };
      }

      const lines = people.map((p: any) => {
        const name = p.title?.text || p.name || '(unknown)';
        const headline = p.headline?.text || p.headline || '';
        const location = p.subline?.text || p.location || '';
        const headlinePart = headline ? ` -- ${headline}` : '';
        const locationPart = location ? ` (${location})` : '';
        return `${name}${headlinePart}${locationPart}`;
      });

      return {
        content: `Found ${total} people matching "${params.keywords}" (showing ${people.length}):\n${lines.join('\n')}`,
        metadata: { count: people.length, total, keywords: params.keywords },
      };
    } catch (err) {
      return linkedinError(err);
    }
  },
};

// ─── Tool: linkedin_get_company ─────────────────────────

const getCompany: ToolHandler = {
  description:
    'Get a LinkedIn company page by its organization ID. Returns company name, description, industry, employee count, and website.',
  inputSchema: {
    type: 'object',
    properties: {
      organization_id: {
        type: 'string',
        description: 'LinkedIn organization ID (numeric, e.g. "1234567")',
      },
    },
    required: ['organization_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(
        `/organizations/${params.organization_id}`,
        {
          projection: '(id,name,localizedName,vanityName,description,localizedDescription,industries,staffCountRange,websiteUrl,logoV2,locations)',
        },
      );

      const name = result.localizedName || result.name || '(unnamed)';
      const description = result.localizedDescription || result.description || 'N/A';
      const industry = Array.isArray(result.industries) ? result.industries.join(', ') : 'N/A';
      const staffRange = result.staffCountRange
        ? `${result.staffCountRange.start ?? '?'}-${result.staffCountRange.end ?? '?'}`
        : 'N/A';

      const details = [
        `Company: ${name}`,
        `Vanity Name: ${result.vanityName || 'N/A'}`,
        `Description: ${description.substring(0, 200)}${description.length > 200 ? '...' : ''}`,
        `Industry: ${industry}`,
        `Employees: ${staffRange}`,
        `Website: ${result.websiteUrl || 'N/A'}`,
        `ID: ${result.id || params.organization_id}`,
      ].join('\n');

      return {
        content: `LinkedIn Company:\n${details}`,
        metadata: {
          organizationId: params.organization_id,
          name,
          vanityName: result.vanityName,
        },
      };
    } catch (err) {
      return linkedinError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const linkedinAdapter: SkillAdapter = {
  skillId: 'linkedin',
  name: 'LinkedIn',
  baseUrl: 'https://api.linkedin.com/v2',
  auth: {
    type: 'oauth2',
    provider: 'linkedin',
  },
  defaultHeaders: {
    'X-Restli-Protocol-Version': '2.0.0',
  },
  tools: {
    linkedin_get_profile: getProfile,
    linkedin_create_post: createPost,
    linkedin_list_connections: listConnections,
    linkedin_search_people: searchPeople,
    linkedin_get_company: getCompany,
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 10 },
};
