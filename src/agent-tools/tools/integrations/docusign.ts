/**
 * DocuSign Integration Tools
 *
 * Native agent tools for DocuSign API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { docusignAdapter } from '../../../mcp/adapters/docusign.adapter.js';

export function createDocusignEsignTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(docusignAdapter, config);
}
