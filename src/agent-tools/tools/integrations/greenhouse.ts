/**
 * Greenhouse Recruiting Integration Tools
 *
 * Native agent tools for Greenhouse Recruiting API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { greenhouseAdapter } from '../../../mcp/adapters/greenhouse.adapter.js';

export function createGreenhouseTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(greenhouseAdapter, config);
}
