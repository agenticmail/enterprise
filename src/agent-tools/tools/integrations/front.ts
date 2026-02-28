/**
 * Front Integration Tools
 *
 * Native agent tools for Front API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { frontAdapter } from '../../../mcp/adapters/front.adapter.js';

export function createFrontTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(frontAdapter, config);
}
