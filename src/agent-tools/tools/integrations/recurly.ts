/**
 * Recurly Integration Tools
 *
 * Native agent tools for Recurly API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { recurlyAdapter } from '../../../mcp/adapters/recurly.adapter.js';

export function createRecurlyTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(recurlyAdapter, config);
}
