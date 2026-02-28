/**
 * Snowflake Integration Tools
 *
 * Native agent tools for Snowflake API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { snowflakeAdapter } from '../../../mcp/adapters/snowflake.adapter.js';

export function createSnowflakeWarehouseTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(snowflakeAdapter, config);
}
