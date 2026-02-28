/**
 * Pipedrive Deals Integration Tools
 *
 * Native agent tools for Pipedrive Deals API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { pipedriveAdapter } from '../../../mcp/adapters/pipedrive.adapter.js';

export function createPipedriveDealsTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(pipedriveAdapter, config);
}
