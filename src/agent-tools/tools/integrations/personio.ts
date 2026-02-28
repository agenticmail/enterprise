/**
 * Personio Integration Tools
 *
 * Native agent tools for Personio API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { personioAdapter } from '../../../mcp/adapters/personio.adapter.js';

export function createPersonioTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(personioAdapter, config);
}
