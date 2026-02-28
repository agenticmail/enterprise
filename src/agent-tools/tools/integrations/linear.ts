/**
 * Linear Integration Tools
 *
 * Native agent tools for Linear API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { linearAdapter } from '../../../mcp/adapters/linear.adapter.js';

export function createLinearTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(linearAdapter, config);
}
