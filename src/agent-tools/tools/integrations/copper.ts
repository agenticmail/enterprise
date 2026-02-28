/**
 * Copper CRM Integration Tools
 *
 * Native agent tools for Copper CRM API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { copperAdapter } from '../../../mcp/adapters/copper.adapter.js';

export function createCopperCrmTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(copperAdapter, config);
}
