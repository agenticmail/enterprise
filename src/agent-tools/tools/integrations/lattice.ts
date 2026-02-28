/**
 * Lattice Performance Integration Tools
 *
 * Native agent tools for Lattice Performance API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { latticeAdapter } from '../../../mcp/adapters/lattice.adapter.js';

export function createLatticeTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(latticeAdapter, config);
}
