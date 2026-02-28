/**
 * Contentful CMS Integration Tools
 *
 * Native agent tools for Contentful CMS API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { contentfulAdapter } from '../../../mcp/adapters/contentful.adapter.js';

export function createContentfulTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(contentfulAdapter, config);
}
