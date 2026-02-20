/**
 * AgenticMail Agent Runtime — Core Types
 *
 * All types needed by the standalone agent runtime:
 * messages, tool calls, sessions, config, streaming events.
 */

import type { AnyAgentTool } from '../agent-tools/types.js';

// ─── Messages ────────────────────────────────────────────

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, any> }
  | { type: 'tool_result'; tool_use_id: string; content: string | ContentBlock[]; is_error?: boolean }
  | { type: 'thinking'; thinking: string };

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
  tool_calls?: ToolCall[];
  tool_results?: ToolResultMsg[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ToolResultMsg {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

// ─── Agent Configuration ─────────────────────────────────

export interface ModelConfig {
  /** Provider name — any registered or custom provider (e.g. 'anthropic', 'deepseek', 'ollama') */
  provider: string;
  modelId: string;
  thinkingLevel?: 'off' | 'low' | 'medium' | 'high';
  /** Override base URL for custom endpoints */
  baseUrl?: string;
  /** Extra headers for custom endpoints */
  headers?: Record<string, string>;
}

export interface AgentConfig {
  agentId: string;
  orgId: string;
  model: ModelConfig;
  systemPrompt: string;
  tools: AnyAgentTool[];
  maxTurns?: number;         // 0 = unlimited (default), positive = hard cap
  maxTokens?: number;        // default 8192
  temperature?: number;      // default 0.7
  contextWindowSize?: number; // default 1000000 (1M — most frontier models support this)
}

// ─── Session State ───────────────────────────────────────

export type SessionStatus = 'active' | 'completed' | 'failed' | 'paused' | 'resuming';

export interface SessionState {
  id: string;
  agentId: string;
  orgId: string;
  messages: AgentMessage[];
  status: SessionStatus;
  tokenCount: number;
  turnCount: number;
  createdAt: number;
  updatedAt: number;
  lastHeartbeatAt?: number;
  parentSessionId?: string;
  /** Total cost in USD tracked across the session */
  costUsd?: number;
}

// ─── Streaming Events ────────────────────────────────────

export type StreamEvent =
  | { type: 'session_start'; sessionId: string }
  | { type: 'session_resumed'; sessionId: string; turnCount: number }
  | { type: 'turn_start'; turnNumber: number }
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'tool_call_start'; toolName: string; toolCallId: string }
  | { type: 'tool_call_end'; toolName: string; result: any; blocked?: boolean }
  | { type: 'turn_end'; stopReason: string }
  | { type: 'checkpoint'; turnNumber: number; tokenCount: number; messageCount: number }
  | { type: 'heartbeat'; timestamp: number; activeTurns: number }
  | { type: 'retry'; attempt: number; maxRetries: number; delayMs: number; reason: string }
  | { type: 'budget_warning'; remainingUsd: number; usedUsd: number }
  | { type: 'budget_exceeded'; reason: string }
  | { type: 'session_end'; summary: string }
  | { type: 'error'; message: string; code?: string; retryable?: boolean };

// ─── Runtime Configuration ───────────────────────────────

export interface RuntimeConfig {
  /** Engine DB instance for session persistence + hook calls */
  engineDb: import('../engine/db-adapter.js').EngineDatabase;
  /** Admin DB adapter (optional, for agent lookups) */
  adminDb?: import('../db/adapter.js').DatabaseAdapter;
  /** Default LLM model configuration */
  defaultModel?: ModelConfig;
  /** API keys keyed by provider name (e.g. { anthropic: 'sk-...', deepseek: 'sk-...' }) */
  apiKeys?: Record<string, string>;
  /** Max concurrent sessions (default: 100) */
  maxConcurrentSessions?: number;
  /** Session idle timeout in ms (default: 30 minutes) */
  sessionIdleTimeoutMs?: number;
  /** Enable the runtime gateway (HTTP API) */
  gatewayEnabled?: boolean;
  /** Resume active sessions on startup (default: true) */
  resumeOnStartup?: boolean;
  /** Heartbeat interval in ms (default: 30000 = 30s) */
  heartbeatIntervalMs?: number;
  /** Stale session timeout in ms — sessions with no heartbeat for this long are marked failed (default: 5 minutes) */
  staleSessionTimeoutMs?: number;
  /** LLM retry configuration */
  retry?: {
    /** Max duration to keep retrying in ms (default: 3600000 = 1 hour) */
    maxRetryDurationMs?: number;
    /** Max individual retries — secondary safety cap (default: 200) */
    maxRetries?: number;
    /** Base delay in ms for exponential backoff (default: 1000) */
    baseDelayMs?: number;
    /** Max delay in ms per retry (default: 60000 = 1 min) */
    maxDelayMs?: number;
  };
}

// ─── Hook Types ──────────────────────────────────────────

export interface ToolCallContext {
  toolCallId: string;
  toolName: string;
  parameters: Record<string, any>;
  agentId: string;
  orgId: string;
  sessionId: string;
}

export interface HookResult {
  allowed: boolean;
  reason: string;
  requiresApproval?: boolean;
  approvalId?: string;
  modifiedParameters?: Record<string, any>;
}

export interface ToolCallResult {
  success: boolean;
  output?: string;
  error?: string;
  durationMs?: number;
}

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  /** Remaining budget in USD (if known) */
  remainingUsd?: number;
  /** Estimated cost of next LLM call in USD */
  estimatedCostUsd?: number;
}

export interface RuntimeHooks {
  /** Inject KB context, policy context, memory before LLM call */
  beforeLLMCall(messages: AgentMessage[], agentId: string, sessionId: string): Promise<AgentMessage[]>;
  /** Check budget before making an LLM call (can block the call) */
  checkBudget(agentId: string, orgId: string, estimatedTokens: number): Promise<BudgetCheckResult>;
  /** Record LLM usage after each call */
  recordLLMUsage(agentId: string, orgId: string, usage: { inputTokens: number; outputTokens: number; costUsd: number }): Promise<void>;
  /** Look up model pricing from settings */
  getModelPricing(provider: string, modelId: string): Promise<{ inputCostPerMillion: number; outputCostPerMillion: number } | null>;
  /** Check permissions, DLP, guardrails before tool execution */
  beforeToolCall(ctx: ToolCallContext): Promise<HookResult>;
  /** Journal, activity, communication after tool execution */
  afterToolCall(ctx: ToolCallContext, result: ToolCallResult): Promise<void>;
  /** Session lifecycle */
  onSessionStart(sessionId: string, agentId: string, orgId: string): Promise<void>;
  onSessionEnd(sessionId: string, agentId: string, orgId: string): Promise<void>;
  /** Flush learnings to memory on context compaction */
  onContextCompaction(sessionId: string, agentId: string, summary: string): Promise<void>;
}

// ─── Spawn Options ───────────────────────────────────────

export interface SpawnOptions {
  agentId: string;
  orgId?: string;
  message: string;
  model?: ModelConfig;
  systemPrompt?: string;
  tools?: AnyAgentTool[];
  parentSessionId?: string;
}

// ─── Follow-Up ───────────────────────────────────────────

export interface FollowUp {
  id: string;
  agentId: string;
  sessionId?: string;
  message: string;
  executeAt: number;
  status: 'pending' | 'executed' | 'cancelled';
  createdAt: number;
}
