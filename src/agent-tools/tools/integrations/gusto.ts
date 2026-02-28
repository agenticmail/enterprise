/**
 * Gusto Payroll Integration Tools
 *
 * Native agent tools for Gusto Payroll API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { gustoAdapter } from '../../../mcp/adapters/gusto.adapter.js';

export function createGustoTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(gustoAdapter, config);
}
