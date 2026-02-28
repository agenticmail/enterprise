/**
 * Auth0 Integration Tools
 *
 * Native agent tools for Auth0 API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { auth0Adapter } from '../../../mcp/adapters/auth0.adapter.js';

export function createAuth0Tools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(auth0Adapter, config);
}
