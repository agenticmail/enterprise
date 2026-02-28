/**
 * CircleCI Integration Tools
 *
 * Native agent tools for CircleCI API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { circleciAdapter } from '../../../mcp/adapters/circleci.adapter.js';

export function createCircleciPipelinesTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(circleciAdapter, config);
}
