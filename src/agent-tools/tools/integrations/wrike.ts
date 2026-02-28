/**
 * Wrike Integration Tools
 *
 * Native agent tools for Wrike API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { wrikeAdapter } from '../../../mcp/adapters/wrike.adapter.js';

export function createWrikeTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(wrikeAdapter, config);
}
