/**
 * Mailchimp Integration Tools
 *
 * Native agent tools for Mailchimp API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { mailchimpAdapter } from '../../../mcp/adapters/mailchimp.adapter.js';

export function createMailchimpCampaignsTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(mailchimpAdapter, config);
}
