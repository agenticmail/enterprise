/**
 * Shopify Integration Tools
 *
 * Native agent tools for Shopify API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { shopifyAdapter } from '../../../mcp/adapters/shopify.adapter.js';

export function createShopifyTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(shopifyAdapter, config);
}
