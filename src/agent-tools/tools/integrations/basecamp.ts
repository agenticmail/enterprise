/**
 * Basecamp Integration Tools
 *
 * Native agent tools for Basecamp API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { basecampAdapter } from '../../../mcp/adapters/basecamp.adapter.js';

export function createBasecampTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(basecampAdapter, config);
}
