/**
 * Square Integration Tools
 *
 * Native agent tools for Square API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { squareAdapter } from '../../../mcp/adapters/square.adapter.js';

export function createSquareTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(squareAdapter, config);
}
