/**
 * Internal Hook System
 *
 * Direct in-process calls to engine modules for the agent runtime.
 * No HTTP overhead — permissions, DLP, guardrails, journal, activity,
 * memory, policies, and communication are all called directly.
 */

import type { AgentMessage, RuntimeHooks, ToolCallContext, HookResult, ToolCallResult, BudgetCheckResult } from './types.js';

// ─── Types ───────────────────────────────────────────────

export interface HookDependencies {
  /** Engine DB instance */
  engineDb: import('../engine/db-adapter.js').EngineDatabase;
  /** Agent ID for all hook calls */
  agentId: string;
  /** Organization ID */
  orgId: string;
  /** Fail open or closed when hooks error */
  failMode?: 'open' | 'closed';
  /** Enable knowledge base context injection */
  knowledgeBaseEnabled?: boolean;
  /** Enable memory context injection */
  memoryEnabled?: boolean;
  /** Enable policy context injection */
  policyEnabled?: boolean;
  /** Enable DLP scanning */
  dlpEnabled?: boolean;
  /** Enable guardrail checks */
  guardrailsEnabled?: boolean;
}

// ─── Permission Cache ────────────────────────────────────

var permissionCache = new Map<string, { result: HookResult; expires: number }>();
var PERMISSION_CACHE_TTL_MS = 30_000;

function getCachedPermission(cacheKey: string): HookResult | null {
  var cached = permissionCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.result;
  permissionCache.delete(cacheKey);
  return null;
}

function setCachedPermission(cacheKey: string, result: HookResult): void {
  permissionCache.set(cacheKey, { result, expires: Date.now() + PERMISSION_CACHE_TTL_MS });
}

// ─── External Action Classification ─────────────────────

var EXTERNAL_TOOLS = new Set([
  'ent_http_request', 'ent_http_graphql', 'ent_http_batch', 'ent_http_download',
  'ent_email_send', 'ent_notification_send', 'ent_notification_broadcast',
  'ent_notification_webhook', 'ent_notification_escalate',
  'ent_workflow_request', 'ent_workflow_remind',
  'ent_finance_expense', 'ent_finance_invoice',
  'web_fetch', 'web_search', 'browser',
  'agenticmail_reply', 'agenticmail_send', 'agenticmail_forward',
  'bash',
]);

var COMMUNICATION_TOOLS = new Set([
  'agenticmail_reply', 'agenticmail_send', 'agenticmail_forward',
  'ent_notification_send', 'ent_notification_broadcast',
  'agent_message_send', 'agent_message_broadcast',
]);

// ─── Create Runtime Hooks ────────────────────────────────

