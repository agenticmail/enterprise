/**
 * Postmark Integration Tools
 *
 * Native agent tools for Postmark API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { postmarkAdapter } from '../../../mcp/adapters/postmark.adapter.js';

export function createPostmarkTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(postmarkAdapter, config);
}
