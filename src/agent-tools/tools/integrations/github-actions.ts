/**
 * GitHub Actions Integration Tools
 *
 * Native agent tools for GitHub Actions API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { githubActionsAdapter } from '../../../mcp/adapters/github-actions.adapter.js';

export function createGithubActionsTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(githubActionsAdapter, config);
}