export function createRuntimeHooks(deps: HookDependencies): RuntimeHooks {
  var failMode = deps.failMode ?? 'open';

  return {
    // ─── Before LLM Call ────────────────────────────
    async beforeLLMCall(messages, agentId, _sessionId): Promise<AgentMessage[]> {
      var injectedMessages = [...messages];

      // Inject knowledge base context
      if (deps.knowledgeBaseEnabled !== false) {
        try {
          var { knowledgeBase } = await import('../engine/routes.js');
          var kbs = await knowledgeBase.listForAgent(agentId);
          if (kbs.length > 0) {
            var contextParts: string[] = [];
            for (var kb of kbs) {
              // Search for relevant context based on the last user message
              var lastUserMsg = '';
              for (var i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'user') {
                  lastUserMsg = typeof messages[i].content === 'string'
                    ? messages[i].content as string
                    : '';
                  break;
                }
              }
              if (lastUserMsg) {
                var results = await knowledgeBase.search(kb.id, lastUserMsg, { limit: 3 });
                for (var r of results) {
                  contextParts.push(`[KB: ${kb.name}] ${r.content}`);
                }
              }
            }
            if (contextParts.length > 0) {
              var kbContext = `[Knowledge Base Context]\n${contextParts.join('\n\n')}`;
              // Inject as system message before the last user message
              injectedMessages.splice(injectedMessages.length - 1, 0, {
                role: 'system',
                content: kbContext,
              });
            }
          }
        } catch { /* non-blocking */ }
      }

      // Inject agent memory context
      if (deps.memoryEnabled !== false) {
        try {
          var { memoryManager } = await import('../engine/routes.js');
          var memories = await memoryManager.queryMemories({
            agentId,
            limit: 10,
            sortBy: 'importance',
          });
          if (memories.length > 0) {
            var memoryContext = `[Agent Memory]\n${memories.map(function(m: any) { return `- [${m.category}] ${m.title}: ${m.content.slice(0, 200)}`; }).join('\n')}`;
            injectedMessages.splice(injectedMessages.length - 1, 0, {
              role: 'system',
              content: memoryContext,
            });
          }
        } catch { /* non-blocking */ }
      }

      // Inject organization policy context
      if (deps.policyEnabled !== false) {
        try {
          var { policyEngine } = await import('../engine/routes.js');
          var policies = await policyEngine.getAgentPolicies(agentId, deps.orgId);
          if (policies.length > 0) {
            var policyText = policies.map(function(p: any) {
              return `[Policy: ${p.name}] (${p.enforcement}) ${p.content.slice(0, 300)}`;
            }).join('\n\n');
            var policyContext = `[Organization Policies]\nYou must follow these policies:\n\n${policyText}`;
            // Insert after system prompt, before conversation
            var insertIdx = 0;
            for (var j = 0; j < injectedMessages.length; j++) {
              if (injectedMessages[j].role === 'system') insertIdx = j + 1;
              else break;
            }
            injectedMessages.splice(insertIdx, 0, { role: 'system', content: policyContext });
          }
        } catch { /* non-blocking */ }
      }

      return injectedMessages;
    },

    // ─── Budget Check ──────────────────────────────
    async checkBudget(agentId, _orgId, _estimatedTokens): Promise<BudgetCheckResult> {
      try {
        var { lifecycle } = await import('../engine/routes.js');

        // ── Sync budget config from DB (at most once per 60s to avoid hammering DB) ──
        var now = Date.now();
        var cacheKey = `budget_sync_${agentId}`;
        var lastSync = (globalThis as any)[cacheKey] || 0;
        if (now - lastSync > 60_000) {
          (globalThis as any)[cacheKey] = now;
          try {
            var freshAgent = await lifecycle.loadAgentFromDb(agentId);
            if (freshAgent) {
              var existingAgent = lifecycle.getAgent(agentId);
              if (existingAgent) {
                if (freshAgent.budgetConfig) {
                  existingAgent.budgetConfig = freshAgent.budgetConfig;
                }
                // Also sync usage from DB in case it was reset externally
                if (freshAgent.usage) {
                  existingAgent.usage = freshAgent.usage;
                }
                console.log(`[budget] Synced from DB — budget: daily=${freshAgent.budgetConfig?.dailyTokenCap || freshAgent.budgetConfig?.dailyTokens || 0}, monthly=${freshAgent.budgetConfig?.monthlyTokenCap || freshAgent.budgetConfig?.monthlyTokens || 0}, usage: tokensToday=${freshAgent.usage?.tokensToday || 0}, tokensMonth=${freshAgent.usage?.tokensThisMonth || freshAgent.usage?.monthlyTokens || 0}`);
              }
            }
          } catch {}
        }

        // ── Daily reset check (in case workforce didn't trigger it) ──
        var usage = lifecycle.getUsage(agentId);
        if (usage) {
          var lastUpdated = (usage as any).lastUpdated || '';
          var todayKey = new Date().toISOString().slice(0, 10);
          var lastKey = lastUpdated ? new Date(lastUpdated).toISOString().slice(0, 10) : todayKey;
          if (lastKey < todayKey) {
            console.log(`[budget] Daily reset triggered for agent ${agentId} (last update: ${lastKey}, today: ${todayKey})`);
            usage.tokensToday = 0;
            usage.costToday = 0;
            usage.errorsToday = 0;
            usage.toolCallsToday = 0;
            usage.externalActionsToday = 0;
            (usage as any).totalSessionsToday = 0;
          }
        }

        var budget = lifecycle.getBudget(agentId);
        if (!budget) return { allowed: true };

        if (!usage) return { allowed: true };

        // Resolve field names (DB uses multiple naming conventions)
        var u = usage as any;
        var b = budget as any;
        var dailySpend = u.costToday ?? u.dailyCostUsd ?? 0;
        var monthlySpend = u.costThisMonth ?? u.monthlyCostUsd ?? 0;
        var _weeklySpend = u.costThisWeek ?? 0;
        var dailyTokens = u.tokensToday ?? u.dailyTokens ?? 0;
        var monthlyTokens = u.tokensThisMonth ?? u.monthlyTokens ?? 0;

        // Resolve budget caps (DB stores as dailyCost/dailyTokens OR dailyCostCap/dailyTokenCap)
        var dailyCostLimit = b.dailyCostCap || b.dailyCost || b.dailyLimitUsd || 0;
        var monthlyCostLimit = b.monthlyCostCap || b.monthlyCost || b.monthlyLimitUsd || 0;
        var dailyTokenLimit = b.dailyTokenCap || b.dailyTokens || 0;
        var monthlyTokenLimit = b.monthlyTokenCap || b.monthlyTokens || 0;

        // Check cost limits (0 = unlimited)
        if (dailyCostLimit > 0 && dailySpend >= dailyCostLimit) {
          return {
            allowed: false,
            reason: `Daily cost budget exceeded: $${dailySpend.toFixed(2)} / $${dailyCostLimit.toFixed(2)}`,
            remainingUsd: 0,
          };
        }
        if (monthlyCostLimit > 0 && monthlySpend >= monthlyCostLimit) {
          return {
            allowed: false,
            reason: `Monthly cost budget exceeded: $${monthlySpend.toFixed(2)} / $${monthlyCostLimit.toFixed(2)}`,
            remainingUsd: 0,
          };
        }

        // Check token limits (0 = unlimited)
        if (dailyTokenLimit > 0 && dailyTokens >= dailyTokenLimit) {
          return {
            allowed: false,
            reason: `Daily token budget exceeded: ${(dailyTokens/1e6).toFixed(1)}M / ${(dailyTokenLimit/1e6).toFixed(1)}M tokens`,
            remainingUsd: 0,
          };
        }
        if (monthlyTokenLimit > 0 && monthlyTokens >= monthlyTokenLimit) {
          return {
            allowed: false,
            reason: `Monthly token budget exceeded: ${(monthlyTokens/1e6).toFixed(1)}M / ${(monthlyTokenLimit/1e6).toFixed(1)}M tokens`,
            remainingUsd: 0,
          };
        }

        // Calculate remaining
        var remaining = Infinity;
        if (dailyCostLimit > 0) remaining = Math.min(remaining, dailyCostLimit - dailySpend);
        if (monthlyCostLimit > 0) remaining = Math.min(remaining, monthlyCostLimit - monthlySpend);
        if (remaining === Infinity) remaining = 100; // no cost limit set

        return { allowed: true, remainingUsd: remaining };
      } catch (err) {
        console.error(`[hooks] Budget check failed: ${(err as Error).message}`);
        // Fail CLOSED for budget — if we can't check, deny
        return { allowed: false, reason: 'Budget check error — denying for safety' };
      }
    },

    // ─── Record LLM Usage ──────────────────────────
    async recordLLMUsage(agentId, orgId, usage): Promise<void> {
      try {
        var { lifecycle } = await import('../engine/routes.js');
        console.log(`[hooks] recordLLMUsage: agent=${agentId}, input=${usage.inputTokens}, output=${usage.outputTokens}`);
        await lifecycle.recordLLMUsage(agentId, {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd: usage.costUsd,
        });
      } catch (recordErr: any) { console.log(`[hooks] recordLLMUsage error: ${recordErr.message}`); }

      // Also record as activity event
      try {
        var { activity } = await import('../engine/routes.js');
        await activity.record({
          agentId,
          orgId,
          type: 'llm_call',
          data: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            costUsd: usage.costUsd,
          },
        });
      } catch { /* non-blocking */ }
    },

    // ─── Model Pricing Lookup ──────────────────────
    async getModelPricing(provider, modelId) {
      try {
        // Import getSettings from admin DB if available
        var adminDb = deps.engineDb as any;
        // Try to query the model_pricing_config from company_settings
        var rows = await adminDb.query(
          `SELECT model_pricing_config FROM company_settings LIMIT 1`,
          [],
        );
        if (rows && rows.length > 0) {
          var raw = (rows[0] as any).model_pricing_config;
          if (raw) {
            var config = typeof raw === 'string' ? JSON.parse(raw) : raw;
            var models = config.models || [];
            var match = models.find(function(m: any) {
              return m.provider === provider && m.modelId === modelId;
            });
            if (match) {
              return {
                inputCostPerMillion: match.inputCostPerMillion,
                outputCostPerMillion: match.outputCostPerMillion,
              };
            }
          }
        }
      } catch { /* fall through to null */ }
      return null;
    },

    // ─── Before Tool Call ───────────────────────────
    async beforeToolCall(ctx: ToolCallContext): Promise<HookResult> {
      try {
        // Check permission cache
        var cacheKey = `${ctx.agentId}:${ctx.toolName}`;
        var cached = getCachedPermission(cacheKey);
        if (cached) return cached;

        // Permission check
        var { permissionEngine } = await import('../engine/routes.js');
        var permResult = await permissionEngine.checkPermission(ctx.agentId, ctx.toolName);

        var result: HookResult = {
          allowed: permResult.allowed,
          reason: permResult.reason || 'Permission check',
          requiresApproval: permResult.requiresApproval || false,
        };

        // Guardrail check — is agent paused/off-duty?
        if (result.allowed && deps.guardrailsEnabled !== false) {
          try {
            var { guardrails } = await import('../engine/routes.js');
            var status = await guardrails.getStatus(ctx.agentId);
            if (status.paused || status.offDuty) {
              result.allowed = false;
              result.reason = status.offDuty
                ? 'Agent is off duty — outside scheduled working hours'
                : 'Agent is paused by guardrail intervention';
              return result;
            }
          } catch { /* non-blocking */ }
        }

        // DLP scan — check parameters for sensitive data
        if (result.allowed && deps.dlpEnabled !== false && ctx.parameters) {
          try {
            var { dlp } = await import('../engine/routes.js');
            var dlpResult = await dlp.scanParameters({
              orgId: ctx.orgId,
              agentId: ctx.agentId,
              toolId: ctx.toolName,
              parameters: ctx.parameters,
            });
            if (dlpResult && !dlpResult.allowed) {
              result.allowed = false;
              result.reason = dlpResult.reason || 'Blocked by DLP policy';
              return result;
            }
            if (dlpResult?.modifiedContent) {
              result.modifiedParameters = dlpResult.modifiedContent;
            }
          } catch { /* non-blocking */ }
        }

        // Approval workflow
        if (result.requiresApproval && result.allowed) {
          try {
            var { approvals } = await import('../engine/routes.js');
            var approval = await approvals.createAndWait({
              agentId: ctx.agentId,
              orgId: ctx.orgId,
              toolId: ctx.toolName,
              toolName: ctx.toolName,
              parameters: ctx.parameters,
              reason: `Agent ${ctx.agentId} requests approval for ${ctx.toolName}`,
            });
            if (approval && (approval.status === 'denied' || approval.status === 'expired')) {
              result.allowed = false;
              result.reason = approval.status === 'expired'
                ? 'Approval request expired'
                : `Denied: ${approval.decision?.reason || 'No reason'}`;
            }
            if (approval) result.approvalId = approval.id;
          } catch { /* non-blocking — if approvals fail, allow */ }
        }

        setCachedPermission(cacheKey, result);
        return result;

      } catch (err: any) {
        var allowed = failMode === 'open';
        return {
          allowed,
          reason: allowed
            ? `Hook error (fail-open): ${err.message}`
            : `Hook error (fail-closed): ${err.message}`,
        };
      }
    },

    // ─── After Tool Call ────────────────────────────
    async afterToolCall(ctx: ToolCallContext, result: ToolCallResult): Promise<void> {
      // Record activity
      try {
        var { activity } = await import('../engine/routes.js');
        await activity.record({
          agentId: ctx.agentId,
          orgId: ctx.orgId,
          sessionId: ctx.sessionId,
          type: result.success ? 'tool_call_end' : 'tool_call_error',
          data: {
            toolId: ctx.toolName,
            toolName: ctx.toolName,
            success: result.success,
            error: result.error,
            durationMs: result.durationMs,
          },
        });
      } catch { /* non-blocking */ }

      // Record tool call for lifecycle/budget tracking
      try {
        var { lifecycle } = await import('../engine/routes.js');
        await lifecycle.recordToolCall(ctx.agentId, {
          toolId: ctx.toolName,
          tokensUsed: 0,
          costUsd: 0,
          isExternalAction: EXTERNAL_TOOLS.has(ctx.toolName),
          error: !result.success,
        });
      } catch { /* non-blocking */ }

      // Journal — record external actions for rollback
      if (result.success && EXTERNAL_TOOLS.has(ctx.toolName)) {
        try {
          var { journal } = await import('../engine/routes.js');
          await journal.record({
            orgId: ctx.orgId,
            agentId: ctx.agentId,
            sessionId: ctx.sessionId,
            toolId: ctx.toolName,
            toolName: ctx.toolName,
            parameters: ctx.parameters,
            result: result.output,
          });
        } catch { /* non-blocking */ }
      }

      // Communication observer
      if (result.success && COMMUNICATION_TOOLS.has(ctx.toolName)) {
        try {
          var { commBus } = await import('../engine/routes.js');
          await commBus.observeMessage({
            orgId: ctx.orgId,
            agentId: ctx.agentId,
            toolId: ctx.toolName,
            parameters: ctx.parameters,
          });
        } catch { /* non-blocking */ }
      }
    },

    // ─── Session Lifecycle ──────────────────────────
    async onSessionStart(sessionId, agentId, orgId): Promise<void> {
      try {
        var { activity } = await import('../engine/routes.js');
        await activity.record({
          agentId,
          orgId,
          sessionId,
          type: 'session_start',
          data: { sessionId },
        });
      } catch { /* non-blocking */ }
    },

    async onSessionEnd(sessionId, agentId, orgId): Promise<void> {
      try {
        var { activity } = await import('../engine/routes.js');
        await activity.record({
          agentId,
          orgId,
          sessionId,
          type: 'session_end',
          data: { sessionId },
        });
      } catch { /* non-blocking */ }
    },

    // ─── Context Compaction ─────────────────────────
    async onContextCompaction(sessionId, agentId, summary): Promise<void> {
      // Save compaction summary to persistent agent memory
      try {
        var { memoryManager } = await import('../engine/routes.js');
        await memoryManager.createMemory({
          agentId,
          orgId: deps.orgId,
          category: 'session_learning',
          title: `Context compaction — session ${sessionId || 'unknown'} (${new Date().toISOString()})`,
          content: summary.slice(0, 10_000), // Keep up to 10K chars of summary
          source: 'context_compaction',
          importance: 'high', // High importance — this is the agent's working memory
        });
      } catch (err: any) {
        console.warn(`[hooks] Failed to persist compaction summary: ${err?.message}`);
      }

      // Link compaction to task pipeline — update task progress with compaction event
      try {
        var { TaskQueueManager } = await import('../engine/task-queue.js');
        var tq = new TaskQueueManager();
        (tq as any).db = deps.engineDb;
        await tq.init();
        var sessionTask = await tq.getTaskBySessionId(sessionId);
        if (sessionTask) {
          await tq.updateTask(sessionTask.id, {
            activityLog: [...(sessionTask.activityLog || []), {
              ts: new Date().toISOString(),
              type: 'compaction',
              agent: agentId,
              detail: `Context compacted (${summary.length} chars summary). Agent continues from compacted state.`,
            }],
          });
          console.log(`[hooks] Task ${sessionTask.id.slice(0, 8)} updated with compaction event`);
        }
      } catch { /* non-fatal */ }
    },
  };
}

/**
 * No-op hooks for testing or when hooks are disabled.
 */
export function createNoopHooks(): RuntimeHooks {
  return {
    async beforeLLMCall(messages) { return messages; },
    async checkBudget() { return { allowed: true }; },
    async recordLLMUsage() {},
    async getModelPricing() { return null; },
    async beforeToolCall() { return { allowed: true, reason: 'no-op' }; },
    async afterToolCall() {},
    async onSessionStart() {},
    async onSessionEnd() {},
    async onContextCompaction() {},
  };
}
