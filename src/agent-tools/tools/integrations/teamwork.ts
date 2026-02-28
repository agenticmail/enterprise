/**
 * Teamwork Integration Tools
 *
 * Native agent tools for Teamwork API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { teamworkAdapter } from '../../../mcp/adapters/teamwork.adapter.js';

export function createTeamworkTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(teamworkAdapter, config);
}
