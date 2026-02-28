/**
 * PayPal Integration Tools
 *
 * Native agent tools for PayPal API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { paypalAdapter } from '../../../mcp/adapters/paypal.adapter.js';

export function createPaypalTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(paypalAdapter, config);
}
