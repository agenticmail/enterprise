/**
 * Mixpanel Integration Tools
 *
 * Native agent tools for Mixpanel API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { mixpanelAdapter } from '../../../mcp/adapters/mixpanel.adapter.js';

export function createMixpanelAnalyticsTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(mixpanelAdapter, config);
}
