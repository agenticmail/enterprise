/**
 * Freshdesk Support Integration Tools
 *
 * Native agent tools for Freshdesk Support API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { freshdeskAdapter } from '../../../mcp/adapters/freshdesk.adapter.js';

export function createFreshdeskTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(freshdeskAdapter, config);
}
