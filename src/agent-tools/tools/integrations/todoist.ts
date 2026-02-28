/**
 * Todoist Integration Tools
 *
 * Native agent tools for Todoist API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { todoistAdapter } from '../../../mcp/adapters/todoist.adapter.js';

export function createTodoistTasksTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(todoistAdapter, config);
}
