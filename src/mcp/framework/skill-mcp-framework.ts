/**
 * MCP Skill Framework — Core Orchestrator
 *
 * Loads skill adapters, resolves credentials from the vault,
 * creates per-adapter API executors, and registers tools with
 * the MCP server. One unified server process serves all skills.
 *
 * Integrates:
 *   - OAuth token auto-refresh (proactive + reactive on 401)
 *   - Per-adapter rate limiting (token bucket)
 *   - Skill config loading from community_skill_installed table
 */

import type { SecureVault } from '../../engine/vault.js';
import type { SkillAdapter, ToolExecutionContext, ResolvedCredentials } from './types.js';
import { CredentialResolver } from './credential-resolver.js';
import { SkillApiExecutor } from './api-executor.js';
import { OAuthTokenManager } from './oauth-token-manager.js';
import { RateLimiter } from '../../lib/resilience.js';

export interface FrameworkConfig {
  vault: SecureVault;
  orgId: string;
  agentId: string;
  /** Installed skill configs keyed by skillId */
  skillConfigs?: Record<string, Record<string, any>>;
}

export class SkillMcpFramework {
  private adapters = new Map<string, SkillAdapter>();
  private credentialResolver: CredentialResolver;
  private tokenManager: OAuthTokenManager;
  private resolvedCredentials = new Map<string, ResolvedCredentials>();
  private executors = new Map<string, SkillApiExecutor>();
  private orgId: string;
  private agentId: string;
  private skillConfigs: Record<string, Record<string, any>>;

  constructor(private config: FrameworkConfig) {
    this.credentialResolver = new CredentialResolver(config.vault);
    this.tokenManager = new OAuthTokenManager(config.vault, config.orgId);
    this.orgId = config.orgId;
    this.agentId = config.agentId;
    this.skillConfigs = config.skillConfigs || {};
  }

  /**
   * Register a skill adapter.
   */
  register(adapter: SkillAdapter): void {
    this.adapters.set(adapter.skillId, adapter);
  }

  /**
   * Register multiple adapters at once.
   */
  registerAll(adapters: SkillAdapter[]): void {
    for (const a of adapters) this.register(a);
  }

  /**
   * Initialize all adapters: resolve credentials, build executors.
   * Returns a map of skillId → registered tool IDs.
   * Skills that fail to initialize (e.g. missing credentials) are skipped with a warning.
   */
  async initialize(): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();

    for (const [skillId, adapter] of this.adapters) {
      try {
        // Resolve credentials from vault
        const credentials = await this.credentialResolver.resolve(
          this.orgId, skillId, adapter.auth,
        );
        this.resolvedCredentials.set(skillId, credentials);

        // Build auth headers
        const authHeaders = this.credentialResolver.buildHeaders(credentials, adapter.auth);

        // Optional adapter-level initialization (e.g. Salesforce sets dynamic baseUrl)
        if (adapter.initialize) {
          await adapter.initialize(credentials);
        }

        // Build rate limiter from adapter config
        let rateLimiter: RateLimiter | undefined;
        if (adapter.rateLimits) {
          const rps = adapter.rateLimits.requestsPerSecond ?? 10;
          const burst = adapter.rateLimits.burstLimit ?? Math.max(rps * 2, 20);
          rateLimiter = new RateLimiter({ maxTokens: burst, refillRate: rps });
        }

        // Create the API executor for this adapter
        const executor = new SkillApiExecutor({
          baseUrl: adapter.baseUrl,
          headers: { ...authHeaders, ...(adapter.defaultHeaders || {}) },
          rateLimiter,
          skillId: adapter.skillId,
        });
        this.executors.set(skillId, executor);

        result.set(skillId, Object.keys(adapter.tools));
        console.log(
          `[mcp-skills] ${adapter.name}: ${Object.keys(adapter.tools).length} tools ready`,
        );
      } catch (err: any) {
        console.warn(
          `[mcp-skills] Skipping ${skillId}: ${err.message}`,
        );
      }
    }

