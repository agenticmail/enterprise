/**
 * Salesforce Integration Tools
 *
 * Native agent tools for Salesforce API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { salesforceAdapter } from '../../../mcp/adapters/salesforce.adapter.js';

export function createSalesforceTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(salesforceAdapter, config);
}
