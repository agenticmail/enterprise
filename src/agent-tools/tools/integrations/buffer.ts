/**
 * Buffer Social Media Integration Tools
 *
 * Native agent tools for Buffer Social Media API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { bufferAdapter } from '../../../mcp/adapters/buffer.adapter.js';

export function createBufferTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(bufferAdapter, config);
}
