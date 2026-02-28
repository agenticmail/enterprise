/**
 * LaunchDarkly Integration Tools
 *
 * Native agent tools for LaunchDarkly API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { launchdarklyAdapter } from '../../../mcp/adapters/launchdarkly.adapter.js';

export function createLaunchdarklyTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(launchdarklyAdapter, config);
}
