/**
 * WooCommerce Integration Tools
 *
 * Native agent tools for WooCommerce API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { woocommerceAdapter } from '../../../mcp/adapters/woocommerce.adapter.js';

export function createWoocommerceTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(woocommerceAdapter, config);
}
