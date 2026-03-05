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
 *   apiKeys: { anthropic: "<from-database>" },
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
import { createRuntimeHooks } from './hooks.js';
import { runAgentLoop } from './agent-loop.js';
import { createToolsForContext, detectSessionContext, getToolSetStats, getToolsForSession, clearSessionToolState, type SessionContext } from '../agent-tools/tool-resolver.js';
import { resolveModelForContext as resolveModel, type ModelRoute, type ModelContext } from './model-router.js';
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
var DEFAULT_STALE_SESSION_TIMEOUT_MS = 15 * 60_000; // 15 min — agents do real work (meetings, browser, etc.)
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
  private sessionCompleteCallbacks = new Map<string, Array<(result: any) => void>>();
  /** Sessions that should NOT complete even when the LLM returns end_turn (e.g., meeting monitor active) */
  private keepAliveSessions = new Set<string>();
  /** Sessions with an agent loop currently executing (LLM call in flight) */
  private loopRunning = new Set<string>();
  /** Queued messages for sessions whose loop is currently running — prevents concurrent loops */
  private pendingMessages = new Map<string, string[]>();
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

  /** Build tool options for a given agent, including OAuth email config if available */
  private buildToolOptions(agentId: string, sessionId?: string): any {
    const self = this;
    const base: any = {
      agentId,
      workspaceDir: process.cwd(),
      agenticmailManager: this.config.agenticmailManager,
      agentMemoryManager: this.config.agentMemoryManager,
      engineDb: this.config.engineDb,
      knowledgeEngine: this.config.knowledgeEngine,
      orgId: this.config.orgId || process.env.ORG_ID || 'default',
      runtimeRef: {
        sendMessage: (sid: string, message: string) => self.sendMessage(sid, message),
        getCurrentSessionId: () => sessionId,
        setKeepAlive: (sid: string, keepAlive: boolean) => self.setKeepAlive(sid, keepAlive),
      },
    };
    if (this.config.getEmailConfig) {
      const ec = this.config.getEmailConfig(agentId);
      if (ec?.oauthAccessToken) {
        base.emailConfig = ec;
        if (this.config.onTokenRefresh) {
          const onRefresh = this.config.onTokenRefresh;
          base.onTokenRefresh = (tokens: any) => onRefresh(agentId, tokens);
        }
      }
    }
    // Pass enabledGoogleServices from agent config
    // Auto-derive from skills array if enabledGoogleServices is not explicitly set
    if (this.config.getAgentConfig) {
      const agentConfig = this.config.getAgentConfig(agentId);
      if (agentConfig?.enabledGoogleServices?.length) {
        base.enabledGoogleServices = agentConfig.enabledGoogleServices;
      } else if (agentConfig?.skills?.length) {
        // Map gws-* skills to Google service names
        const skillToService: Record<string, string> = {
          'gws-gmail': 'gmail', 'gws-calendar': 'calendar', 'gws-drive': 'drive',
          'gws-tasks': 'tasks', 'gws-docs': 'docs', 'gws-sheets': 'sheets',
          'gws-contacts': 'contacts', 'gws-chat': 'chat', 'gws-slides': 'slides',
          'gws-forms': 'forms', 'gws-meet': 'meetings',
        };
        const derived = agentConfig.skills
          .filter((s: string) => s.startsWith('gws-'))
          .map((s: string) => skillToService[s])
          .filter(Boolean);
        if (derived.length) base.enabledGoogleServices = derived;
      }
      // Pass voice config for meeting TTS
      if (agentConfig?.voiceConfig) {
        base.voiceConfig = agentConfig.voiceConfig;
        console.log(`[runtime] Voice config loaded: ${JSON.stringify(agentConfig.voiceConfig)}`);
      } else {
        console.log(`[runtime] No voiceConfig in agent config (keys: ${Object.keys(agentConfig || {}).join(', ')})`);
      }
      // Pass messaging channels config so telegram/whatsapp tools can be created
      if (agentConfig?.messagingChannels) {
        (base as any).agentConfig = { messagingChannels: agentConfig.messagingChannels };
      }
      // Pass agent-level tool security (path sandbox, SSRF, command sanitizer)
      // Agent overrides take precedence, then fall back to org defaults
      if (agentConfig?.toolSecurity?.security) {
        base.security = agentConfig.toolSecurity.security;
      } else if (self.orgToolSecurity) {
        base.security = self.orgToolSecurity;
      }
    }
    // Pass vault for MCP skill bridge (Slack, GitHub, Jira, etc.)
    if (this.config.vault) {
      base.vault = this.config.vault;
    }
    // Pass permission engine for dynamic MCP tool registration
    if (this.config.permissionEngine) {
      base.permissionEngine = this.config.permissionEngine;
    }
    // API key resolvers from vault
    if (this.config.getIntegrationKey) {
      const getKey = this.config.getIntegrationKey;
      base.mapsApiKeyResolver = () => getKey('google-maps');
      base.elevenLabsKeyResolver = () => getKey('elevenlabs');
    }
    // Hierarchy manager for management tools
    if (this.config.hierarchyManager) {
      base.hierarchyManager = this.config.hierarchyManager;
    }
    // MCP Process Manager — external MCP server tools
    if (this.config.mcpProcessManager) {
      base.mcpProcessManager = this.config.mcpProcessManager;
    }
    // Database Connection Manager — enterprise database access tools
    if (this.config.databaseManager) {
      base.databaseManager = this.config.databaseManager;
    }
    return base;
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
        // Load org-level tool security defaults
        var toolSecConfig = (settings as any)?.toolSecurityConfig;
        if (toolSecConfig?.security) {
          this.orgToolSecurity = toolSecConfig.security;
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
      async findActiveSession(agentId, _senderEmail) {
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

    // Inject persistent memory context into system prompt
    var memoryContext = '';
    if (this.config.agentMemoryManager) {
      try { memoryContext = await this.config.agentMemoryManager.generateMemoryContext(agentId); } catch {}
    }
    // Inject hierarchy/management context
    var hierarchyContext = '';
    if (this.config.hierarchyManager) {
      try { hierarchyContext = await this.config.hierarchyManager.buildManagerPrompt(agentId) || ''; } catch {}
    }
    var _agentCfg = this.config.getAgentConfig ? this.config.getAgentConfig(agentId) : null;
    var _agentIdentity = _agentCfg?.identity || null;
    // Get database connections for this agent
    var _dbConnections: string[] = [];
    try { if (this.config.databaseManager) _dbConnections = this.config.databaseManager.getAgentConnectionSummary(agentId); } catch {}
    var systemPrompt = opts.systemPrompt || buildDefaultSystemPrompt(agentId, memoryContext, hierarchyContext, _agentIdentity, _dbConnections);

    // Detect session context for dynamic tool loading
    var sessionContext = detectSessionContext({
      systemPrompt,
      sessionKind: (opts as any).kind,
      explicitContext: opts.sessionContext,
    });

    // Build tools — context-aware (only loads what's needed)
    var toolOpts = this.buildToolOptions(agentId, session.id);
    var tools = opts.tools || await createToolsForContext(toolOpts, sessionContext, {
      additionalSets: opts.additionalSets as any,
      sessionId: session.id,
      userMessage: opts.message,
    });
    var toolStats = getToolSetStats(tools);
    console.log(`[runtime] Session ${session.id} tools: ${toolStats.total} (context: ${sessionContext})${toolStats.unregistered.length ? `, unregistered: ${toolStats.unregistered.join(',')}` : ''}`);

    // Track real-time status — report to enterprise server
    if ((this as any)._reportStatus) {
      (this as any)._reportStatus({
        status: 'online',
        activeSessions: this.activeSessions.size,
        currentActivity: { type: sessionContext, detail: opts.message?.slice(0, 100), sessionId: session.id, startedAt: new Date().toISOString() },
      });
    }

    // Per-context model override — resolves from agent's modelRouting config
    var _contextModel = this.resolveModelForContext(agentId, sessionContext);
    if (_contextModel) {
      model = _contextModel;
      console.log(`[runtime] ${sessionContext} session — using model: ${_contextModel.provider}/${_contextModel.modelId}`);
    }

    var agentConfig: AgentConfig = {
      agentId,
      orgId,
      model,
      systemPrompt,
      tools,
    };

    // Resolve API key (org-scoped → system-wide)
    var apiKey = await this.resolveApiKeyAsync(model.provider, agentId);
    if (!apiKey) {
      await this.sessionManager!.updateSession(session.id, { status: 'failed' });
      throw new Error(`No API key configured for provider: ${model.provider}`);
    }
    // Debug: detect non-ASCII in API key
    for (let ci = 0; ci < apiKey.length; ci++) {
      if (apiKey.charCodeAt(ci) > 127) {
        console.error(`[runtime] WARNING: API key for ${model.provider} contains non-ASCII at index ${ci}: charCode=${apiKey.charCodeAt(ci)}`);
        break;
      }
    }

    const initialContent = opts.messageContent || opts.message;
    this.runSessionLoop(session.id, agentConfig, [{ role: 'user', content: initialContent }], apiKey);

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

    // Append user message to DB immediately (always persisted)
    await this.sessionManager!.appendMessage(sessionId, { role: 'user', content: message });

    // If a loop is already running for this session, queue the message instead of starting
    // a concurrent loop. The running loop will pick up queued messages when it finishes its turn.
    if (this.loopRunning.has(sessionId)) {
      var queue = this.pendingMessages.get(sessionId);
      if (!queue) { queue = []; this.pendingMessages.set(sessionId, queue); }
      queue.push(message);
      console.log(`[runtime] Session ${sessionId} loop active — queued message (${queue.length} pending)`);
      return;
    }

    // Re-fetch session to get messages INCLUDING the newly appended user message
    var updatedSession = await this.sessionManager!.getSession(sessionId);
    var messages = updatedSession?.messages || [...session.messages, { role: 'user' as const, content: message }];

    // Resume the agent loop with the updated messages
    var model = this.config.defaultModel || DEFAULT_MODEL;

    // Per-context model override (meeting, chat, email, task, etc.)
    var _smCtx = this.keepAliveSessions.has(sessionId) ? 'meeting' : 'chat';
    var _smModel = this.resolveModelForContext(session.agentId, _smCtx);
    if (_smModel) {
      model = _smModel;
    }

    var apiKey = await this.resolveApiKeyAsync(model.provider, session.agentId);
    if (!apiKey) throw new Error(`No API key for provider: ${model.provider}`);

    var memoryContext = '';
    if (this.config.agentMemoryManager) {
      try { memoryContext = await this.config.agentMemoryManager.generateMemoryContext(session.agentId); } catch {}
    }
    var _hierarchyCtx = '';
    if (this.config.hierarchyManager) {
      try { _hierarchyCtx = await this.config.hierarchyManager.buildManagerPrompt(session.agentId) || ''; } catch {}
    }
    var _aCfg2 = this.config.getAgentConfig ? this.config.getAgentConfig(session.agentId) : null;
    var _dbConns2: string[] = [];
    try { if (this.config.databaseManager) _dbConns2 = this.config.databaseManager.getAgentConnectionSummary(session.agentId); } catch {}
    var _systemPrompt = buildDefaultSystemPrompt(session.agentId, memoryContext, _hierarchyCtx, _aCfg2?.identity, _dbConns2);

    // Context-aware tool loading — reuses session tool state (preserves dynamically loaded sets)
    // Don't re-detect context for keep-alive sessions (meetings) — they stay in their original context
    var _sessionContext: SessionContext | undefined;
    if (!this.keepAliveSessions.has(sessionId)) {
      _sessionContext = detectSessionContext({
        systemPrompt: _systemPrompt,
        isKeepAlive: false,
      });
    }
    var tools = await getToolsForSession(sessionId, this.buildToolOptions(session.agentId, sessionId), {
      context: _sessionContext,
      userMessage: message,
    });

    var agentConfig: AgentConfig = {
      agentId: session.agentId,
      orgId: session.orgId,
      model,
      systemPrompt: _systemPrompt,
      tools,
    };

    this.runSessionLoop(sessionId, agentConfig, messages, apiKey);
  }

  /**
   * Register a callback for when a session completes (or fails).
   */
  onSessionComplete(sessionId: string, callback: (result: any) => void): void {
    var existing = this.sessionCompleteCallbacks.get(sessionId);
    if (!existing) { existing = []; this.sessionCompleteCallbacks.set(sessionId, existing); }
    existing.push(callback);
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
    // Track session end
    if ((this as any)._reportStatus) {
      (this as any)._reportStatus({
        status: this.activeSessions.size > 0 ? 'online' : 'idle',
        activeSessions: this.activeSessions.size,
        currentActivity: null,
      });
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
   * Mark a session as "keep alive" — prevents it from completing when the LLM returns end_turn.
   * Used by MeetingMonitor to keep meeting sessions alive for incoming caption/chat updates.
   * The session stays in 'active' status and waits for the next sendMessage() call.
   */
  setKeepAlive(sessionId: string, keepAlive: boolean): void {
    if (keepAlive) {
      this.keepAliveSessions.add(sessionId);
      console.log(`[runtime] Session ${sessionId} marked as keep-alive`);
    } else {
      this.keepAliveSessions.delete(sessionId);
      console.log(`[runtime] Session ${sessionId} keep-alive removed`);
    }
  }

  isKeepAlive(sessionId: string): boolean {
    return this.keepAliveSessions.has(sessionId);
  }

  /**
   * Stop the runtime.
   */
  async stop(): Promise<void> {
    if (!this.started) return;

    // Cancel all active sessions
    for (var [_sessionId, controller] of this.activeSessions) {
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

    // Mark loop as running to prevent concurrent loops from sendMessage
    this.loopRunning.add(sessionId);

    // Per-context model override (deferred to async block for org-aware key resolution)
    var _loopCtx = this.keepAliveSessions.has(sessionId) ? 'meeting' : 'chat';
    var _loopModel = this.resolveModelForContext(agentConfig.agentId, _loopCtx);

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
        // Apply deferred model override with org-aware key resolution
        if (_loopModel && agentConfig.model.modelId !== _loopModel.modelId) {
          agentConfig = { ...agentConfig, model: _loopModel };
          apiKey = await self.resolveApiKeyAsync(_loopModel.provider, agentConfig.agentId) || apiKey;
        }

        // Resolve fallback models for this agent
        var _fallbackModels: string[] = [];
        if (self.config.getAgentConfig) {
          var _ac = self.config.getAgentConfig(agentConfig.agentId);
          if (_ac?.fallbackModels) _fallbackModels = _ac.fallbackModels;
          else if (_ac?.modelFallback?.fallbacks) _fallbackModels = _ac.modelFallback.fallbacks;
        }

        var result = await runAgentLoop(agentConfig, initialMessages, hooks, {
          apiKey,
          signal: abortController.signal,
          sessionId,
          retryConfig: self.config.retry,
          runtime: self,
          fallbackModels: _fallbackModels,
          resolveApiKey: async function(provider: string) { return self.resolveApiKeyAsync(provider, agentConfig.agentId); },

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

        // Save messages and token count
        await self.sessionManager!.replaceMessages(sessionId, result.messages);

        // Check keep-alive: if active, DON'T complete — wait for next sendMessage()
        if (self.keepAliveSessions.has(sessionId)) {
          // Keep session in 'active' status — just save progress
          await self.sessionManager!.touchSession(sessionId, {
            tokenCount: result.tokenCount,
            turnCount: result.turnCount,
          });

          // Clear loop-running flag BEFORE checking queue
          self.loopRunning.delete(sessionId);

          // Drain any messages that arrived while the loop was running
          var queued = self.pendingMessages.get(sessionId);
          if (queued && queued.length > 0) {
            self.pendingMessages.delete(sessionId);
            console.log(`[runtime] Session ${sessionId} keep-alive loop done — draining ${queued.length} queued message(s)`);
            // result.messages was already saved via replaceMessages above, which overwrote
            // the queued user messages that were appended during the loop. Re-append them now.
            for (var qm of queued) {
              await self.sessionManager!.appendMessage(sessionId, { role: 'user', content: qm });
            }
            // Re-fetch to get the complete history ending with user message(s)
            var freshSession = await self.sessionManager!.getSession(sessionId);
            var freshMessages = freshSession?.messages || [...result.messages, ...queued.map(function(q) { return { role: 'user' as const, content: q }; })];
            // Verify conversation ends with a user message
            var lastMsg = freshMessages[freshMessages.length - 1];
            if (lastMsg && lastMsg.role !== 'user') {
              // Safety: append a nudge so the LLM has a user message to respond to
              var nudge = { role: 'user' as const, content: '[System] You have new messages above. Please respond.' };
              freshMessages.push(nudge);
              await self.sessionManager!.appendMessage(sessionId, nudge);
            }
            // Restart the loop with the accumulated messages
            self.runSessionLoop(sessionId, agentConfig, freshMessages, apiKey);
          } else {
            console.log(`[runtime] Session ${sessionId} finished LLM turn but is keep-alive — staying active for incoming messages`);
          }
          // Don't delete from activeSessions, don't fire completion callbacks
          // The next sendMessage() call will restart the loop
          return;
        }

        // Normal completion
        await self.sessionManager!.updateSession(sessionId, {
          status: result.status,
          tokenCount: result.tokenCount,
          turnCount: result.turnCount,
        });

        // Clean up sub-agents
        var cancelledChildren = self.subAgentManager.cancelAll(sessionId);
        for (var childId of cancelledChildren) {
          await self.terminateSession(childId).catch(function() {});
        }

        // Notify hooks of session end
        await hooks.onSessionEnd(sessionId, agentConfig.agentId, agentConfig.orgId);

        // Fire completion callbacks
        var cbs = self.sessionCompleteCallbacks.get(sessionId);
        if (cbs) { for (var cb of cbs) { try { cb(result); } catch {} } self.sessionCompleteCallbacks.delete(sessionId); }

      } catch (err: any) {
        console.error(`[runtime] Session ${sessionId} error: ${err.message}`);
        self.loopRunning.delete(sessionId);
        self.pendingMessages.delete(sessionId);
        await self.sessionManager!.updateSession(sessionId, { status: 'failed' }).catch(function() {});
        emitSessionEvent(sessionId, { type: 'error', message: err.message });
        // Fire completion callbacks with failed status
        var cbs2 = self.sessionCompleteCallbacks.get(sessionId);
        if (cbs2) { for (var cb2 of cbs2) { try { cb2({ status: 'failed', error: err.message }); } catch {} } self.sessionCompleteCallbacks.delete(sessionId); }
      } finally {
        // Only remove from activeSessions if NOT keep-alive
        if (!self.keepAliveSessions.has(sessionId)) {
          self.loopRunning.delete(sessionId);
          self.pendingMessages.delete(sessionId);
          self.activeSessions.delete(sessionId);
          clearSessionToolState(sessionId);
        }
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
            // No messages to resume — mark as completed
            await this.sessionManager!.updateSession(sessionMeta.id, { status: 'completed' });
            continue;
          }

          // For failed sessions: only resume if last non-system message is from user (agent never replied)
          if (sessionMeta.status === 'failed') {
            var lastUserIdx = -1;
            var lastAssistantIdx = -1;
            for (var mi = session.messages.length - 1; mi >= 0; mi--) {
              if (session.messages[mi].role === 'user' && lastUserIdx < 0) lastUserIdx = mi;
              if (session.messages[mi].role === 'assistant' && lastAssistantIdx < 0) lastAssistantIdx = mi;
              if (lastUserIdx >= 0 && lastAssistantIdx >= 0) break;
            }
            if (lastUserIdx < lastAssistantIdx || lastUserIdx < 0) {
              // Agent already replied or no user message — don't retry
              await this.sessionManager!.updateSession(sessionMeta.id, { status: 'completed' });
              continue;
            }
            console.log(`[runtime] Recovering failed session ${session.id} — agent never replied to user message`);
          }

          // Mark as resuming
          await this.sessionManager!.updateSession(session.id, { status: 'active' as any });

          var model = this.config.defaultModel || DEFAULT_MODEL;
          var apiKey = await this.resolveApiKeyAsync(model.provider, session.agentId);
          if (!apiKey) {
            console.warn(`[runtime] Cannot resume session ${session.id}: no API key for ${model.provider}`);
            await this.sessionManager!.updateSession(session.id, { status: 'failed' });
            continue;
          }

          var mc = '';
          if (this.config.agentMemoryManager) {
            try { mc = await this.config.agentMemoryManager.generateMemoryContext(session.agentId); } catch {}
          }
          var _hc = '';
          if (this.config.hierarchyManager) {
            try { _hc = await this.config.hierarchyManager.buildManagerPrompt(session.agentId) || ''; } catch {}
          }
          var _rCfg = this.config.getAgentConfig ? this.config.getAgentConfig(session.agentId) : null;
          var _dbC3: string[] = [];
          try { if (this.config.databaseManager) _dbC3 = this.config.databaseManager.getAgentConnectionSummary(session.agentId); } catch {}
          var _resumePrompt = buildDefaultSystemPrompt(session.agentId, mc, _hc, _rCfg?.identity, _dbC3);
          var _resumeCtx = detectSessionContext({
            systemPrompt: _resumePrompt,
            isKeepAlive: this.keepAliveSessions.has(session.id),
          });
          var tools = await createToolsForContext(this.buildToolOptions(session.agentId, session.id), _resumeCtx, {
            sessionId: session.id,
          });

          var agentConfig: AgentConfig = {
            agentId: session.agentId,
            orgId: session.orgId,
            model,
            systemPrompt: _resumePrompt,
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
  private orgToolSecurity: any = null;

  private _resolveApiKey(provider: string, agentId?: string): string | undefined {
    // Synchronous system-wide resolution
    return resolveApiKeyForProvider(provider, this.config.apiKeys, this.customProviders);
  }

  /** Resolve API key with org-scoped fallback (async — checks org integrations first) */
  private async resolveApiKeyAsync(provider: string, agentId?: string): Promise<string | undefined> {
    // 1. Try org-scoped key if agent has org
    if (agentId && this.config.resolveOrgApiKey) {
      try {
        const orgKey = await this.config.resolveOrgApiKey(agentId, provider);
        if (orgKey) return orgKey;
      } catch { /* fall through to system-wide */ }
    }
    // 2. System-wide fallback
    return resolveApiKeyForProvider(provider, this.config.apiKeys, this.customProviders);
  }

  /** Resolve per-context model from agent's modelRouting config */
  resolveModelForContext(agentId: string, context: string): { provider: string; modelId: string } | null {
    const agentCfg = this.config.getAgentConfig?.(agentId);
    return resolveModel(agentCfg, context as ModelContext);
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

function buildDefaultSystemPrompt(agentId: string, memoryContext?: string, hierarchyContext?: string, agentIdentity?: any, dbConnections?: string[]): string {
  var base = `You are an AI agent managed by AgenticMail Enterprise (agent: ${agentId}).

You have access to a comprehensive set of tools for completing tasks. Use them effectively.

Guidelines:
- Be helpful, accurate, and professional
- Use tools when they help accomplish the task
- Explain your reasoning when making decisions
- If you encounter an error, try an alternative approach
- Respect organization policies and permissions
- Keep responses concise unless detail is requested
- For long tasks, work systematically and report progress
- ACTIVELY USE YOUR MEMORY: After corrections, lessons, or insights, call memory_reflect to record them
- Before complex tasks, call memory_context to recall relevant knowledge
- Your memory persists across conversations — it's how you grow as an expert

Database Tools:
- ent_db_* tools: For LOCAL databases — SQLite files in the workspace. Read-only inspection.
- db_* tools (db_query, db_list_connections, db_list_tables, db_describe_table): For EXTERNAL databases granted to you by your admin.
  IMPORTANT: When asked about any database by name, ALWAYS use db_* tools first. Start with db_list_connections.
${dbConnections && dbConnections.length > 0 ? `\nYour External Database Access:\n${dbConnections.map(c => '  - ' + c).join('\n')}\nUse db_query with the connection name to query these databases.` : ''}

Current time: ${new Date().toISOString()}`;

  if (memoryContext) {
    base += '\n\n' + memoryContext;
  }

  if (hierarchyContext) {
    base += '\n\n' + hierarchyContext;
  }

  // Language enforcement — if agent has a configured language, enforce it
  if (agentIdentity?.language && agentIdentity.language !== 'en-us') {
    var langMap: Record<string, string> = {
      'en-us': 'English (American)', 'en-gb': 'English (British)', 'en-au': 'English (Australian)',
      'en-ca': 'English (Canadian)', 'en-in': 'English (Indian)', 'en-za': 'English (South African)',
      'en-ie': 'English (Irish)', 'en-ng': 'English (Nigerian)',
      'es': 'Spanish', 'es-mx': 'Mexican Spanish', 'es-ar': 'Argentine Spanish',
      'es-co': 'Colombian Spanish', 'es-latam': 'Latin American Spanish',
      'pt': 'Portuguese', 'pt-br': 'Brazilian Portuguese',
      'fr': 'French', 'fr-ca': 'Canadian French', 'fr-be': 'Belgian French', 'fr-ch': 'Swiss French', 'fr-af': 'African French',
      'zh': 'Simplified Chinese (Mandarin)', 'zh-tw': 'Traditional Chinese (Mandarin)', 'zh-yue': 'Cantonese',
      'ar': 'Modern Standard Arabic', 'ar-eg': 'Egyptian Arabic', 'ar-sa': 'Saudi Arabic', 'ar-ma': 'Moroccan Arabic',
      'de': 'German', 'de-at': 'Austrian German', 'de-ch': 'Swiss German',
      'it': 'Italian', 'nl': 'Dutch', 'ru': 'Russian', 'pl': 'Polish', 'uk': 'Ukrainian',
      'ja': 'Japanese', 'ko': 'Korean', 'hi': 'Hindi', 'bn': 'Bengali', 'ur': 'Urdu',
      'ta': 'Tamil', 'te': 'Telugu', 'mr': 'Marathi',
      'th': 'Thai', 'vi': 'Vietnamese', 'id': 'Indonesian', 'ms': 'Malay', 'tl': 'Filipino (Tagalog)',
      'yo': 'Yoruba', 'ig': 'Igbo', 'ha': 'Hausa', 'sw': 'Swahili', 'am': 'Amharic',
      'tr': 'Turkish', 'sv': 'Swedish', 'no': 'Norwegian', 'da': 'Danish', 'fi': 'Finnish',
      'el': 'Greek', 'he': 'Hebrew', 'fa': 'Persian (Farsi)', 'ro': 'Romanian', 'hu': 'Hungarian',
      'cs': 'Czech', 'sk': 'Slovak', 'bg': 'Bulgarian', 'hr': 'Croatian', 'sr': 'Serbian',
      'ca': 'Catalan', 'gl': 'Galician', 'eu': 'Basque', 'af': 'Afrikaans',
    };
    var langName = langMap[agentIdentity.language] || agentIdentity.language;
    base += `\n\n## Language Requirement
**CRITICAL: You MUST respond in ${langName} at all times.**
- ALL your responses, messages, emails, and communications must be written in ${langName}.
- When users write to you in any language, understand their message but ALWAYS reply in ${langName}.
- Tool calls, code, and technical identifiers remain in their original language (English/code), but all human-facing text must be in ${langName}.
- This is a hard requirement set by your administrator. Do not switch languages even if asked.`;
  }

  return base;
}
