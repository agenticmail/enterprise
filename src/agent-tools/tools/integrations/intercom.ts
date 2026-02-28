/**
 * Intercom Support Integration Tools
 *
 * Native agent tools for Intercom Support API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { intercomAdapter } from '../../../mcp/adapters/intercom.adapter.js';

export function createIntercomSupportTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(intercomAdapter, config);
}
