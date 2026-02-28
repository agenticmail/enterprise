/**
 * Klaviyo Integration Tools
 *
 * Native agent tools for Klaviyo API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { klaviyoAdapter } from '../../../mcp/adapters/klaviyo.adapter.js';

export function createKlaviyoTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(klaviyoAdapter, config);
}
