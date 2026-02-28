/**
 * Hootsuite Integration Tools
 *
 * Native agent tools for Hootsuite API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { hootsuiteAdapter } from '../../../mcp/adapters/hootsuite.adapter.js';

export function createHootsuiteTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(hootsuiteAdapter, config);
}
