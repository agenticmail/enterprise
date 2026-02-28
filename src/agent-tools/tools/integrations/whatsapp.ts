/**
 * WhatsApp Business Integration Tools
 *
 * Native agent tools for WhatsApp Business API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { whatsappAdapter } from '../../../mcp/adapters/whatsapp.adapter.js';

export function createWhatsappBusinessTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(whatsappAdapter, config);
}
