/**
 * OpsGenie Integration Tools
 *
 * Native agent tools for OpsGenie API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { opsgenieAdapter } from '../../../mcp/adapters/opsgenie.adapter.js';

export function createOpsgenieTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(opsgenieAdapter, config);
}
