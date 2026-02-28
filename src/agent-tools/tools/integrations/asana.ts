/**
 * Asana Integration Tools
 *
 * Native agent tools for Asana API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { asanaAdapter } from '../../../mcp/adapters/asana.adapter.js';

export function createAsanaTasksTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(asanaAdapter, config);
}
