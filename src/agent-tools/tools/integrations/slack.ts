/**
 * Slack Integration Tools
 *
 * Native agent tools for Slack API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { slackAdapter } from '../../../mcp/adapters/slack.adapter.js';

export function createSlackTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(slackAdapter, config);
}
