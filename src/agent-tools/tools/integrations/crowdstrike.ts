/**
 * CrowdStrike Integration Tools
 *
 * Native agent tools for CrowdStrike API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { crowdstrikeAdapter } from '../../../mcp/adapters/crowdstrike.adapter.js';

export function createCrowdstrikeTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(crowdstrikeAdapter, config);
}
