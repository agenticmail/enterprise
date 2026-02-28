/**
 * Stripe Integration Tools
 *
 * Native agent tools for Stripe API.
 * Auto-generated from MCP adapter. Do not edit manually.
 */

import type { AnyAgentTool } from '../../types.js';
import { createToolsFromAdapter, type IntegrationConfig } from './_factory.js';
import { stripeAdapter } from '../../../mcp/adapters/stripe.adapter.js';

export function createStripeTools(config: IntegrationConfig): Promise<AnyAgentTool[]> {
  return createToolsFromAdapter(stripeAdapter, config);
}
