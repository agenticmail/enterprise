/**
 * Twilio SMS Integration Tools
 *
 * Native agent tools for Twilio SMS API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { twilioAdapter } from '../../../mcp/adapters/twilio.adapter.js';

export function createTwilioSmsTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(twilioAdapter, config);
}
