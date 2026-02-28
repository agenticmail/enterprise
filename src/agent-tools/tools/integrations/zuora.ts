/**
 * Zuora Integration Tools
 *
 * Native agent tools for Zuora API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { zuoraAdapter } from '../../../mcp/adapters/zuora.adapter.js';

export function createZuoraTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(zuoraAdapter, config);
}
