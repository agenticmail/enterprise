/**
 * Confluence Integration Tools
 *
 * Native agent tools for Confluence API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { confluenceAdapter } from '../../../mcp/adapters/confluence.adapter.js';

export function createConfluenceWikiTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(confluenceAdapter, config);
}
