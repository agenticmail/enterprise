/**
 * NetSuite ERP Integration Tools
 *
 * Native agent tools for NetSuite ERP API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { netsuiteAdapter } from '../../../mcp/adapters/netsuite.adapter.js';

export function createNetsuiteTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(netsuiteAdapter, config);
}
