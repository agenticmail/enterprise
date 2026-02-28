/**
 * Canva Integration Tools
 *
 * Native agent tools for Canva API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { canvaAdapter } from '../../../mcp/adapters/canva.adapter.js';

export function createCanvaDesignTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(canvaAdapter, config);
}
