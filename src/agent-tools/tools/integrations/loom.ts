/**
 * Loom Integration Tools
 *
 * Native agent tools for Loom API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { loomAdapter } from '../../../mcp/adapters/loom.adapter.js';

export function createLoomVideoTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(loomAdapter, config);
}
