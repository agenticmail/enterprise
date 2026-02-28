/**
 * Zendesk Tickets Integration Tools
 *
 * Native agent tools for Zendesk Tickets API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { zendeskAdapter } from '../../../mcp/adapters/zendesk.adapter.js';

export function createZendeskTicketsTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(zendeskAdapter, config);
}
