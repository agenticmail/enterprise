/**
 * ServiceNow Integration Tools
 *
 * Native agent tools for ServiceNow API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { servicenowAdapter } from '../../../mcp/adapters/servicenow.adapter.js';

export function createServicenowTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(servicenowAdapter, config);
}
