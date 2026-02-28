/**
 * Xero Accounting Integration Tools
 *
 * Native agent tools for Xero Accounting API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { xeroAdapter } from '../../../mcp/adapters/xero.adapter.js';

export function createXeroTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(xeroAdapter, config);
}
