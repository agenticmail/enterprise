/**
 * ClickUp Integration Tools
 *
 * Native agent tools for ClickUp API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { clickupAdapter } from '../../../mcp/adapters/clickup.adapter.js';

export function createClickupTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(clickupAdapter, config);
}
