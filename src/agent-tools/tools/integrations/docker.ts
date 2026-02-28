/**
 * Docker Hub Integration Tools
 *
 * Native agent tools for Docker Hub API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { dockerAdapter } from '../../../mcp/adapters/docker.adapter.js';

export function createDockerContainersTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(dockerAdapter, config);
}
