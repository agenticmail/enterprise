/**
 * Core Agent Loop
 *
 * The heart of the runtime. Implements the think-act cycle:
 *   1. Build messages (system prompt + history + user message)
 *   2. Call hooks.beforeLLMCall → inject KB context, policy, memory
 *   3. Stream LLM response via llm-client
 *   4. If tool_use → check permissions via hooks, execute, loop back
 *   5. If end_turn → done
 *   6. If max_tokens → compact context, loop back
 *   7. If maxTurns exceeded → force stop
 */

import type { AgentConfig, AgentMessage, RuntimeHooks, SessionState, StreamEvent, ToolCall } from './types.js';
import { callLLM, toolsToDefinitions, estimateMessageTokens, type LLMResponse } from './llm-client.js';
import { ToolRegistry, executeTool } from './tool-executor.js';

// ─── Constants ───────────────────────────────────────────

const DEFAULT_MAX_TURNS = 0; // 0 = unlimited
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_CONTEXT_WINDOW = 2_000_000; // 1M — most frontier models support this (Feb 2026)
const COMPACTION_THRESHOLD = 0.8; // compact when 80% of context used

/**
 * Fix ALL tool_use / tool_result pairing issues in message history.
 * 
 * Anthropic requires:
 * 1. Every tool_result must reference a tool_use in the preceding assistant message
 * 2. Every tool_use in an assistant message must have a tool_result in the immediately following user message
 * 
 * After compaction or message injection (e.g. meeting monitor), either side can be orphaned.
 */
function fixOrphanedToolBlocks(messages: AgentMessage[]): AgentMessage[] {
  let fixed = false;

  // ─── Pass 1: Collect all tool_use ids and all tool_result ids ───
  const allToolUseIds = new Set<string>();
  const allToolResultIds = new Set<string>();
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const block of m.content as any[]) {
      if (block.type === 'tool_use' && block.id) allToolUseIds.add(block.id);
      if (block.type === 'tool_result' && block.tool_use_id) allToolResultIds.add(block.tool_use_id);
    }
  }

  // ─── Pass 2: Remove orphaned blocks ───
  const result = messages.map(m => {
    if (!Array.isArray(m.content)) return m;

    if (m.role === 'user') {
      // Remove tool_result blocks without matching tool_use
      const filtered = (m.content as any[]).filter(block => {
        if (block.type === 'tool_result' && block.tool_use_id && !allToolUseIds.has(block.tool_use_id)) {
          fixed = true;
          return false;
        }
        return true;
      });
      if (filtered.length === 0) return null;
      if (filtered.length !== (m.content as any[]).length) return { ...m, content: filtered };
      return m;
    }

    if (m.role === 'assistant') {
      // Remove tool_use blocks without matching tool_result
      const filtered = (m.content as any[]).filter(block => {
        if (block.type === 'tool_use' && block.id && !allToolResultIds.has(block.id)) {
          fixed = true;
          return false;
        }
        return true;
      });
      if (filtered.length === 0) return null;
      if (filtered.length !== (m.content as any[]).length) return { ...m, content: filtered };
      return m;
    }

    return m;
  }).filter(Boolean) as AgentMessage[];

  if (fixed) console.log(`[agent-loop] Fixed orphaned tool_use/tool_result blocks in message history`);
  return result;
}

// ─── Agent Loop ──────────────────────────────────────────

export interface AgentLoopOptions {
  apiKey: string;
  signal?: AbortSignal;
  onEvent?: (event: StreamEvent) => void;
  /** Tool execution timeout per call in ms (default: 30000) */
  toolTimeoutMs?: number;
  /** Called after each turn completes — saves messages incrementally to DB */
  onCheckpoint?: (data: { messages: AgentMessage[]; turnCount: number; tokenCount: number }) => Promise<void>;
  /** Called periodically to keep the session alive */
  onHeartbeat?: (data: { turnCount: number; tokenCount: number; timestamp: number }) => Promise<void>;
  /** Session ID for hook calls */
  sessionId?: string;
  /** Retry config for LLM calls */
  retryConfig?: { maxRetryDurationMs?: number; maxRetries?: number; baseDelayMs?: number; maxDelayMs?: number };
}

