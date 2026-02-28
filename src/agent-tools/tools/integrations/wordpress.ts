/**
 * WordPress Integration Tools
 *
 * Native agent tools for WordPress API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { wordpressAdapter } from '../../../mcp/adapters/wordpress.adapter.js';

export function createWordpressTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(wordpressAdapter, config);
}
