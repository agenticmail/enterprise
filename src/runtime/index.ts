/**
 * AgenticMail Agent Runtime — Public API
 *
 * Standalone agent runtime for AgenticMail Enterprise.
 * Runs agents entirely in-process with the enterprise engine.
 * Built for long-running tasks (hours) with:
 *   - Incremental message persistence (crash recovery)
 *   - Session resume on startup
 *   - Heartbeat + stale session detection
 *   - LLM retry with exponential backoff
 *   - Budget gates before every LLM call
 *   - SSE keepalive streaming
 *
 * @example
 * ```ts
 * import { createAgentRuntime } from '@agenticmail/enterprise';
 *
 * const runtime = createAgentRuntime({
 *   engineDb: db,
 *   apiKeys: { anthropic: process.env.ANTHROPIC_API_KEY },
 * });
 *
 * await runtime.start();
 * const session = await runtime.spawnSession({
 *   agentId: 'agent-1',
 *   message: 'Hello!',
 * });
 * ```
 */

import type { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type {
  RuntimeConfig,
  SessionState,
  SpawnOptions,
  StreamEvent,
  AgentConfig,
  ModelConfig,
  AgentMessage,
  FollowUp,
} from './types.js';
import { SessionManager } from './session-manager.js';
import { createRuntimeHooks, createNoopHooks } from './hooks.js';
import { runAgentLoop } from './agent-loop.js';
import { createAllTools } from '../agent-tools/index.js';
import { createRuntimeGateway, emitSessionEvent } from './gateway.js';
import { SubAgentManager, type SpawnSubAgentResult } from './subagent.js';
import { EmailChannel, type InboundEmail, type InboundEmailResult } from './email-channel.js';
import { FollowUpScheduler } from './followup.js';
import { resolveApiKeyForProvider, PROVIDER_REGISTRY, type CustomProviderDef } from './providers.js';

// ─── Re-exports ──────────────────────────────────────────

export type {
  AgentMessage,
  AgentConfig,
  SessionState,
  StreamEvent,
  RuntimeConfig,
  ModelConfig,
  SpawnOptions,
  RuntimeHooks,
  ToolCallContext,
  HookResult,
  ToolCallResult,
  BudgetCheckResult,
  FollowUp,
  ContentBlock,
  ToolCall,
  ToolResultMsg,
  SessionStatus,
} from './types.js';

export { SessionManager } from './session-manager.js';
export { createRuntimeHooks, createNoopHooks } from './hooks.js';
export { runAgentLoop } from './agent-loop.js';
export { callLLM, toolsToDefinitions, estimateTokens, estimateMessageTokens } from './llm-client.js';
export { ToolRegistry, executeTool } from './tool-executor.js';
export { SubAgentManager } from './subagent.js';
export { EmailChannel } from './email-channel.js';
export { FollowUpScheduler } from './followup.js';
export {
  PROVIDER_REGISTRY,
  resolveProvider,
  resolveApiKeyForProvider,
  listAllProviders,
  type ProviderDef,
  type CustomProviderDef,
  type ApiType,
} from './providers.js';

// ─── Default Model ───────────────────────────────────────

var DEFAULT_MODEL: ModelConfig = {
  provider: 'anthropic',
  modelId: 'claude-sonnet-4-5-20250929',
};

// ─── Constants ───────────────────────────────────────────

var DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;       // 30s
var DEFAULT_STALE_SESSION_TIMEOUT_MS = 5 * 60_000; // 5 min
var DEFAULT_SSE_KEEPALIVE_MS = 15_000;              // 15s

// ─── Agent Runtime ───────────────────────────────────────

export class AgentRuntime {
  private config: RuntimeConfig;
  private sessionManager: SessionManager | null = null;
  private subAgentManager: SubAgentManager;
  private followUpScheduler: FollowUpScheduler;
  private emailChannel: EmailChannel | null = null;
  private gatewayApp: Hono | null = null;
  private activeSessions = new Map<string, AbortController>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private staleCheckTimer: NodeJS.Timeout | null = null;
  private sseKeepaliveTimer: NodeJS.Timeout | null = null;
  private started = false;

  constructor(config: RuntimeConfig) {
    this.config = config;
    this.subAgentManager = new SubAgentManager();
    this.followUpScheduler = new FollowUpScheduler({
      engineDb: config.engineDb,
      onDue: async (followUp) => {
        if (followUp.sessionId) {
          await this.sendMessage(followUp.sessionId, `[Scheduled Reminder] ${followUp.message}`);
        }
      },
    });
  }

  /**
   * Start the runtime — initializes session manager, gateway, schedulers,
   * heartbeat, stale detection, and resumes active sessions.
   */
  async start(): Promise<void> {
    if (this.started) return;

    // Load custom providers from DB
    try {
      if (this.config.adminDb) {
        var settings = await this.config.adminDb.getSettings();
        var pricingConfig = (settings as any)?.modelPricingConfig;
        if (pricingConfig && pricingConfig.customProviders) {
          this.customProviders = pricingConfig.customProviders;
        }
      }
    } catch {}

    this.sessionManager = new SessionManager({ engineDb: this.config.engineDb });

    // Set up email channel
    var self = this;
    this.emailChannel = new EmailChannel({
      async resolveAgent(email) {
        try {
          var rows = await self.config.engineDb.query(
            `SELECT id, org_id FROM managed_agents WHERE config LIKE ? AND state = 'running'`,
            [`%${email}%`],
          );
          if (rows && rows.length > 0) {
            var row = rows[0] as any;
            return { agentId: row.id, orgId: row.org_id };
          }
        } catch {}
        return null;
      },
      async findActiveSession(agentId, senderEmail) {
        var sessions = await self.sessionManager!.listSessions(agentId, { status: 'active', limit: 1 });
        return sessions.length > 0 ? await self.sessionManager!.getSession(sessions[0].id) : null;
      },
      async createSession(agentId, orgId) {
        return self.sessionManager!.createSession(agentId, orgId);
      },
      async sendMessage(sessionId, message) {
        await self.sendMessage(sessionId, message);
      },
    });

    // Create gateway app
    if (this.config.gatewayEnabled !== false) {
      this.gatewayApp = createRuntimeGateway({ runtime: this });
    }

    // Start follow-up scheduler (loads pending from DB)
    await this.followUpScheduler.start();

    // Start heartbeat timer — periodically touch active sessions
    var heartbeatMs = this.config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.heartbeatTimer = setInterval(function() {
      self.emitHeartbeats().catch(function() {});
    }, heartbeatMs);
    this.heartbeatTimer.unref();

    // Start stale session detector
    var staleTimeoutMs = this.config.staleSessionTimeoutMs ?? DEFAULT_STALE_SESSION_TIMEOUT_MS;
    this.staleCheckTimer = setInterval(function() {
      self.cleanupStaleSessions(staleTimeoutMs).catch(function() {});
    }, staleTimeoutMs);
    this.staleCheckTimer.unref();

    // SSE keepalive — prevents proxy/LB from closing idle connections
    this.sseKeepaliveTimer = setInterval(function() {
      for (var [sessionId] of self.activeSessions) {
        emitSessionEvent(sessionId, {
          type: 'heartbeat',
          timestamp: Date.now(),
          activeTurns: self.activeSessions.size,
        });
      }
    }, DEFAULT_SSE_KEEPALIVE_MS);
    this.sseKeepaliveTimer.unref();

    this.started = true;
    console.log('[runtime] Agent runtime started');

    // Resume active sessions from DB (unless disabled)
    if (this.config.resumeOnStartup !== false) {
      await this.resumeActiveSessions();
    }
  }

  /**
   * Spawn a new agent session and begin processing.
   */
  async spawnSession(opts: SpawnOptions): Promise<SessionState> {
    this.ensureStarted();

    var agentId = opts.agentId;
    var orgId = opts.orgId || 'default';
    var model = opts.model || this.config.defaultModel || DEFAULT_MODEL;

    // Create session in DB
    var session = await this.sessionManager!.createSession(agentId, orgId, opts.parentSessionId);

    // Build agent config
    var tools = opts.tools || createAllTools({
      agentId,
      workspaceDir: process.cwd(),
    });

    var systemPrompt = opts.systemPrompt || buildDefaultSystemPrompt(agentId);

    var agentConfig: AgentConfig = {
      agentId,
      orgId,
      model,
      systemPrompt,
      tools,
    };

    // Resolve API key
    var apiKey = this.resolveApiKey(model.provider);
    if (!apiKey) {
      await this.sessionManager!.updateSession(session.id, { status: 'failed' });
      throw new Error(`No API key configured for provider: ${model.provider}`);
    }

    this.runSessionLoop(session.id, agentConfig, [{ role: 'user', content: opts.message }], apiKey);

    return session;
  }

  /**
   * Send a message to an active session.
   */
  async sendMessage(sessionId: string, message: string): Promise<void> {
    this.ensureStarted();

    var session = await this.sessionManager!.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (session.status !== 'active') throw new Error(`Session is not active: ${session.status}`);

    // Append user message
    await this.sessionManager!.appendMessage(sessionId, { role: 'user', content: message });

    // Resume the agent loop with the new message
    var model = this.config.defaultModel || DEFAULT_MODEL;
    var apiKey = this.resolveApiKey(model.provider);
    if (!apiKey) throw new Error(`No API key for provider: ${model.provider}`);

    var tools = createAllTools({ agentId: session.agentId, workspaceDir: process.cwd() });

    var agentConfig: AgentConfig = {
      agentId: session.agentId,
      orgId: session.orgId,
      model,
      systemPrompt: buildDefaultSystemPrompt(session.agentId),
      tools,
    };

    this.runSessionLoop(sessionId, agentConfig, session.messages, apiKey);
  }

  /**
   * Terminate an active session.
   */
  async terminateSession(sessionId: string): Promise<void> {
    var controller = this.activeSessions.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeSessions.delete(sessionId);
    }
    if (this.sessionManager) {
      await this.sessionManager.updateSession(sessionId, { status: 'completed' });
    }
  }

  /**
   * Get a session by ID.
   */
  async getSession(sessionId: string): Promise<SessionState | null> {
    this.ensureStarted();
    return this.sessionManager!.getSession(sessionId);
  }

  /**
   * List sessions for an agent.
   */
  async listSessions(agentId: string, opts?: { status?: string; limit?: number }): Promise<Omit<SessionState, 'messages'>[]> {
    this.ensureStarted();
    return this.sessionManager!.listSessions(agentId, opts);
  }

  /**
   * Spawn a sub-agent.
   */
  async spawnSubAgent(opts: {
    parentSessionId: string;
    task: string;
    agentId?: string;
    model?: ModelConfig;
  }): Promise<SpawnSubAgentResult> {
    this.ensureStarted();

    var check = this.subAgentManager.canSpawn(opts.parentSessionId);
    if (!check.allowed) {
      return { id: '', childSessionId: '', agentId: '', status: 'error', error: check.reason };
    }

    var parentSession = await this.sessionManager!.getSession(opts.parentSessionId);
    if (!parentSession) {
      return { id: '', childSessionId: '', agentId: '', status: 'error', error: 'Parent session not found' };
    }

    var agentId = opts.agentId || parentSession.agentId;
    var childSession = await this.spawnSession({
      agentId,
      orgId: parentSession.orgId,
      message: `[Sub-Agent Task] ${opts.task}`,
      model: opts.model,
      parentSessionId: opts.parentSessionId,
    });

    var id = nanoid(12);
    this.subAgentManager.register({
      id,
      parentSessionId: opts.parentSessionId,
      childSessionId: childSession.id,
      agentId,
      task: opts.task,
      status: 'active',
      createdAt: Date.now(),
    });

    return {
      id,
      childSessionId: childSession.id,
      agentId,
      status: 'accepted',
    };
  }

  /**
   * Handle inbound email.
   */
  async handleInboundEmail(email: InboundEmail): Promise<InboundEmailResult> {
    this.ensureStarted();
    if (!this.emailChannel) throw new Error('Email channel not initialized');
    return this.emailChannel.handleInbound(email);
  }

  /**
   * Schedule a follow-up.
   */
  async scheduleFollowUp(opts: { agentId: string; sessionId?: string; message: string; executeAt: Date }): Promise<string> {
    return this.followUpScheduler.schedule(opts);
  }

  /**
   * Cancel a follow-up.
   */
  async cancelFollowUp(followUpId: string): Promise<boolean> {
    return this.followUpScheduler.cancel(followUpId);
  }

  /**
   * Get the Hono sub-app for mounting.
   */
  getApp(): Hono | null {
    return this.gatewayApp;
  }

  /**
   * Get the number of active sessions.
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Stop the runtime.
   */
  async stop(): Promise<void> {
    if (!this.started) return;

    // Cancel all active sessions
    for (var [sessionId, controller] of this.activeSessions) {
      controller.abort();
    }
    this.activeSessions.clear();

    // Stop timers
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.staleCheckTimer) { clearInterval(this.staleCheckTimer); this.staleCheckTimer = null; }
    if (this.sseKeepaliveTimer) { clearInterval(this.sseKeepaliveTimer); this.sseKeepaliveTimer = null; }

    // Stop scheduler
    this.followUpScheduler.stop();

    this.started = false;
    console.log('[runtime] Agent runtime stopped');
  }

  // ─── Private: Session Loop ─────────────────────────

  /**
   * Run the agent loop for a session with all long-running features wired in:
   * incremental persistence, heartbeat, retry, budget checks.
   */
  private runSessionLoop(
    sessionId: string,
    agentConfig: AgentConfig,
    initialMessages: AgentMessage[],
    apiKey: string,
    isResume?: boolean,
  ): void {
    var self = this;

    // Create hooks
    var hooks = createRuntimeHooks({
      engineDb: this.config.engineDb,
      agentId: agentConfig.agentId,
      orgId: agentConfig.orgId,
    });

    // Create abort controller
    var abortController = new AbortController();
    this.activeSessions.set(sessionId, abortController);

    // Emit session event
    if (isResume) {
      emitSessionEvent(sessionId, { type: 'session_resumed', sessionId, turnCount: 0 });
    }

    // Notify hooks
    hooks.onSessionStart(sessionId, agentConfig.agentId, agentConfig.orgId).catch(function() {});

    // Fire and forget — the loop runs in the background
    (async function() {
      try {
        var result = await runAgentLoop(agentConfig, initialMessages, hooks, {
          apiKey,
          signal: abortController.signal,
          sessionId,
          retryConfig: self.config.retry,

          // Incremental persistence — save messages after every turn
          onCheckpoint: async function(data) {
            try {
              await self.sessionManager!.replaceMessages(sessionId, data.messages);
              await self.sessionManager!.touchSession(sessionId, {
                tokenCount: data.tokenCount,
                turnCount: data.turnCount,
              });
              emitSessionEvent(sessionId, {
                type: 'checkpoint',
                turnNumber: data.turnCount,
                tokenCount: data.tokenCount,
                messageCount: data.messages.length,
              });
            } catch (err: any) {
              console.warn(`[runtime] Checkpoint save error for ${sessionId}: ${err.message}`);
            }
          },

          // Heartbeat — keep session alive during long operations
          onHeartbeat: async function(data) {
            try {
              await self.sessionManager!.touchSession(sessionId, {
                tokenCount: data.tokenCount,
                turnCount: data.turnCount,
              });
            } catch {}
          },

          onEvent: function(event) {
            emitSessionEvent(sessionId, event);
          },
        });

        // Final save
        await self.sessionManager!.updateSession(sessionId, {
          status: result.status,
          tokenCount: result.tokenCount,
          turnCount: result.turnCount,
        });
        await self.sessionManager!.replaceMessages(sessionId, result.messages);

        // Clean up sub-agents
        var cancelledChildren = self.subAgentManager.cancelAll(sessionId);
        for (var childId of cancelledChildren) {
          await self.terminateSession(childId).catch(function() {});
        }

        // Notify hooks of session end
        await hooks.onSessionEnd(sessionId, agentConfig.agentId, agentConfig.orgId);

      } catch (err: any) {
        console.error(`[runtime] Session ${sessionId} error: ${err.message}`);
        await self.sessionManager!.updateSession(sessionId, { status: 'failed' }).catch(function() {});
        emitSessionEvent(sessionId, { type: 'error', message: err.message });
      } finally {
        self.activeSessions.delete(sessionId);
      }
    })();
  }

  // ─── Private: Session Resume ───────────────────────

  /**
   * Resume active sessions from DB on startup.
   * Sessions that were in-progress when the process died get picked up again.
   */
  private async resumeActiveSessions(): Promise<void> {
    try {
      var activeSessions = await this.sessionManager!.findActiveSessions();
      if (activeSessions.length === 0) return;

      console.log(`[runtime] Found ${activeSessions.length} active session(s) to resume`);

      for (var sessionMeta of activeSessions) {
        try {
          // Load full session with messages
          var session = await this.sessionManager!.getSession(sessionMeta.id);
          if (!session || session.messages.length === 0) {
            // No messages to resume — mark as failed
            await this.sessionManager!.updateSession(sessionMeta.id, { status: 'failed' });
            continue;
          }

          // Mark as resuming
          await this.sessionManager!.updateSession(session.id, { status: 'active' as any });

          var model = this.config.defaultModel || DEFAULT_MODEL;
          var apiKey = this.resolveApiKey(model.provider);
          if (!apiKey) {
            console.warn(`[runtime] Cannot resume session ${session.id}: no API key for ${model.provider}`);
            await this.sessionManager!.updateSession(session.id, { status: 'failed' });
            continue;
          }

          var tools = createAllTools({ agentId: session.agentId, workspaceDir: process.cwd() });

          var agentConfig: AgentConfig = {
            agentId: session.agentId,
            orgId: session.orgId,
            model,
            systemPrompt: buildDefaultSystemPrompt(session.agentId),
            tools,
          };

          // Inject a system message noting the resume
          var resumeMessages = [...session.messages];
          resumeMessages.push({
            role: 'system',
            content: `[Runtime Notice] Session resumed after process restart. Continue where you left off. Current time: ${new Date().toISOString()}`,
          });

          this.runSessionLoop(session.id, agentConfig, resumeMessages, apiKey, true);
          console.log(`[runtime] Resumed session ${session.id} (agent: ${session.agentId}, turns: ${session.turnCount})`);

        } catch (err: any) {
          console.error(`[runtime] Failed to resume session ${sessionMeta.id}: ${err.message}`);
          await this.sessionManager!.updateSession(sessionMeta.id, { status: 'failed' }).catch(function() {});
        }
      }
    } catch (err: any) {
      console.warn(`[runtime] Session resume scan failed: ${err.message}`);
    }
  }

  // ─── Private: Heartbeat + Stale Detection ──────────

  /**
   * Emit heartbeats for all active sessions (touch DB updated_at).
   */
  private async emitHeartbeats(): Promise<void> {
    for (var [sessionId] of this.activeSessions) {
      try {
        await this.sessionManager!.touchSession(sessionId);
      } catch {}
    }
  }

  /**
   * Find and mark sessions that have gone stale (no heartbeat within timeout).
   */
  private async cleanupStaleSessions(timeoutMs: number): Promise<void> {
    try {
      var staleIds = await this.sessionManager!.markStaleSessions(timeoutMs);
      for (var id of staleIds) {
        // Clean up in-memory state
        var controller = this.activeSessions.get(id);
        if (controller) {
          controller.abort();
          this.activeSessions.delete(id);
        }
        console.warn(`[runtime] Marked stale session: ${id}`);
      }
    } catch {}
  }

  // ─── Private: Helpers ──────────────────────────────

  private ensureStarted(): void {
    if (!this.started) {
      throw new Error('Runtime not started. Call runtime.start() first.');
    }
  }

  private customProviders: CustomProviderDef[] = [];

  private resolveApiKey(provider: string): string | undefined {
    return resolveApiKeyForProvider(provider, this.config.apiKeys, this.customProviders);
  }

  /** Returns all available providers (built-in + custom). */
  getProviderRegistry(): { builtIn: typeof PROVIDER_REGISTRY; custom: CustomProviderDef[] } {
    return { builtIn: PROVIDER_REGISTRY, custom: this.customProviders };
  }
}

// ─── Factory ─────────────────────────────────────────────

export function createAgentRuntime(config: RuntimeConfig): AgentRuntime {
  return new AgentRuntime(config);
}

// ─── Default System Prompt ───────────────────────────────

function buildDefaultSystemPrompt(agentId: string): string {
  return `You are an AI agent managed by AgenticMail Enterprise (agent: ${agentId}).

You have access to a comprehensive set of tools for completing tasks. Use them effectively.

Guidelines:
- Be helpful, accurate, and professional
- Use tools when they help accomplish the task
- Explain your reasoning when making decisions
- If you encounter an error, try an alternative approach
- Respect organization policies and permissions
- Keep responses concise unless detail is requested
- For long tasks, work systematically and report progress

Current time: ${new Date().toISOString()}`;
}
