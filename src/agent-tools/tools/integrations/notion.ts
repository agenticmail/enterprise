/**
 * Notion Integration Tools
 *
 * Native agent tools for Notion API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { notionAdapter } from '../../../mcp/adapters/notion.adapter.js';

export function createNotionTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(notionAdapter, config);
}
