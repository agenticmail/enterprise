/**
 * Splunk Integration Tools
 *
 * Native agent tools for Splunk API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { splunkAdapter } from '../../../mcp/adapters/splunk.adapter.js';

export function createSplunkTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(splunkAdapter, config);
}
