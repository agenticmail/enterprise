/**
 * Airtable Integration Tools
 *
 * Native agent tools for Airtable API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { airtableAdapter } from '../../../mcp/adapters/airtable.adapter.js';

export function createAirtableBasesTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(airtableAdapter, config);
}
