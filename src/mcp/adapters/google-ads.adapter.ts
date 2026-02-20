/**
 * MCP Skill Adapter — Google Ads
 *
 * Maps Google Ads REST API (v15) endpoints to MCP tool handlers.
 * API reference: https://developers.google.com/google-ads/api/rest/reference/rest/v15
 *
 * Auth: OAuth2 with Google provider. Requires a developer-token
 * from ctx.skillConfig.developerToken sent as a default header.
 *
 * Tools:
 *   - google_ads_list_campaigns  List campaigns in a customer account
 *   - google_ads_get_campaign    Get details of a specific campaign
 *   - google_ads_list_ad_groups  List ad groups for a campaign
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
  ResolvedCredentials,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function googleAdsError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // Google Ads errors are nested under error.details
      const details = data.error?.details;
      if (Array.isArray(details) && details.length > 0) {
        const errors = details
          .flatMap((d: any) => d.errors ?? [])
          .map((e: any) => e.message ?? '')
          .filter(Boolean)
          .join('; ');
        if (errors) return { content: `Google Ads API error: ${errors}`, isError: true };
      }
      const msg = data.error?.message || data.message || err.message;
      const code = data.error?.code ? ` (code ${data.error.code})` : '';
      return { content: `Google Ads API error: ${msg}${code}`, isError: true };
    }
    return { content: `Google Ads API error: ${err.message}`, isError: true };
  }
  return { content: `Google Ads API error: ${String(err)}`, isError: true };
}

/** Map campaign status enum to a readable label. */
function campaignStatusLabel(status: string | undefined): string {
  const map: Record<string, string> = {
    ENABLED: 'Enabled',
    PAUSED: 'Paused',
    REMOVED: 'Removed',
    UNKNOWN: 'Unknown',
    UNSPECIFIED: 'Unspecified',
  };
  return map[status ?? ''] ?? status ?? 'unknown';
}

/** Map ad group status enum to a readable label. */
function adGroupStatusLabel(status: string | undefined): string {
  const map: Record<string, string> = {
    ENABLED: 'Enabled',
    PAUSED: 'Paused',
    REMOVED: 'Removed',
    UNKNOWN: 'Unknown',
    UNSPECIFIED: 'Unspecified',
  };
  return map[status ?? ''] ?? status ?? 'unknown';
}

/** Format micros amount (1/1,000,000 of the currency unit). */
function formatMicros(micros: string | number | undefined, currency?: string): string {
  if (micros === undefined || micros === null) return 'N/A';
  const value = (Number(micros) / 1_000_000).toFixed(2);
  return currency ? `${value} ${currency}` : value;
}

/** Extract resource ID from a Google Ads resource name like "customers/123/campaigns/456". */
function extractResourceId(resourceName: string | undefined): string {
  if (!resourceName) return 'unknown';
  const parts = resourceName.split('/');
  return parts[parts.length - 1] ?? 'unknown';
}

// ─── Tool: google_ads_list_campaigns ────────────────────

