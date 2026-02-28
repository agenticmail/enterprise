/**
 * Neon Serverless Postgres Integration Tools
 *
 * Native agent tools for Neon Serverless Postgres API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { neonAdapter } from '../../../mcp/adapters/neon.adapter.js';

export function createNeonTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(neonAdapter, config);
}
