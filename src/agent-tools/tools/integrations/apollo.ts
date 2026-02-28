/**
 * Apollo.io Sales Intelligence Integration Tools
 *
 * Native agent tools for Apollo.io Sales Intelligence API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { apolloAdapter } from '../../../mcp/adapters/apollo.adapter.js';

export function createApolloIoTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(apolloAdapter, config);
}
