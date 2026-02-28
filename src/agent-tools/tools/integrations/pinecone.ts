/**
 * Pinecone Integration Tools
 *
 * Native agent tools for Pinecone API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { pineconeAdapter } from '../../../mcp/adapters/pinecone.adapter.js';

export function createPineconeTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(pineconeAdapter, config);
}
