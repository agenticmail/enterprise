/**
 * Outreach Sales Engagement Integration Tools
 *
 * Native agent tools for Outreach Sales Engagement API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { outreachAdapter } from '../../../mcp/adapters/outreach.adapter.js';

export function createOutreachTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(outreachAdapter, config);
}
