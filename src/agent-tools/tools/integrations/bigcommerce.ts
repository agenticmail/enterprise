/**
 * BigCommerce Integration Tools
 *
 * Native agent tools for BigCommerce API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { bigcommerceAdapter } from '../../../mcp/adapters/bigcommerce.adapter.js';

export function createBigcommerceTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(bigcommerceAdapter, config);
}
