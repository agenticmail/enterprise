/**
 * Lever Recruiting Integration Tools
 *
 * Native agent tools for Lever Recruiting API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { leverAdapter } from '../../../mcp/adapters/lever.adapter.js';

export function createLeverTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(leverAdapter, config);
}
