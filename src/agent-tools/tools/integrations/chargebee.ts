/**
 * Chargebee Integration Tools
 *
 * Native agent tools for Chargebee API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { chargebeeAdapter } from '../../../mcp/adapters/chargebee.adapter.js';

export function createChargebeeTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(chargebeeAdapter, config);
}
