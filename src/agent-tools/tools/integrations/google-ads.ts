/**
 * Google Ads Integration Tools
 *
 * Native agent tools for Google Ads API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { googleAdsAdapter } from '../../../mcp/adapters/google-ads.adapter.js';

export function createGoogleAdsTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(googleAdsAdapter, config);
}
