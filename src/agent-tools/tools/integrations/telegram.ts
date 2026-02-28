/**
 * Telegram Bot Integration Tools
 *
 * Native agent tools for Telegram Bot API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { telegramAdapter } from '../../../mcp/adapters/telegram.adapter.js';

export function createTelegramBotTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(telegramAdapter, config);
}
