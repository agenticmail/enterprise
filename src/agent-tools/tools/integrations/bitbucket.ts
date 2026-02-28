/**
 * Bitbucket Integration Tools
 *
 * Native agent tools for Bitbucket API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { bitbucketAdapter } from '../../../mcp/adapters/bitbucket.adapter.js';

export function createBitbucketReposTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(bitbucketAdapter, config);
}
