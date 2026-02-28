/**
 * Mailgun Integration Tools
 *
 * Native agent tools for Mailgun API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { mailgunAdapter } from '../../../mcp/adapters/mailgun.adapter.js';

export function createMailgunTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(mailgunAdapter, config);
}
