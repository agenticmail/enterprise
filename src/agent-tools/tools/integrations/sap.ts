/**
 * SAP S/4HANA Integration Tools
 *
 * Native agent tools for SAP S/4HANA API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { sapAdapter } from '../../../mcp/adapters/sap.adapter.js';

export function createSapTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(sapAdapter, config);
}
