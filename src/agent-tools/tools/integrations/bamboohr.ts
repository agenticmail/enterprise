/**
 * BambooHR Integration Tools
 *
 * Native agent tools for BambooHR API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { bamboohrAdapter } from '../../../mcp/adapters/bamboohr.adapter.js';

export function createBamboohrTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(bamboohrAdapter, config);
}
