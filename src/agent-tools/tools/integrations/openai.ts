/**
 * OpenAI Integration Tools
 *
 * Native agent tools for OpenAI API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { openaiAdapter } from '../../../mcp/adapters/openai.adapter.js';

export function createOpenaiTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(openaiAdapter, config);
}
