/**
 * Gong Revenue Intelligence Integration Tools
 *
 * Native agent tools for Gong Revenue Intelligence API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { gongAdapter } from '../../../mcp/adapters/gong.adapter.js';

export function createGongTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(gongAdapter, config);
}
