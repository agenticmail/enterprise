/**
 * Trello Integration Tools
 *
 * Native agent tools for Trello API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { trelloAdapter } from '../../../mcp/adapters/trello.adapter.js';

export function createTrelloCardsTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(trelloAdapter, config);
}
