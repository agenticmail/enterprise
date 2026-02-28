/**
 * Plaid Integration Tools
 *
 * Native agent tools for Plaid API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { plaidAdapter } from '../../../mcp/adapters/plaid.adapter.js';

export function createPlaidTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(plaidAdapter, config);
}
