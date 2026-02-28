/**
 * Firebase Integration Tools
 *
 * Native agent tools for Firebase API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { firebaseAdapter } from '../../../mcp/adapters/firebase.adapter.js';

export function createFirebaseTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(firebaseAdapter, config);
}
