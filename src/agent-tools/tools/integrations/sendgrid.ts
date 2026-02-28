/**
 * SendGrid Email Integration Tools
 *
 * Native agent tools for SendGrid Email API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { sendgridAdapter } from '../../../mcp/adapters/sendgrid.adapter.js';

export function createSendgridEmailTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(sendgridAdapter, config);
}
