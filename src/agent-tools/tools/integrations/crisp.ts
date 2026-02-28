/**
 * Crisp Chat Integration Tools
 *
 * Native agent tools for Crisp Chat API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { crispAdapter } from '../../../mcp/adapters/crisp.adapter.js';

export function createCrispTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(crispAdapter, config);
}
