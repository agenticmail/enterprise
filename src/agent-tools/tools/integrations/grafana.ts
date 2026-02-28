/**
 * Grafana Integration Tools
 *
 * Native agent tools for Grafana API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { grafanaAdapter } from '../../../mcp/adapters/grafana.adapter.js';

export function createGrafanaTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(grafanaAdapter, config);
}
