/**
 * Azure DevOps Integration Tools
 *
 * Native agent tools for Azure DevOps API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { azureDevopsAdapter } from '../../../mcp/adapters/azure-devops.adapter.js';

export function createAzureDevopsTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(azureDevopsAdapter, config);
}
