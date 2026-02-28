/**
 * Freshservice ITSM Integration Tools
 *
 * Native agent tools for Freshservice ITSM API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { freshserviceAdapter } from '../../../mcp/adapters/freshservice.adapter.js';

export function createFreshserviceTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(freshserviceAdapter, config);
}
