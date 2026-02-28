/**
 * Calendly Integration Tools
 *
 * Native agent tools for Calendly API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { calendlyAdapter } from '../../../mcp/adapters/calendly.adapter.js';

export function createCalendlyTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(calendlyAdapter, config);
}
