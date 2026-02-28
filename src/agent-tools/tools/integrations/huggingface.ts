/**
 * HuggingFace Integration Tools
 *
 * Native agent tools for HuggingFace API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { huggingfaceAdapter } from '../../../mcp/adapters/huggingface.adapter.js';

export function createHuggingfaceTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(huggingfaceAdapter, config);
}
