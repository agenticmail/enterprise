/**
 * Segment Integration Tools
 *
 * Native agent tools for Segment API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { segmentAdapter } from '../../../mcp/adapters/segment.adapter.js';

export function createSegmentCdpTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(segmentAdapter, config);
}
