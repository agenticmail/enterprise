/**
 * MCP Skill Adapter — Mailchimp
 *
 * Maps Mailchimp Marketing API (v3.0) endpoints to MCP tool handlers.
 * API reference: https://mailchimp.com/developer/marketing/api/
 *
 * Base URL is dynamic: https://{dc}.api.mailchimp.com/3.0
 * The data center (dc) is extracted from the API key (e.g. "us21" from "xxxxxxxxxx-us21")
 * or from ctx.skillConfig.dc.
 *
 * Auth: OAuth2 (provider: mailchimp) or API key with Basic auth ("anystring:{apiKey}").
 *
 * Tools:
 *   - mailchimp_list_campaigns  List email campaigns
 *   - mailchimp_list_audiences  List audiences (lists)
 *   - mailchimp_create_campaign Create a new campaign
 *   - mailchimp_send_campaign   Send or schedule a campaign
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
  ResolvedCredentials,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function mailchimpError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const detail = data.detail || data.message || err.message;
      const title = data.title ? `${data.title}: ` : '';
      return { content: `Mailchimp API error: ${title}${detail}`, isError: true };
    }
    return { content: `Mailchimp API error: ${err.message}`, isError: true };
  }
  return { content: `Mailchimp API error: ${String(err)}`, isError: true };
}

/** Format a Mailchimp date string. */
function shortDate(dateStr: string | undefined): string {
  if (!dateStr) return 'unknown';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Format campaign status for display. */
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    save: 'Draft',
    paused: 'Paused',
    schedule: 'Scheduled',
    sending: 'Sending',
    sent: 'Sent',
  };
  return map[status] ?? status;
}

// ─── Tool: mailchimp_list_campaigns ─────────────────────

const mailchimpListCampaigns: ToolHandler = {
  description:
    'List Mailchimp email campaigns. Optionally filter by status or type. Returns campaign titles, statuses, and stats.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['save', 'paused', 'schedule', 'sending', 'sent'],
        description: 'Filter by campaign status (optional)',
      },
      type: {
        type: 'string',
        enum: ['regular', 'plaintext', 'absplit', 'rss', 'variate'],
        description: 'Filter by campaign type (optional)',
      },
      count: {
        type: 'number',
        description: 'Number of campaigns to return (default 20, max 1000)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
      sort_field: {
        type: 'string',
        enum: ['create_time', 'send_time'],
        description: 'Field to sort by (default: create_time)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        count: String(params.count ?? 20),
        offset: String(params.offset ?? 0),
      };
      if (params.status) query.status = params.status;
      if (params.type) query.type = params.type;
      if (params.sort_field) query.sort_field = params.sort_field;

      const data = await ctx.apiExecutor.get('/campaigns', query);

      const campaigns: any[] = data.campaigns ?? [];
      if (campaigns.length === 0) {
        return {
          content: 'No campaigns found.',
          metadata: { campaignCount: 0 },
        };
      }

      const lines = campaigns.map((c: any) => {
        const title = c.settings?.title || c.settings?.subject_line || '(untitled)';
        const status = statusLabel(c.status);
        const sendTime = c.send_time ? shortDate(c.send_time) : 'not sent';
        const opens = c.report_summary?.open_rate != null
          ? `${(c.report_summary.open_rate * 100).toFixed(1)}% open rate`
          : '';
        return `${title} — ${status}, sent: ${sendTime}${opens ? `, ${opens}` : ''} (ID: ${c.id})`;
      });

      return {
        content: `Found ${data.total_items ?? campaigns.length} campaign(s):\n\n${lines.join('\n')}`,
        metadata: {
          campaignCount: campaigns.length,
          totalItems: data.total_items ?? campaigns.length,
        },
      };
    } catch (err) {
      return mailchimpError(err);
    }
  },
};

// ─── Tool: mailchimp_list_audiences ─────────────────────

const mailchimpListAudiences: ToolHandler = {
  description:
    'List Mailchimp audiences (lists). Returns audience names, member counts, and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      count: {
        type: 'number',
        description: 'Number of audiences to return (default 20, max 1000)',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination (default 0)',
      },
    },
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        count: String(params.count ?? 20),
        offset: String(params.offset ?? 0),
      };

      const data = await ctx.apiExecutor.get('/lists', query);

      const lists: any[] = data.lists ?? [];
      if (lists.length === 0) {
        return {
          content: 'No audiences found.',
          metadata: { audienceCount: 0 },
        };
      }

      const lines = lists.map((l: any) => {
        const name = l.name ?? '(unnamed)';
        const memberCount = l.stats?.member_count ?? 0;
        const openRate = l.stats?.open_rate != null
          ? `${(l.stats.open_rate * 100).toFixed(1)}% avg open rate`
          : '';
        const created = shortDate(l.date_created);
        return `${name} (ID: ${l.id}) — ${memberCount.toLocaleString()} members${openRate ? `, ${openRate}` : ''}, created: ${created}`;
      });

      return {
        content: `Found ${data.total_items ?? lists.length} audience(s):\n\n${lines.join('\n')}`,
        metadata: {
          audienceCount: lists.length,
          totalItems: data.total_items ?? lists.length,
        },
      };
    } catch (err) {
      return mailchimpError(err);
    }
  },
};

