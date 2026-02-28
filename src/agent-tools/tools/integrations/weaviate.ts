/**
 * Weaviate Integration Tools
 *
 * Native agent tools for Weaviate API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { weaviateAdapter } from '../../../mcp/adapters/weaviate.adapter.js';

export function createWeaviateTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(weaviateAdapter, config);
}
