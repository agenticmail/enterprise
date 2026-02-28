/**
 * Zoho CRM Integration Tools
 *
 * Native agent tools for Zoho CRM API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { zohoCrmAdapter } from '../../../mcp/adapters/zoho-crm.adapter.js';

export function createZohoCrmTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(zohoCrmAdapter, config);
}
