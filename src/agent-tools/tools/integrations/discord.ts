/**
 * Discord Integration Tools
 *
 * Native agent tools for Discord API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { discordAdapter } from '../../../mcp/adapters/discord.adapter.js';

export function createDiscordTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(discordAdapter, config);
}
