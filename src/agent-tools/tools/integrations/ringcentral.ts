/**
 * RingCentral Integration Tools
 *
 * Native agent tools for RingCentral API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { ringcentralAdapter } from '../../../mcp/adapters/ringcentral.adapter.js';

export function createRingcentralTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(ringcentralAdapter, config);
}
