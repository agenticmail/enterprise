/**
 * Sanity CMS Integration Tools
 *
 * Native agent tools for Sanity CMS API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { sanityAdapter } from '../../../mcp/adapters/sanity.adapter.js';

export function createSanityTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(sanityAdapter, config);
}
