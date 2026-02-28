/**
 * Miro Integration Tools
 *
 * Native agent tools for Miro API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { miroAdapter } from '../../../mcp/adapters/miro.adapter.js';

export function createMiroBoardsTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(miroAdapter, config);
}
