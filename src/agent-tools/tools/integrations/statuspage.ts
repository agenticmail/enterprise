/**
 * Atlassian Statuspage Integration Tools
 *
 * Native agent tools for Atlassian Statuspage API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { statuspageAdapter } from '../../../mcp/adapters/statuspage.adapter.js';

export function createStatuspageTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(statuspageAdapter, config);
}
