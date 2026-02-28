/**
 * Webflow Integration Tools
 *
 * Native agent tools for Webflow API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { webflowAdapter } from '../../../mcp/adapters/webflow.adapter.js';

export function createWebflowTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(webflowAdapter, config);
}
