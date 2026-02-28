/**
 * HashiCorp Vault Integration Tools
 *
 * Native agent tools for HashiCorp Vault API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { hashicorpVaultAdapter } from '../../../mcp/adapters/hashicorp-vault.adapter.js';

export function createHashicorpVaultTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(hashicorpVaultAdapter, config);
}