// ─── Tool: mailchimp_create_campaign ────────────────────

const mailchimpCreateCampaign: ToolHandler = {
  description:
    'Create a new Mailchimp email campaign. Returns the campaign ID and web URL for editing.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['regular', 'plaintext', 'absplit', 'rss', 'variate'],
        description: 'Campaign type (default: regular)',
      },
      list_id: {
        type: 'string',
        description: 'The audience/list ID to send to',
      },
      subject_line: {
        type: 'string',
        description: 'Email subject line',
      },
      title: {
        type: 'string',
        description: 'Internal campaign title',
      },
      from_name: {
        type: 'string',
        description: 'The "from" name for the email',
      },
      reply_to: {
        type: 'string',
        description: 'Reply-to email address',
      },
    },
    required: ['list_id', 'subject_line'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        type: params.type ?? 'regular',
        recipients: {
          list_id: params.list_id,
        },
        settings: {
          subject_line: params.subject_line,
          title: params.title ?? params.subject_line,
        },
      };

      if (params.from_name) body.settings.from_name = params.from_name;
      if (params.reply_to) body.settings.reply_to = params.reply_to;

      const campaign = await ctx.apiExecutor.post('/campaigns', body);

      const webUrl = campaign.archive_url || campaign.long_archive_url || '';

      return {
        content: `Campaign created: "${campaign.settings?.title ?? params.subject_line}" (ID: ${campaign.id})\nStatus: ${statusLabel(campaign.status)}\nEdit URL: ${webUrl || 'N/A'}`,
        metadata: {
          campaignId: campaign.id,
          status: campaign.status,
          title: campaign.settings?.title,
          listId: params.list_id,
        },
      };
    } catch (err) {
      return mailchimpError(err);
    }
  },
};

// ─── Tool: mailchimp_send_campaign ──────────────────────

const mailchimpSendCampaign: ToolHandler = {
  description:
    'Send a Mailchimp campaign immediately or schedule it for a future time. The campaign must be in "save" (draft) status.',
  inputSchema: {
    type: 'object',
    properties: {
      campaign_id: {
        type: 'string',
        description: 'The campaign ID to send',
      },
      schedule_time: {
        type: 'string',
        description: 'ISO 8601 datetime to schedule the send (optional — omit to send immediately)',
      },
    },
    required: ['campaign_id'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      if (params.schedule_time) {
        // Schedule the campaign
        await ctx.apiExecutor.post(
          `/campaigns/${params.campaign_id}/actions/schedule`,
          { schedule_time: params.schedule_time },
        );

        return {
          content: `Campaign ${params.campaign_id} scheduled for ${shortDate(params.schedule_time)}.`,
          metadata: {
            campaignId: params.campaign_id,
            action: 'scheduled',
            scheduleTime: params.schedule_time,
          },
        };
      } else {
        // Send immediately
        await ctx.apiExecutor.post(
          `/campaigns/${params.campaign_id}/actions/send`,
        );

        return {
          content: `Campaign ${params.campaign_id} is now sending.`,
          metadata: {
            campaignId: params.campaign_id,
            action: 'sent',
          },
        };
      }
    } catch (err) {
      return mailchimpError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const mailchimpAdapter: SkillAdapter = {
  skillId: 'mailchimp-campaigns',
  name: 'Mailchimp',
  // Default base URL — updated dynamically in initialize() based on API key data center
  baseUrl: 'https://us1.api.mailchimp.com/3.0',
  auth: {
    type: 'oauth2',
    provider: 'mailchimp',
  },
  tools: {
    mailchimp_list_campaigns: mailchimpListCampaigns,
    mailchimp_list_audiences: mailchimpListAudiences,
    mailchimp_create_campaign: mailchimpCreateCampaign,
    mailchimp_send_campaign: mailchimpSendCampaign,
  },
  configSchema: {
    dc: {
      type: 'string' as const,
      label: 'Data Center',
      description: 'Mailchimp data center suffix from your API key (e.g. us21)',
      required: true,
      placeholder: 'us21',
    },
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstLimit: 20,
  },

  async initialize(credentials: ResolvedCredentials): Promise<void> {
    // Determine data center from skill config, API key suffix, or access token metadata
    let dc: string | undefined;

    // If the API key is available, extract dc from the suffix (e.g. "xxxxx-us21")
    const apiKey = credentials.apiKey ?? credentials.fields?.apiKey;
    if (apiKey && apiKey.includes('-')) {
      dc = apiKey.split('-').pop();
    }

    // Access token-based dc (stored in fields or from OAuth metadata)
    if (!dc && credentials.fields?.dc) {
      dc = credentials.fields.dc;
    }

    if (dc) {
      mailchimpAdapter.baseUrl = `https://${dc}.api.mailchimp.com/3.0`;
    }

    // If using API key auth (not OAuth), set Basic auth header
    if (apiKey) {
      const encoded = Buffer.from(`anystring:${apiKey}`).toString('base64');
      mailchimpAdapter.defaultHeaders = {
        Authorization: `Basic ${encoded}`,
      };
    }
  },
};
