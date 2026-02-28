/**
 * SalesLoft Integration Tools
 *
 * Native agent tools for SalesLoft API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { salesloftAdapter } from '../../../mcp/adapters/salesloft.adapter.js';

export function createSalesloftTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(salesloftAdapter, config);
}
