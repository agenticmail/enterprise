/**
 * Freshsales CRM Integration Tools
 *
 * Native agent tools for Freshsales CRM API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { freshsalesAdapter } from '../../../mcp/adapters/freshsales.adapter.js';

export function createFreshsalesTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(freshsalesAdapter, config);
}
