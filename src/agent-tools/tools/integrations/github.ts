/**
 * GitHub Integration Tools
 *
 * Native agent tools for GitHub API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { githubAdapter } from '../../../mcp/adapters/github.adapter.js';

export function createGithubTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(githubAdapter, config);
}
