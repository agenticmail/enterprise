/**
 * Fly.io Integration Tools
 *
 * Native agent tools for Fly.io API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { flyioAdapter } from '../../../mcp/adapters/flyio.adapter.js';

export function createFlyioTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(flyioAdapter, config);
}
