/**
 * Smartsheet Integration Tools
 *
 * Native agent tools for Smartsheet API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { smartsheetAdapter } from '../../../mcp/adapters/smartsheet.adapter.js';

export function createSmartsheetTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(smartsheetAdapter, config);
}
