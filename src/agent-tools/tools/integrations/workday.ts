/**
 * Workday Integration Tools
 *
 * Native agent tools for Workday API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { workdayAdapter } from '../../../mcp/adapters/workday.adapter.js';

export function createWorkdayTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(workdayAdapter, config);
}
