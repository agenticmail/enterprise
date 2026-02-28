/**
 * MongoDB Atlas Integration Tools
 *
 * Native agent tools for MongoDB Atlas API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { mongodbAtlasAdapter } from '../../../mcp/adapters/mongodb-atlas.adapter.js';

export function createMongodbAtlasTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(mongodbAtlasAdapter, config);
}
