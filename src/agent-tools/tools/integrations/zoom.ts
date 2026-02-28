/**
 * Zoom Meetings Integration Tools
 *
 * Native agent tools for Zoom Meetings API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { zoomAdapter } from '../../../mcp/adapters/zoom.adapter.js';

export function createZoomMeetingsTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(zoomAdapter, config);
}
