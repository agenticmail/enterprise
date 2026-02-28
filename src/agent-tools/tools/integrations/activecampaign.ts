/**
 * ActiveCampaign Integration Tools
 *
 * Native agent tools for ActiveCampaign API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { activecampaignAdapter } from '../../../mcp/adapters/activecampaign.adapter.js';

export function createActivecampaignTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(activecampaignAdapter, config);
}
