/**
 * Sentry Error Tracking Integration Tools
 *
 * Native agent tools for Sentry Error Tracking API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { sentryAdapter } from '../../../mcp/adapters/sentry.adapter.js';

export function createSentryTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(sentryAdapter, config);
}
