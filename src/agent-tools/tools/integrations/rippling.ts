/**
 * Rippling HR Integration Tools
 *
 * Native agent tools for Rippling HR API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { ripplingAdapter } from '../../../mcp/adapters/rippling.adapter.js';

export function createRipplingTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(ripplingAdapter, config);
}
