/**
 * Okta Identity Integration Tools
 *
 * Native agent tools for Okta Identity API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { oktaAdapter } from '../../../mcp/adapters/okta.adapter.js';

export function createOktaTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(oktaAdapter, config);
}
