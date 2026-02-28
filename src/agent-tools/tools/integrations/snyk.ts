/**
 * Snyk Security Integration Tools
 *
 * Native agent tools for Snyk Security API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { snykAdapter } from '../../../mcp/adapters/snyk.adapter.js';

export function createSnykTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(snykAdapter, config);
}
