/**
 * Webex Integration Tools
 *
 * Native agent tools for Webex API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { webexAdapter } from '../../../mcp/adapters/webex.adapter.js';

export function createWebexTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(webexAdapter, config);
}
