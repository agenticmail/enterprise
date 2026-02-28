/**
 * LiveChat Integration Tools
 *
 * Native agent tools for LiveChat API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { livechatAdapter } from '../../../mcp/adapters/livechat.adapter.js';

export function createLivechatTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(livechatAdapter, config);
}
