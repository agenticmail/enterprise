/**
 * HubSpot CRM Integration Tools
 *
 * Native agent tools for HubSpot CRM API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { hubspotAdapter } from '../../../mcp/adapters/hubspot.adapter.js';

export function createHubspotCrmTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(hubspotAdapter, config);
}
