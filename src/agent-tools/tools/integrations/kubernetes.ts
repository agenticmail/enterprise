/**
 * Kubernetes Integration Tools
 *
 * Native agent tools for Kubernetes API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { kubernetesAdapter } from '../../../mcp/adapters/kubernetes.adapter.js';

export function createKubernetesClusterTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(kubernetesAdapter, config);
}
