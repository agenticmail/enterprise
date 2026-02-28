/**
 * Shortcut Integration Tools
 *
 * Native agent tools for Shortcut API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { shortcutAdapter } from '../../../mcp/adapters/shortcut.adapter.js';

export function createShortcutTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(shortcutAdapter, config);
}
