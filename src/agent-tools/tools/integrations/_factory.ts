/**
 * Integration Tool Factory
 *
 * Converts an MCP SkillAdapter into native AnyAgentTool[].
 * Each integration file imports its adapter and calls this factory.
 * The factory handles credential resolution, API execution, and error handling.
 */

import type { AnyAgentTool } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { SkillAdapter, ResolvedCredentials } from '../../../mcp/framework/types.js';

export interface IntegrationConfig {
  /** SecureVault instance */
  vault: any;
  /** Organization ID */
  orgId?: string;
  /** Agent ID */
  agentId?: string;
}

/**
 * Create native agent tools from an MCP skill adapter.
 * Returns empty array if credentials aren't configured.
 */
export async function createToolsFromAdapter(
  adapter: SkillAdapter,
  config: IntegrationConfig,
): Promise<AnyAgentTool[]> {
  const orgId = config.orgId || 'default';

  // Resolve credentials from vault
  let credentials: ResolvedCredentials;
  try {
    const { CredentialResolver } = await import('../../../mcp/framework/credential-resolver.js');
    const resolver = new CredentialResolver(config.vault);
    credentials = await resolver.resolve(orgId, adapter.skillId, adapter.auth);
  } catch {
    // No credentials configured — skip silently
    return [];
  }

  // Build API executor
  const { CredentialResolver } = await import('../../../mcp/framework/credential-resolver.js');
  const resolver = new CredentialResolver(config.vault);
  const authHeaders = resolver.buildHeaders(credentials, adapter.auth);

  // Optional adapter-level init (e.g., Salesforce sets dynamic baseUrl)
  if (adapter.initialize) {
    await adapter.initialize(credentials);
  }

  const { SkillApiExecutor } = await import('../../../mcp/framework/api-executor.js');
  const { RateLimiter } = await import('../../../lib/resilience.js');

  let rateLimiter: InstanceType<typeof RateLimiter> | undefined;
  if (adapter.rateLimits) {
    const rps = adapter.rateLimits.requestsPerSecond ?? 10;
    const burst = adapter.rateLimits.burstLimit ?? Math.max(rps * 2, 20);
    rateLimiter = new RateLimiter({ maxTokens: burst, refillRate: rps });
  }

  const executor = new SkillApiExecutor({
    baseUrl: adapter.baseUrl,
    headers: { ...authHeaders, ...(adapter.defaultHeaders || {}) },
    rateLimiter,
    skillId: adapter.skillId,
  });

  const ctx = {
    credentials,
    skillConfig: {},
    orgId,
    agentId: config.agentId || 'agent',
    apiExecutor: executor,
  };

  // Convert each tool handler to a native AnyAgentTool
  return Object.entries(adapter.tools).map(([toolId, handler]) => ({
    name: toolId,
    description: handler.description || `${adapter.name}: ${toolId}`,
    category: 'utility' as const,
    parameters: {
      type: 'object' as const,
      properties: handler.inputSchema.properties || {},
      required: handler.inputSchema.required || [],
    },
    async execute(_id: string, params: any) {
      try {
        const result = await handler.execute(params, ctx);
        if (result.isError) return errorResult(result.content);
        try {
          return jsonResult(JSON.parse(result.content));
        } catch {
          return { content: [{ type: 'text' as const, text: result.content }] };
        }
      } catch (e: any) {
        return errorResult(`${adapter.skillId} error: ${e.message}`);
      }
    },
  }));
}
