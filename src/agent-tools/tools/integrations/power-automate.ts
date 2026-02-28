/**
 * Microsoft Power Automate Integration Tools
 *
 * Native agent tools for Microsoft Power Automate API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { powerAutomateAdapter } from '../../../mcp/adapters/power-automate.adapter.js';

export function createPowerAutomateTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(powerAutomateAdapter, config);
}
