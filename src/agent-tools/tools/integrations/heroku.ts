/**
 * Heroku Integration Tools
 *
 * Native agent tools for Heroku API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { herokuAdapter } from '../../../mcp/adapters/heroku.adapter.js';

export function createHerokuTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(herokuAdapter, config);
}