    return result;
  }

  /**
   * Build a new executor for a skill with updated credentials.
   * Used after token refresh to replace the expired executor.
   */
  private rebuildExecutor(skillId: string, adapter: SkillAdapter, credentials: ResolvedCredentials): SkillApiExecutor {
    const authHeaders = this.credentialResolver.buildHeaders(credentials, adapter.auth);
    const oldExecutor = this.executors.get(skillId);
    const executor = new SkillApiExecutor({
      baseUrl: adapter.baseUrl,
      headers: { ...authHeaders, ...(adapter.defaultHeaders || {}) },
      rateLimiter: oldExecutor?.limiter,
      skillId: adapter.skillId,
    });
    this.executors.set(skillId, executor);
    this.resolvedCredentials.set(skillId, credentials);
    return executor;
  }

  /**
   * Get all initialized tool definitions for MCP registration.
   * Returns an array of { toolId, description, inputSchema, handler }.
   *
   * Each handler wraps the adapter's execute() with:
   *   - Proactive token refresh (checks expiresAt before each call)
   *   - Reactive refresh (on 401, attempt one refresh + retry)
   */
  getTools(): Array<{
    toolId: string;
    skillId: string;
    description: string;
    inputSchema: Record<string, any>;
    handler: (args: Record<string, any>) => Promise<{ content: string; isError?: boolean }>;
  }> {
    const tools: ReturnType<typeof this.getTools> = [];

    for (const [skillId, adapter] of this.adapters) {
      const initialCreds = this.resolvedCredentials.get(skillId);
      const initialExecutor = this.executors.get(skillId);
      if (!initialCreds || !initialExecutor) continue; // Skip uninitialized adapters

      for (const [toolId, handler] of Object.entries(adapter.tools)) {
        tools.push({
          toolId,
          skillId,
          description: handler.description || `${adapter.name}: ${toolId}`,
          inputSchema: handler.inputSchema,
          handler: async (args: Record<string, any>) => {
            // Resolve current credentials (may have been refreshed since initialization)
            let credentials = this.resolvedCredentials.get(skillId) ?? initialCreds;
            let executor = this.executors.get(skillId) ?? initialExecutor;

            // Proactive token refresh: check if token expires within 5 minutes
            if (this.tokenManager.needsRefresh(credentials)) {
              try {
                credentials = await this.tokenManager.refreshToken(skillId, credentials, adapter.auth);
                executor = this.rebuildExecutor(skillId, adapter, credentials);
              } catch (refreshErr: any) {
                console.warn(`[mcp-skills] Proactive refresh failed for ${skillId}: ${refreshErr.message}`);
              }
            }

            const ctx: ToolExecutionContext = {
              credentials,
              skillConfig: this.skillConfigs[skillId] || {},
              orgId: this.orgId,
              agentId: this.agentId,
              apiExecutor: executor,
            };

            try {
              const result = await handler.execute(args, ctx);
              return { content: result.content, isError: result.isError };
            } catch (err: any) {
              // Reactive refresh: on 401 with a refresh token, try once
              if ((err as any).status === 401 && credentials.refreshToken) {
                try {
                  const refreshed = await this.tokenManager.refreshToken(skillId, credentials, adapter.auth);
                  const newExecutor = this.rebuildExecutor(skillId, adapter, refreshed);
                  const retryCtx: ToolExecutionContext = {
                    ...ctx,
                    credentials: refreshed,
                    apiExecutor: newExecutor,
                  };
                  const result = await handler.execute(args, retryCtx);
                  return { content: result.content, isError: result.isError };
                } catch (retryErr: any) {
                  return { content: `Error (${skillId}/${toolId}): ${retryErr.message}`, isError: true };
                }
              }
              return { content: `Error (${skillId}/${toolId}): ${err.message}`, isError: true };
            }
          },
        });
      }
    }

    return tools;
  }

  /**
   * Get status of all registered adapters.
   */
  getStatus(): Array<{ skillId: string; name: string; ready: boolean; toolCount: number }> {
    return Array.from(this.adapters.entries()).map(([skillId, adapter]) => ({
      skillId,
      name: adapter.name,
      ready: this.executors.has(skillId),
      toolCount: Object.keys(adapter.tools).length,
    }));
  }
}
