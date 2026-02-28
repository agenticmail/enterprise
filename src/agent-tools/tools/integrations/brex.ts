/**
 * Brex Integration Tools
 *
 * Native agent tools for Brex API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { brexAdapter } from '../../../mcp/adapters/brex.adapter.js';

export function createBrexTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(brexAdapter, config);
}
