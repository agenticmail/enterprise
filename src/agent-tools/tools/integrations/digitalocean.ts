/**
 * DigitalOcean Integration Tools
 *
 * Native agent tools for DigitalOcean API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { digitaloceanAdapter } from '../../../mcp/adapters/digitalocean.adapter.js';

export function createDigitaloceanTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(digitaloceanAdapter, config);
}
