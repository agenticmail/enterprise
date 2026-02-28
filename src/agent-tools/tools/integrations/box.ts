/**
 * Box Integration Tools
 *
 * Native agent tools for Box API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { boxAdapter } from '../../../mcp/adapters/box.adapter.js';

export function createBoxTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(boxAdapter, config);
}
