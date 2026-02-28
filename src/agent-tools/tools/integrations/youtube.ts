/**
 * YouTube Integration Tools
 *
 * Native agent tools for YouTube API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { youtubeAdapter } from '../../../mcp/adapters/youtube.adapter.js';

export function createYoutubeTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(youtubeAdapter, config);
}
