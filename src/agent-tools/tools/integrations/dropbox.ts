/**
 * Dropbox Integration Tools
 *
 * Native agent tools for Dropbox API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { dropboxAdapter } from '../../../mcp/adapters/dropbox.adapter.js';

export function createDropboxStorageTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(dropboxAdapter, config);
}
