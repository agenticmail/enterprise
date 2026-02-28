/**
 * New Relic Integration Tools
 *
 * Native agent tools for New Relic API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { newrelicAdapter } from '../../../mcp/adapters/newrelic.adapter.js';

export function createNewrelicTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(newrelicAdapter, config);
}
