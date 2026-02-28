/**
 * PandaDoc Integration Tools
 *
 * Native agent tools for PandaDoc API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { pandadocAdapter } from '../../../mcp/adapters/pandadoc.adapter.js';

export function createPandadocTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(pandadocAdapter, config);
}
