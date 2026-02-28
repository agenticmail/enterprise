/**
 * Close CRM Integration Tools
 *
 * Native agent tools for Close CRM API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { closeAdapter } from '../../../mcp/adapters/close.adapter.js';

export function createCloseCrmTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(closeAdapter, config);
}
