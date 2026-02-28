/**
 * Cloudflare Integration Tools
 *
 * Native agent tools for Cloudflare API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { cloudflareAdapter } from '../../../mcp/adapters/cloudflare.adapter.js';

export function createCloudflareCdnTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(cloudflareAdapter, config);
}
