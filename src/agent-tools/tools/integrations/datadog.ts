/**
 * Datadog Integration Tools
 *
 * Native agent tools for Datadog API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { datadogAdapter } from '../../../mcp/adapters/datadog.adapter.js';

export function createDatadogMonitoringTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(datadogAdapter, config);
}
