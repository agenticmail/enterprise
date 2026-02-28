/**
 * Paddle Integration Tools
 *
 * Native agent tools for Paddle API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { paddleAdapter } from '../../../mcp/adapters/paddle.adapter.js';

export function createPaddleTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(paddleAdapter, config);
}