export interface AgentLoopResult {
  messages: AgentMessage[];
  status: SessionState['status'];
  tokenCount: number;
  turnCount: number;
  textContent: string;
  stopReason: string;
}

export async function runAgentLoop(
  config: AgentConfig,
  initialMessages: AgentMessage[],
  hooks: RuntimeHooks,
  options: AgentLoopOptions,
): Promise<AgentLoopResult> {
  var maxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;
  var maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
  var temperature = config.temperature ?? DEFAULT_TEMPERATURE;
  var contextWindowSize = config.contextWindowSize ?? DEFAULT_CONTEXT_WINDOW;
  var toolTimeout = options.toolTimeoutMs ?? 120_000; // 2 minutes — meeting_join, browser actions need time

  // Build tool registry
  var registry = new ToolRegistry();
  registry.register(config.tools);
  var toolDefs = toolsToDefinitions(config.tools);

  // Initialize messages
  var messages: AgentMessage[] = [];

  // Add system prompt
  if (config.systemPrompt) {
    messages.push({ role: 'system', content: config.systemPrompt });
  }

  // Add history
  messages.push(...initialMessages);

  var turnCount = 0;
  var totalTextContent = '';
  var lastStopReason = 'end_turn';
  var sessionId = options.sessionId || ''; // Set by caller

  // Emit session start
  var sessionStartEvent: StreamEvent = { type: 'session_start', sessionId: config.agentId };
  options.onEvent?.(sessionStartEvent);

  while (maxTurns === 0 || turnCount < maxTurns) {
    // Check abort
    if (options.signal?.aborted) {
      return buildResult(messages, 'paused', turnCount, totalTextContent, 'aborted');
    }

    turnCount++;

    // Heartbeat — keep session alive
    if (options.onHeartbeat) {
      try {
        await options.onHeartbeat({ turnCount, tokenCount: estimateMessageTokens(messages), timestamp: Date.now() });
      } catch {}
    }

    // Emit turn start
    var turnStartEvent: StreamEvent = { type: 'turn_start', turnNumber: turnCount };
    options.onEvent?.(turnStartEvent);

    // Hook: inject context before LLM call
    try {
      messages = await hooks.beforeLLMCall(messages, config.agentId, sessionId);
    } catch (err: any) {
      console.warn(`[runtime] beforeLLMCall hook error: ${err.message}`);
    }

    // Check context window — compact if needed
    var estimatedTokens = estimateMessageTokens(messages);
    if (estimatedTokens > contextWindowSize * COMPACTION_THRESHOLD) {
      messages = await compactContext(messages, config, hooks, { apiKey: options.apiKey, sessionId: options.sessionId });
    }

    // Always fix orphaned tool blocks before LLM call (can happen from compaction,
    // meeting monitor injections, or session message injection)
    messages = fixOrphanedToolBlocks(messages);

    // Budget check — stop if budget exceeded
    if (hooks.checkBudget) {
      try {
        var budgetResult = await hooks.checkBudget(config.agentId, config.orgId, estimateMessageTokens(messages));
        if (!budgetResult.allowed) {
          var budgetEvent: StreamEvent = { type: 'budget_exceeded', reason: budgetResult.reason || 'Budget limit reached' };
          options.onEvent?.(budgetEvent);
          return buildResult(messages, 'completed', turnCount, totalTextContent, 'budget_exceeded');
        }
        if (budgetResult.remainingUsd !== undefined && budgetResult.remainingUsd < 1.0) {
          var warnEvent: StreamEvent = { type: 'budget_warning', remainingUsd: budgetResult.remainingUsd, usedUsd: 0 };
          options.onEvent?.(warnEvent);
        }
      } catch {}
    }

    // Call LLM with retry for transient errors
    var llmResponse: LLMResponse = undefined as any;
    var llmRetryMax = 3;
    var llmRetryDelay = 2000; // start at 2s, doubles each retry
    for (var llmAttempt = 0; llmAttempt <= llmRetryMax; llmAttempt++) {
      try {
        llmResponse = await callLLM(
          {
            provider: config.model.provider,
            modelId: config.model.modelId,
            apiKey: options.apiKey,
            thinkingLevel: config.model.thinkingLevel,
            baseUrl: config.model.baseUrl,
            headers: config.model.headers,
            authMode: config.model.authMode,
          },
          messages,
          toolDefs,
          { maxTokens, temperature, signal: options.signal },
          options.onEvent,
          options.retryConfig,
        );
        break; // success
      } catch (err: any) {
        // Recover from orphaned tool_result errors (e.g. after compaction)
        var isOrphanError = /tool_use_id.*tool_result|tool_use.*without.*tool_result|tool_result.*without.*tool_use/i.test(err.message);
        if (isOrphanError && llmAttempt < llmRetryMax) {
          // Extract specific tool IDs from the error message for targeted removal
          var idMatch = err.message.match(/toolu_[A-Za-z0-9_]+/g);
          var orphanIds = idMatch ? new Set(idMatch) : null;
          console.warn(`[agent-loop] Orphaned tool blocks detected (ids: ${idMatch?.join(', ') || 'unknown'}) — force-removing and retrying`);
          messages = fixOrphanedToolBlocks(messages);
          // If fixOrphanedToolBlocks didn't catch it (e.g. user message injected between
          // tool_use and tool_result), do a targeted force-removal of the specific IDs
          if (orphanIds) {
            messages = messages.map(m => {
              if (!Array.isArray(m.content)) return m;
              var filtered = (m.content as any[]).filter(block => {
                if (block.type === 'tool_use' && block.id && orphanIds!.has(block.id)) return false;
                if (block.type === 'tool_result' && block.tool_use_id && orphanIds!.has(block.tool_use_id)) return false;
                return true;
              });
              if (filtered.length === 0) return null as any;
              if (filtered.length !== (m.content as any[]).length) return { ...m, content: filtered };
              return m;
            }).filter(Boolean) as AgentMessage[];
          }
          continue;
        }
        var isTransient = /premature close|ECONNRESET|ETIMEDOUT|socket hang up|fetch failed|network|502|503|529/i.test(err.message);
        if (isTransient && llmAttempt < llmRetryMax) {
          var delay = llmRetryDelay * Math.pow(2, llmAttempt);
          console.warn(`[agent-loop] LLM call failed (attempt ${llmAttempt + 1}/${llmRetryMax + 1}): ${err.message} — retrying in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        console.error(`[agent-loop] LLM call failed after ${llmAttempt + 1} attempts: ${err.message}`);
        var errorEvent: StreamEvent = { type: 'error', message: err.message, retryable: isTransient };
        options.onEvent?.(errorEvent);
        return buildResult(messages, 'failed', turnCount, totalTextContent, 'error');
      }
    }

    // Record LLM usage for budget tracking
    if (hooks.recordLLMUsage) {
      try {
        var usageInput = llmResponse.usage?.inputTokens || 0;
        var usageOutput = llmResponse.usage?.outputTokens || 0;
        // Fallback: estimate tokens if provider didn't return usage (common with streaming)
        if (usageInput === 0 && usageOutput === 0) {
          usageInput = Math.ceil(estimateMessageTokens(messages) * 0.9);
          usageOutput = Math.ceil((llmResponse.textContent?.length || 100) / 4);
        }
        var costUsd = await estimateCostAsync(hooks, config.model, usageInput, usageOutput);
        await hooks.recordLLMUsage(config.agentId, config.orgId, {
          inputTokens: usageInput,
          outputTokens: usageOutput,
          costUsd,
        });
      } catch {}
    }

    // Build assistant message from response
    var assistantMessage = buildAssistantMessage(llmResponse);
    messages.push(assistantMessage);
    totalTextContent += llmResponse.textContent;

    // Handle stop reasons
    if (llmResponse.stopReason === 'end_turn') {
      lastStopReason = 'end_turn';
      var turnEndEvent: StreamEvent = { type: 'turn_end', stopReason: 'end_turn' };
      options.onEvent?.(turnEndEvent);

      // Incremental checkpoint — persist messages to DB after each turn
      if (options.onCheckpoint) {
        try {
          var currentTokens = estimateMessageTokens(messages);
          await options.onCheckpoint({ messages, turnCount, tokenCount: currentTokens });
        } catch (err: any) {
          console.warn('[runtime] Checkpoint save error:', err.message);
        }
      }

      break;
    }

    if (llmResponse.stopReason === 'tool_use' && llmResponse.toolCalls.length > 0) {
      lastStopReason = 'tool_use';

      // Execute each tool call
      var toolResults: { tool_use_id: string; content: string; is_error: boolean }[] = [];

      for (var toolCall of llmResponse.toolCalls) {
        // Hook: check permissions before tool execution
        var hookResult = await hooks.beforeToolCall({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          parameters: toolCall.input,
          agentId: config.agentId,
          orgId: config.orgId,
          sessionId,
        });

        if (!hookResult.allowed) {
          // Tool blocked by hook
          console.log(`[agent-loop] 🚫 Tool ${toolCall.name} BLOCKED: ${hookResult.reason} (session: ${sessionId})`);
          var blockedEvent: StreamEvent = {
            type: 'tool_call_end',
            toolName: toolCall.name,
            result: hookResult.reason,
            blocked: true,
          };
          options.onEvent?.(blockedEvent);

          toolResults.push({
            tool_use_id: toolCall.id,
            content: `Tool call blocked: ${hookResult.reason}`,
            is_error: true,
          });

          await hooks.afterToolCall(
            { toolCallId: toolCall.id, toolName: toolCall.name, parameters: toolCall.input, agentId: config.agentId, orgId: config.orgId, sessionId },
            { success: false, error: hookResult.reason },
          );
          continue;
        }

        // Apply modified parameters if hook changed them
        var effectiveInput = hookResult.modifiedParameters || toolCall.input;
        var effectiveToolCall: ToolCall = { ...toolCall, input: effectiveInput };

        // Look up and execute the tool
        var tool = registry.get(toolCall.name);
        if (!tool) {
          toolResults.push({
            tool_use_id: toolCall.id,
            content: `Unknown tool: "${toolCall.name}"`,
            is_error: true,
          });

          var unknownEvent: StreamEvent = {
            type: 'tool_call_end',
            toolName: toolCall.name,
            result: 'unknown tool',
            blocked: true,
          };
          options.onEvent?.(unknownEvent);
          continue;
        }

        console.log(`[agent-loop] 🔧 Executing tool: ${toolCall.name} (session: ${sessionId})`);
        var { result, content } = await executeTool(tool, effectiveToolCall, {
          timeoutMs: toolTimeout,
          signal: options.signal,
        });

        if (!result.success) {
          console.log(`[agent-loop] ❌ Tool ${toolCall.name} failed: ${result.error?.slice(0, 200)}`);
        } else {
          console.log(`[agent-loop] ✅ Tool ${toolCall.name} succeeded (${content.length} chars)`);
        }

        toolResults.push({
          tool_use_id: toolCall.id,
          content,
          is_error: !result.success,
        });

        var tcEndEvent: StreamEvent = {
          type: 'tool_call_end',
          toolName: toolCall.name,
          result: result.success ? 'success' : result.error,
        };
        options.onEvent?.(tcEndEvent);

        // Hook: record tool call
        await hooks.afterToolCall(
          { toolCallId: toolCall.id, toolName: toolCall.name, parameters: effectiveInput, agentId: config.agentId, orgId: config.orgId, sessionId },
          result,
        );
      }

      // Add tool results as user message (Anthropic format)
      messages.push({
        role: 'user',
        content: toolResults.map(function(tr) {
          return { type: 'tool_result' as const, tool_use_id: tr.tool_use_id, content: tr.content, is_error: tr.is_error };
        }),
        tool_results: toolResults.map(function(tr) {
          return { tool_use_id: tr.tool_use_id, content: tr.content, is_error: tr.is_error };
        }),
      });

      // Incremental checkpoint — persist messages to DB after each turn
      if (options.onCheckpoint) {
        try {
          var currentTokens = estimateMessageTokens(messages);
          await options.onCheckpoint({ messages, turnCount, tokenCount: currentTokens });
        } catch (err: any) {
          console.warn('[runtime] Checkpoint save error:', err.message);
        }
      }

      // Continue loop — LLM will process tool results
      continue;
    }

    if (llmResponse.stopReason === 'max_tokens') {
      lastStopReason = 'max_tokens';
      // Compact and continue
      messages = await compactContext(messages, config, hooks, { apiKey: options.apiKey, sessionId: options.sessionId });
      messages = fixOrphanedToolBlocks(messages);

      // Incremental checkpoint — persist messages to DB after each turn
      if (options.onCheckpoint) {
        try {
          var currentTokens = estimateMessageTokens(messages);
          await options.onCheckpoint({ messages, turnCount, tokenCount: currentTokens });
        } catch (err: any) {
          console.warn('[runtime] Checkpoint save error:', err.message);
        }
      }

      continue;
    }

    // Unknown stop reason — break
    lastStopReason = llmResponse.stopReason;
    break;
  }

  if (maxTurns > 0 && turnCount >= maxTurns) {
    lastStopReason = 'max_turns';
  }

  // Emit session end
  var sessionEndEvent: StreamEvent = {
    type: 'session_end',
    summary: totalTextContent.slice(0, 200),
  };
  options.onEvent?.(sessionEndEvent);

  return buildResult(
    messages,
    lastStopReason === 'end_turn' ? 'completed' : lastStopReason === 'max_turns' ? 'completed' : 'completed',
    turnCount,
    totalTextContent,
    lastStopReason,
  );
}

// ─── Helpers ─────────────────────────────────────────────

// Built-in fallback pricing (used when no custom pricing configured in dashboard)
var FALLBACK_PRICES: Record<string, { input: number; output: number }> = {
  // Anthropic (Feb 2026 — 1M context window)
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'o3': { input: 10, output: 40 },
  'o4-mini': { input: 1.1, output: 4.4 },
  // Google Gemini (up to 2M context)
  'gemini-2.5-pro': { input: 2.5, output: 15 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-3-pro': { input: 2.5, output: 15 },
  // DeepSeek (128K context)
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-chat-v3': { input: 0.14, output: 0.28 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  // xAI Grok (2M context window)
  'grok-4': { input: 3, output: 15 },
  'grok-4-fast': { input: 0.2, output: 0.5 },
  'grok-3': { input: 3, output: 15 },
  'grok-3-mini': { input: 0.3, output: 0.5 },
  // Mistral
  'mistral-large-latest': { input: 2, output: 6 },
  'mistral-small-latest': { input: 0.1, output: 0.3 },
  'codestral-latest': { input: 0.3, output: 0.9 },
  // Meta Llama (via Groq, Together, etc.)
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  'meta-llama/Llama-3.3-70B-Instruct-Turbo': { input: 0.88, output: 0.88 },
};

// In-memory cache for DB pricing (refreshed every 5 min)
var pricingCache: { data: Record<string, { input: number; output: number }>; expiresAt: number } | null = null;
var PRICING_CACHE_TTL = 5 * 60_000;

async function estimateCostAsync(
  hooks: import('./types.js').RuntimeHooks,
  model: import('./types.js').ModelConfig,
  inputTokens: number,
  outputTokens: number,
): Promise<number> {
  // Try DB pricing via hook
  if (hooks.getModelPricing) {
    try {
      var dbPricing = await hooks.getModelPricing(model.provider, model.modelId);
      if (dbPricing) {
        return (inputTokens * dbPricing.inputCostPerMillion + outputTokens * dbPricing.outputCostPerMillion) / 1_000_000;
      }
    } catch {}
  }
  // Fall back to built-in pricing
  var p = FALLBACK_PRICES[model.modelId] || { input: 3, output: 15 };
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

function buildAssistantMessage(response: LLMResponse): AgentMessage {
  var content: import('./types.js').ContentBlock[] = [];

  if (response.thinkingContent) {
    content.push({ type: 'thinking', thinking: response.thinkingContent });
  }

  if (response.textContent) {
    content.push({ type: 'text', text: response.textContent });
  }

  for (var tc of response.toolCalls) {
    content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
  }

  return {
    role: 'assistant',
    content: content.length === 1 && content[0].type === 'text'
      ? (content[0] as { type: 'text'; text: string }).text
      : content,
    tool_calls: response.toolCalls.length > 0 ? response.toolCalls : undefined,
  };
}

function buildResult(
  messages: AgentMessage[],
  status: SessionState['status'],
  turnCount: number,
  textContent: string,
  stopReason: string,
): AgentLoopResult {
  return {
    messages,
    status,
    tokenCount: estimateMessageTokens(messages),
    turnCount,
    textContent,
    stopReason,
  };
}

/**
 * Compact the context window using LLM-generated summary.
 *
 * When the context fills up (80% of window), this function:
 * 1. Takes all messages except system + last 20
 * 2. Asks the LLM to produce a structured summary preserving ALL critical data
 * 3. Saves the summary to persistent agent memory (survives crashes)
 * 4. Returns: system messages + summary + last 20 messages
 *
 * The summary is structured to preserve:
 * - Original task/goal
 * - Work completed so far
 * - Key data: IDs, paths, URLs, names, numbers (exact values, not paraphrases)
 * - Decisions made and why
 * - Current state and next steps
 * - Errors encountered and resolutions
 *
 * Fallback: If LLM call fails, uses extractive summary (500 chars per message)
 * which is still much better than losing context entirely.
 */
var KEEP_RECENT_MESSAGES = 20;

async function compactContext(
  messages: AgentMessage[],
  config: AgentConfig,
  hooks: RuntimeHooks,
  options?: { apiKey?: string; sessionId?: string },
): Promise<AgentMessage[]> {
  var systemMessages = messages.filter(function(m) { return m.role === 'system'; });
  var nonSystem = messages.filter(function(m) { return m.role !== 'system'; });

  if (nonSystem.length <= KEEP_RECENT_MESSAGES) return messages;

  // Find a safe cut point that doesn't split tool_use/tool_result pairs.
  // We start at the desired cut index and walk backwards until we find a safe boundary.
  var desiredCut = nonSystem.length - KEEP_RECENT_MESSAGES;
  var cutIndex = desiredCut;

  // A safe cut point is one where the message AT cutIndex (first of keepRecent)
  // does NOT start with tool_result blocks that reference tool_use from the message before it.
  for (var ci = desiredCut; ci > 0; ci--) {
    var msg = nonSystem[ci];
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      var hasToolResult = (msg.content as any[]).some((b: any) => b.type === 'tool_result');
      if (hasToolResult) {
        // This message has tool_results — cutting here would orphan them.
        // Move cut point earlier (include this message AND its preceding assistant tool_use).
        continue;
      }
    }
    cutIndex = ci;
    break;
  }

  var keepRecent = nonSystem.slice(cutIndex);
  var toSummarize = nonSystem.slice(0, cutIndex);

  console.log(`[compaction] Compacting ${toSummarize.length} messages (keeping ${keepRecent.length} recent + ${systemMessages.length} system)`);

  // Build transcript of messages to summarize
  var transcript: string[] = [];
  for (var msg of toSummarize) {
    var text = '';
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      var parts: string[] = [];
      for (var block of msg.content) {
        if (block && typeof block === 'object') {
          if ((block as any).type === 'text') parts.push((block as any).text || '');
          else if ((block as any).type === 'tool_use') parts.push(`[Tool Call: ${(block as any).name}(${JSON.stringify((block as any).input || {}).slice(0, 300)})]`);
          else if ((block as any).type === 'tool_result') {
            var resultContent = String((block as any).content || '').slice(0, 500);
            parts.push(`[Tool Result: ${resultContent}]`);
          }
        }
      }
      text = parts.join('\n');
    }
    if (text.length > 0) {
      transcript.push(`[${msg.role}]: ${text.slice(0, 1000)}`);
    }
  }

  var transcriptText = transcript.join('\n\n');
  if (transcriptText.length > 100_000) {
    transcriptText = transcriptText.slice(0, 100_000) + '\n\n... (earlier messages truncated for summary)';
  }

  // Try LLM-powered summarization
  var summaryText = '';
  var usedLLM = false;

  if (options?.apiKey) {
    try {
      var summaryPrompt: AgentMessage[] = [
        {
          role: 'system' as const,
          content: `You are a context summarizer for an AI agent that is in the middle of a long-running task. Your job is to create a comprehensive summary that preserves ALL critical information the agent needs to continue working seamlessly.

Your summary MUST include ALL of these sections:

## Original Task
What was the agent asked to do? What's the overall goal?

## Work Completed
What has been accomplished so far? List specific actions taken, in order.

## Key Data & References
ALL important identifiers, file paths, URLs, names, numbers, email addresses, message IDs, thread IDs, API response values, folder IDs, document IDs — ANYTHING the agent might need to reference later. Be exhaustive and use exact values. Losing a single ID means the agent cannot continue its work.

## Decisions Made
What choices were made and why? Include any corrections or changes in approach.

## Current State
Where did things leave off? What was the agent in the middle of doing?

## Pending / Next Steps
What still needs to be done? Any scheduled tasks, follow-ups, or promises made?

## Errors & Lessons
Any errors encountered, what caused them, and how they were resolved. Include workarounds discovered.

CRITICAL: This summary REPLACES the full conversation. If you omit something, the agent loses it forever. When in doubt, include it. Use exact values — never paraphrase IDs, paths, or technical data.`,
        },
        {
          role: 'user' as const,
          content: `Summarize this conversation transcript:\n\n${transcriptText}`,
        },
      ];

      var summaryResponse = await callLLM(
        {
          provider: config.model.provider,
          modelId: config.model.modelId,
          apiKey: options.apiKey,
        },
        summaryPrompt,
        [],
        { maxTokens: 4096, temperature: 0.3 },
      );

      if (summaryResponse.textContent && summaryResponse.textContent.length > 50) {
        summaryText = summaryResponse.textContent;
        usedLLM = true;
        console.log(`[compaction] LLM summary generated: ${summaryText.length} chars (${summaryResponse.usage?.inputTokens || 0} in / ${summaryResponse.usage?.outputTokens || 0} out tokens)`);
      }
    } catch (err: any) {
      console.warn(`[compaction] LLM summary failed: ${err.message} — using extractive fallback`);
    }
  }

  // Fallback: extractive summary (keeps 500 chars per message instead of old 200)
  if (!usedLLM) {
    var extractParts: string[] = [];
    extractParts.push(`[Context Summary — ${toSummarize.length} earlier messages compacted (extractive fallback)]`);
    extractParts.push('');

    for (var msg2 of toSummarize) {
      if (typeof msg2.content === 'string' && msg2.content.length > 0) {
        extractParts.push(`[${msg2.role}]: ${msg2.content.slice(0, 500)}`);
      } else if (Array.isArray(msg2.content)) {
        for (var block2 of msg2.content) {
          if (block2 && typeof block2 === 'object') {
            if ((block2 as any).type === 'text' && (block2 as any).text?.length > 0) {
              extractParts.push(`[${msg2.role}]: ${(block2 as any).text.slice(0, 500)}`);
            } else if ((block2 as any).type === 'tool_use') {
              extractParts.push(`[tool_call]: ${(block2 as any).name}(${JSON.stringify((block2 as any).input || {}).slice(0, 400)})`);
            } else if ((block2 as any).type === 'tool_result') {
              extractParts.push(`[tool_result]: ${String((block2 as any).content || '').slice(0, 400)}`);
            }
          }
        }
      }
    }

    summaryText = extractParts.join('\n');
    if (summaryText.length > 20_000) {
      summaryText = summaryText.slice(0, 20_000) + '\n\n... (truncated)';
    }
    console.log(`[compaction] Extractive fallback: ${summaryText.length} chars`);
  }

  // Save to persistent agent memory (survives crashes, available to future sessions)
  try {
    await hooks.onContextCompaction(options?.sessionId || '', config.agentId, summaryText);
    console.log(`[compaction] Summary persisted to agent memory`);
  } catch (memErr: any) {
    console.warn(`[compaction] Memory save failed: ${memErr?.message}`);
  }

  var summaryMessage: AgentMessage = {
    role: 'user' as const,
    content: `[CONTEXT COMPACTION — Your conversation history was summarized to fit the context window. Below is a comprehensive summary of everything that happened before your most recent ${keepRecent.length} messages. Treat this as ground truth.]\n\n${summaryText}`,
  };

  var result = [...systemMessages, summaryMessage, ...keepRecent];
  console.log(`[compaction] ${messages.length} messages → ${result.length} messages`);
  return result;
}
