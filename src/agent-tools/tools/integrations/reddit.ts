/**
 * Reddit Integration Tools
 *
 * Native agent tools for Reddit API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { redditAdapter } from '../../../mcp/adapters/reddit.adapter.js';

export function createRedditTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(redditAdapter, config);
}
