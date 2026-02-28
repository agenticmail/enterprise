/**
 * Whereby Integration Tools
 *
 * Native agent tools for Whereby API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { wherebyAdapter } from '../../../mcp/adapters/whereby.adapter.js';

export function createWherebyTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(wherebyAdapter, config);
}
