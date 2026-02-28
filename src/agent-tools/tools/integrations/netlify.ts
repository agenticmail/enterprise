/**
 * Netlify Integration Tools
 *
 * Native agent tools for Netlify API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { netlifyAdapter } from '../../../mcp/adapters/netlify.adapter.js';

export function createNetlifyTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(netlifyAdapter, config);
}