const googleAdsListCampaigns: ToolHandler = {
  description:
    'List Google Ads campaigns for a customer account. Uses Google Ads Query Language (GAQL) to search campaigns. Returns campaign names, statuses, and budgets.',
  inputSchema: {
    type: 'object',
    properties: {
      customer_id: {
        type: 'string',
        description: 'Google Ads customer ID (10-digit, no dashes, e.g. "1234567890")',
      },
      status: {
        type: 'string',
        enum: ['ENABLED', 'PAUSED', 'REMOVED'],
        description: 'Filter by campaign status (optional — omit for all statuses)',
      },
      page_size: {
        type: 'number',
        description: 'Number of campaigns to return (default 50, max 10000)',
      },
    },
    required: ['customer_id'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      let query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.campaign_budget, campaign_budget.amount_micros FROM campaign`;

      if (params.status) {
        query += ` WHERE campaign.status = '${params.status}'`;
      }

      query += ` ORDER BY campaign.name LIMIT ${params.page_size ?? 50}`;

      const data = await ctx.apiExecutor.post(
        `/customers/${params.customer_id}/googleAds:searchStream`,
        { query },
      );

      // searchStream returns an array of batches
      const results: any[] = Array.isArray(data)
        ? data.flatMap((batch: any) => batch.results ?? [])
        : data.results ?? [];

      if (results.length === 0) {
        return {
          content: 'No campaigns found.',
          metadata: { campaignCount: 0, customerId: params.customer_id },
        };
      }

      const lines = results.map((row: any) => {
        const campaign = row.campaign ?? {};
        const budget = row.campaignBudget ?? {};
        const status = campaignStatusLabel(campaign.status);
        const channelType = campaign.advertisingChannelType ?? 'unknown';
        const budgetAmount = formatMicros(budget.amountMicros);
        return `${campaign.name} (ID: ${campaign.id}) — ${status}, channel: ${channelType}, daily budget: ${budgetAmount}`;
      });

      return {
        content: `Found ${results.length} campaign(s) for customer ${params.customer_id}:\n\n${lines.join('\n')}`,
        metadata: {
          campaignCount: results.length,
          customerId: params.customer_id,
        },
      };
    } catch (err) {
      return googleAdsError(err);
    }
  },
};

// ─── Tool: google_ads_get_campaign ──────────────────────

const googleAdsGetCampaign: ToolHandler = {
  description:
    'Get detailed information about a specific Google Ads campaign, including performance metrics.',
  inputSchema: {
    type: 'object',
    properties: {
      customer_id: {
        type: 'string',
        description: 'Google Ads customer ID (10-digit, no dashes)',
      },
      campaign_id: {
        type: 'string',
        description: 'The campaign ID to retrieve',
      },
    },
    required: ['customer_id', 'campaign_id'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.start_date, campaign.end_date, campaign_budget.amount_micros, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr FROM campaign WHERE campaign.id = ${params.campaign_id}`;

      const data = await ctx.apiExecutor.post(
        `/customers/${params.customer_id}/googleAds:searchStream`,
        { query },
      );

      const results: any[] = Array.isArray(data)
        ? data.flatMap((batch: any) => batch.results ?? [])
        : data.results ?? [];

      if (results.length === 0) {
        return {
          content: `Campaign ${params.campaign_id} not found.`,
          metadata: { campaignId: params.campaign_id, customerId: params.customer_id },
          isError: true,
        };
      }

      const row = results[0];
      const campaign = row.campaign ?? {};
      const budget = row.campaignBudget ?? {};
      const metrics = row.metrics ?? {};

      const ctr = metrics.ctr != null ? (metrics.ctr * 100).toFixed(2) + '%' : 'N/A';

      const content = [
        `Campaign: ${campaign.name} (ID: ${campaign.id})`,
        `Status: ${campaignStatusLabel(campaign.status)}`,
        `Channel: ${campaign.advertisingChannelType ?? 'unknown'}`,
        `Start date: ${campaign.startDate ?? 'N/A'}`,
        `End date: ${campaign.endDate ?? 'N/A (ongoing)'}`,
        `Daily budget: ${formatMicros(budget.amountMicros)}`,
        '',
        'Performance metrics:',
        `  Impressions: ${Number(metrics.impressions ?? 0).toLocaleString()}`,
        `  Clicks: ${Number(metrics.clicks ?? 0).toLocaleString()}`,
        `  CTR: ${ctr}`,
        `  Cost: ${formatMicros(metrics.costMicros)}`,
        `  Conversions: ${Number(metrics.conversions ?? 0).toLocaleString()}`,
      ].join('\n');

      return {
        content,
        metadata: {
          campaignId: campaign.id,
          customerId: params.customer_id,
          name: campaign.name,
          status: campaign.status,
          impressions: metrics.impressions,
          clicks: metrics.clicks,
          cost: metrics.costMicros,
          conversions: metrics.conversions,
        },
      };
    } catch (err) {
      return googleAdsError(err);
    }
  },
};

