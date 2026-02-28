/**
 * LinkedIn Integration Tools
 *
 * Native agent tools for LinkedIn API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { linkedinAdapter } from '../../../mcp/adapters/linkedin.adapter.js';

export function createLinkedinTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(linkedinAdapter, config);
}
