/**
 * HiBob Integration Tools
 *
 * Native agent tools for HiBob API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { hibobAdapter } from '../../../mcp/adapters/hibob.adapter.js';

export function createHibobTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(hibobAdapter, config);
}