// ─── Tool: google_ads_list_ad_groups ────────────────────

const googleAdsListAdGroups: ToolHandler = {
  description:
    'List ad groups for a campaign in Google Ads. Returns ad group names, statuses, and bid settings.',
  inputSchema: {
    type: 'object',
    properties: {
      customer_id: {
        type: 'string',
        description: 'Google Ads customer ID (10-digit, no dashes)',
      },
      campaign_id: {
        type: 'string',
        description: 'The campaign ID to list ad groups for',
      },
      status: {
        type: 'string',
        enum: ['ENABLED', 'PAUSED', 'REMOVED'],
        description: 'Filter by ad group status (optional)',
      },
      page_size: {
        type: 'number',
        description: 'Number of ad groups to return (default 50, max 10000)',
      },
    },
    required: ['customer_id', 'campaign_id'],
    additionalProperties: false,
  },

  async execute(params, ctx): Promise<ToolResult> {
    try {
      let query = `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, ad_group.cpc_bid_micros, metrics.impressions, metrics.clicks FROM ad_group WHERE campaign.id = ${params.campaign_id}`;

      if (params.status) {
        query += ` AND ad_group.status = '${params.status}'`;
      }

      query += ` ORDER BY ad_group.name LIMIT ${params.page_size ?? 50}`;

      const data = await ctx.apiExecutor.post(
        `/customers/${params.customer_id}/googleAds:searchStream`,
        { query },
      );

      const results: any[] = Array.isArray(data)
        ? data.flatMap((batch: any) => batch.results ?? [])
        : data.results ?? [];

      if (results.length === 0) {
        return {
          content: `No ad groups found for campaign ${params.campaign_id}.`,
          metadata: {
            adGroupCount: 0,
            campaignId: params.campaign_id,
            customerId: params.customer_id,
          },
        };
      }

      const lines = results.map((row: any) => {
        const adGroup = row.adGroup ?? {};
        const metrics = row.metrics ?? {};
        const status = adGroupStatusLabel(adGroup.status);
        const cpcBid = formatMicros(adGroup.cpcBidMicros);
        const impressions = Number(metrics.impressions ?? 0).toLocaleString();
        const clicks = Number(metrics.clicks ?? 0).toLocaleString();
        return `${adGroup.name} (ID: ${adGroup.id}) — ${status}, type: ${adGroup.type ?? 'unknown'}, CPC bid: ${cpcBid}, impressions: ${impressions}, clicks: ${clicks}`;
      });

      return {
        content: `Found ${results.length} ad group(s) for campaign ${params.campaign_id}:\n\n${lines.join('\n')}`,
        metadata: {
          adGroupCount: results.length,
          campaignId: params.campaign_id,
          customerId: params.customer_id,
        },
      };
    } catch (err) {
      return googleAdsError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const googleAdsAdapter: SkillAdapter = {
  skillId: 'google-ads',
  name: 'Google Ads',
  baseUrl: 'https://googleads.googleapis.com/v15',
  auth: {
    type: 'oauth2',
    provider: 'google',
    scopes: ['https://www.googleapis.com/auth/adwords'],
  },
  tools: {
    google_ads_list_campaigns: googleAdsListCampaigns,
    google_ads_get_campaign: googleAdsGetCampaign,
    google_ads_list_ad_groups: googleAdsListAdGroups,
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },

  async initialize(credentials: ResolvedCredentials): Promise<void> {
    // developer-token is required for all Google Ads API calls
    // It comes from skillConfig, but we set it here via defaultHeaders
    // The framework passes skillConfig through credentials.fields as a fallback
    const devToken = credentials.fields?.developerToken;
    if (devToken) {
      googleAdsAdapter.defaultHeaders = {
        ...googleAdsAdapter.defaultHeaders,
        'developer-token': devToken,
      };
    }
  },
};
