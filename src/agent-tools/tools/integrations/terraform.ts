/**
 * Terraform Cloud Integration Tools
 *
 * Native agent tools for Terraform Cloud API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { terraformAdapter } from '../../../mcp/adapters/terraform.adapter.js';

export function createTerraformIacTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(terraformAdapter, config);
}
