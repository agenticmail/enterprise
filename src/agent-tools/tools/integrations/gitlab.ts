/**
 * GitLab Integration Tools
 *
 * Native agent tools for GitLab API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { gitlabAdapter } from '../../../mcp/adapters/gitlab.adapter.js';

export function createGitlabCiTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(gitlabAdapter, config);
}
