/**
 * Monday.com Integration Tools
 *
 * Native agent tools for Monday.com API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { mondayAdapter } from '../../../mcp/adapters/monday.adapter.js';

export function createMondayBoardsTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(mondayAdapter, config);
}
