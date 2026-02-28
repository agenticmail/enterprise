/**
 * Google Analytics Integration Tools
 *
 * Native agent tools for Google Analytics API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { googleAnalyticsAdapter } from '../../../mcp/adapters/google-analytics.adapter.js';

export function createGoogleAnalyticsTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(googleAnalyticsAdapter, config);
}
