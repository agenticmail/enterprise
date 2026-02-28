/**
 * ADP Workforce Integration Tools
 *
 * Native agent tools for ADP Workforce API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { adpAdapter } from '../../../mcp/adapters/adp.adapter.js';

export function createAdpTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(adpAdapter, config);
}
