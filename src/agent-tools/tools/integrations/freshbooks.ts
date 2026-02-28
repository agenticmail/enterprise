/**
 * FreshBooks Integration Tools
 *
 * Native agent tools for FreshBooks API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { freshbooksAdapter } from '../../../mcp/adapters/freshbooks.adapter.js';

export function createFreshbooksTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(freshbooksAdapter, config);
}
