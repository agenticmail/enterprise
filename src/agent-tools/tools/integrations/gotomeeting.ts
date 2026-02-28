/**
 * GoTo Meeting Integration Tools
 *
 * Native agent tools for GoTo Meeting API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { gotomeetingAdapter } from '../../../mcp/adapters/gotomeeting.adapter.js';

export function createGotomeetingTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(gotomeetingAdapter, config);
}
