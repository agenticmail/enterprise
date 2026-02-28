/**
 * Twitter/X Integration Tools
 *
 * Native agent tools for Twitter/X API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { twitterAdapter } from '../../../mcp/adapters/twitter.adapter.js';

export function createTwitterTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(twitterAdapter, config);
}
