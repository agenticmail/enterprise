/**
 * Drift Conversational Marketing Integration Tools
 *
 * Native agent tools for Drift Conversational Marketing API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { driftAdapter } from '../../../mcp/adapters/drift.adapter.js';

export function createDriftTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(driftAdapter, config);
}
