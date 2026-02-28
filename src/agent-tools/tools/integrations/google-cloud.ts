/**
 * Google Cloud Platform Integration Tools
 *
 * Native agent tools for Google Cloud Platform API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { googleCloudAdapter } from '../../../mcp/adapters/google-cloud.adapter.js';

export function createGoogleCloudTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(googleCloudAdapter, config);
}
