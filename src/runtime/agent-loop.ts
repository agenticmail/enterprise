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
const DEFAULT_CONTEXT_WINDOW = 1_000_000; // 1M — most frontier models support this (Feb 2026)
const COMPACTION_THRESHOLD = 0.8; // compact when 80% of context used

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
  var toolTimeout = options.toolTimeoutMs ?? 30_000;

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
      messages = await compactContext(messages, config, hooks);
    }

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

    // Call LLM
    var llmResponse: LLMResponse;
    try {
      llmResponse = await callLLM(
        {
          provider: config.model.provider,
          modelId: config.model.modelId,
          apiKey: options.apiKey,
          thinkingLevel: config.model.thinkingLevel,
          baseUrl: config.model.baseUrl,
          headers: config.model.headers,
        },
        messages,
        toolDefs,
        { maxTokens, temperature, signal: options.signal },
        options.onEvent,
        options.retryConfig,
      );
    } catch (err: any) {
      var errorEvent: StreamEvent = { type: 'error', message: err.message, retryable: false };
      options.onEvent?.(errorEvent);
      return buildResult(messages, 'failed', turnCount, totalTextContent, 'error');
    }

    // Record LLM usage for budget tracking
    if (hooks.recordLLMUsage && llmResponse.usage) {
      try {
        var costUsd = await estimateCostAsync(hooks, config.model, llmResponse.usage.inputTokens, llmResponse.usage.outputTokens);
        await hooks.recordLLMUsage(config.agentId, config.orgId, {
          inputTokens: llmResponse.usage.inputTokens,
          outputTokens: llmResponse.usage.outputTokens,
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

        var { result, content } = await executeTool(tool, effectiveToolCall, {
          timeoutMs: toolTimeout,
          signal: options.signal,
        });

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
      messages = await compactContext(messages, config, hooks);

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
 * Compact context by summarizing older messages.
 * Keeps system prompt + last N messages, summarizes the rest.
 */
async function compactContext(
  messages: AgentMessage[],
  config: AgentConfig,
  hooks: RuntimeHooks,
): Promise<AgentMessage[]> {
  // Keep system messages and last 10 messages
  var systemMessages = messages.filter(function(m) { return m.role === 'system'; });
  var nonSystem = messages.filter(function(m) { return m.role !== 'system'; });

  if (nonSystem.length <= 10) return messages;

  var keepRecent = nonSystem.slice(-10);
  var toSummarize = nonSystem.slice(0, -10);

  // Build a text summary of older messages
  var summaryParts: string[] = [];
  for (var msg of toSummarize) {
    var text = typeof msg.content === 'string'
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.filter(function(b: any) { return b.type === 'text'; }).map(function(b: any) { return b.text; }).join(' ')
        : '';
    if (text.length > 0) {
      summaryParts.push(`[${msg.role}]: ${text.slice(0, 200)}`);
    }
  }

  var summaryText = `[Context Summary - ${toSummarize.length} earlier messages]\n${summaryParts.join('\n')}`;
  if (summaryText.length > 4000) {
    summaryText = summaryText.slice(0, 4000) + '\n... (truncated)';
  }

  // Notify hooks about compaction
  try {
    await hooks.onContextCompaction('', config.agentId, summaryText);
  } catch {}

  var summaryMessage: AgentMessage = { role: 'system', content: summaryText };

  return [...systemMessages, summaryMessage, ...keepRecent];
}
