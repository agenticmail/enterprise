/**
 * Adobe Acrobat Sign Integration Tools
 *
 * Native agent tools for Adobe Acrobat Sign API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { adobeSignAdapter } from '../../../mcp/adapters/adobe-sign.adapter.js';

export function createAdobeSignTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(adobeSignAdapter, config);
}
