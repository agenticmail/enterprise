/**
 * Vercel Integration Tools
 *
 * Native agent tools for Vercel API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { vercelAdapter } from '../../../mcp/adapters/vercel.adapter.js';

export function createVercelDeploymentsTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(vercelAdapter, config);
}
