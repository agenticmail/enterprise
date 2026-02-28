/**
 * Figma Integration Tools
 *
 * Native agent tools for Figma API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { figmaAdapter } from '../../../mcp/adapters/figma.adapter.js';

export function createFigmaDesignTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(figmaAdapter, config);
}
