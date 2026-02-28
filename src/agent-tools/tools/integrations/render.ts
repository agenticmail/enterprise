/**
 * Render Integration Tools
 *
 * Native agent tools for Render API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { renderAdapter } from '../../../mcp/adapters/render.adapter.js';

export function createRenderTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(renderAdapter, config);
}
