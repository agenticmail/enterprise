/**
 * Jira Integration Tools
 *
 * Native agent tools for Jira API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { jiraAdapter } from '../../../mcp/adapters/jira.adapter.js';

export function createJiraTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(jiraAdapter, config);
}
