/**
 * Supabase Integration Tools
 *
 * Native agent tools for Supabase API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { supabaseAdapter } from '../../../mcp/adapters/supabase.adapter.js';

export function createSupabaseTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(supabaseAdapter, config);
}
