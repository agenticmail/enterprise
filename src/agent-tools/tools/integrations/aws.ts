/**
 * AWS Services Integration Tools
 *
 * Native agent tools for AWS Services API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { awsAdapter } from '../../../mcp/adapters/aws.adapter.js';

export function createAwsServicesTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(awsAdapter, config);
}
