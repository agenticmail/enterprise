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
import { compactContext, COMPACTION_THRESHOLD } from './compaction.js';
import { ageStaleMessages, truncateToolResults } from './message-trimmer.js';

// ─── Constants ───────────────────────────────────────────

const DEFAULT_MAX_TURNS = 0; // 0 = unlimited
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_CONTEXT_WINDOW = 2_000_000; // 1M — most frontier models support this (Feb 2026)
// COMPACTION_THRESHOLD imported from ./compaction.js

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
  let result = messages.map(m => {
    if (!Array.isArray(m.content)) return m;

    if (m.role === 'user') {
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

  // ─── Pass 3: Fix adjacency — tool_result MUST immediately follow its tool_use ───
  // If user messages got injected between assistant tool_use and user tool_result, reorder.
  for (let i = 0; i < result.length; i++) {
    const m = result[i];
    if (m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    const toolUseIds = (m.content as any[])
      .filter((b: any) => b.type === 'tool_use' && b.id)
      .map((b: any) => b.id);
    if (toolUseIds.length === 0) continue;

    // The very next message must be a user message with tool_results for these IDs
    const next = result[i + 1];
    if (next && next.role === 'user' && Array.isArray(next.content)) {
      const hasResults = (next.content as any[]).some((b: any) => b.type === 'tool_result' && toolUseIds.includes(b.tool_use_id));
      if (hasResults) continue; // adjacency is fine
    }

    // Search further for the tool_result message and move it
    for (let j = i + 2; j < result.length; j++) {
      const candidate = result[j];
      if (candidate.role !== 'user' || !Array.isArray(candidate.content)) continue;
      const matchingResults = (candidate.content as any[]).filter((b: any) =>
        b.type === 'tool_result' && toolUseIds.includes(b.tool_use_id));
      if (matchingResults.length === 0) continue;

      // Extract matching tool_results from their current position
      const remaining = (candidate.content as any[]).filter((b: any) =>
        !(b.type === 'tool_result' && toolUseIds.includes(b.tool_use_id)));

      // Build the tool_result message to insert right after the tool_use
      const toolResultMsg: AgentMessage = { role: 'user', content: matchingResults };

      // Update or remove the source message
      if (remaining.length === 0) {
        result.splice(j, 1); // remove empty message
      } else {
        result[j] = { ...candidate, content: remaining };
      }

      // Insert right after the tool_use message
      result.splice(i + 1, 0, toolResultMsg);
      fixed = true;
      console.log(`[agent-loop] Reordered tool_result to fix adjacency (moved from index ${j} to ${i + 1})`);
      break;
    }

    // If no tool_result found anywhere, remove the tool_use blocks (truly orphaned)
    // Check if adjacency is STILL broken for this specific message
    const nextAfterFix = result[i + 1];
    const adjacencyOk = nextAfterFix && nextAfterFix.role === 'user' && Array.isArray(nextAfterFix.content) &&
      (nextAfterFix.content as any[]).some((b: any) => b.type === 'tool_result' && toolUseIds.includes(b.tool_use_id));
    if (!adjacencyOk) {
      const filtered = (m.content as any[]).filter((b: any) =>
        !(b.type === 'tool_use' && toolUseIds.includes(b.id)));
      if (filtered.length === 0) {
        result.splice(i, 1);
        i--;
      } else {
        result[i] = { ...m, content: filtered };
      }
      fixed = true;
    }
  }

  if (fixed) console.log(`[agent-loop] Fixed orphaned/non-adjacent tool_use/tool_result blocks`);
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
  /** Runtime reference for tool access */
  runtime?: any;
  /** Fallback models to try if primary model fails */
  fallbackModels?: string[];
  /** Resolve API key for a provider dynamically */
  resolveApiKey?: (provider: string) => Promise<string | undefined>;
}

export interface AgentLoopResult {
  messages: AgentMessage[];
  status: SessionState['status'];
  tokenCount: number;
  turnCount: number;
  textContent: string;
  stopReason: string;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
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
  // Expose tools globally for cross-tool calls (e.g., browser → meeting_join redirect)
  (globalThis as any).__currentSessionTools = config.tools;

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
  var cumulativeUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  // Emit session start
  var sessionStartEvent: StreamEvent = { type: 'session_start', sessionId: config.agentId };
  options.onEvent?.(sessionStartEvent);

  while (maxTurns === 0 || turnCount < maxTurns) {
    // Check abort
    if (options.signal?.aborted) {
      return buildResult(messages, 'paused', turnCount, totalTextContent, 'aborted', cumulativeUsage);
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

    // ─── Stale tool result aging (universal — applies to ALL tools) ───
    var staleTrimCount = ageStaleMessages(messages, turnCount);
    if (staleTrimCount > 0 && turnCount > 3) {
      console.log(`[agent-loop] Stale aging: trimmed ${staleTrimCount} old messages at turn ${turnCount}`);
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
          console.log(`[agent-loop] BUDGET EXCEEDED for agent ${config.agentId}: ${budgetResult.reason}`);
          var budgetEvent: StreamEvent = { type: 'budget_exceeded', reason: budgetResult.reason || 'Budget limit reached' };
          options.onEvent?.(budgetEvent);
          return buildResult(messages, 'completed', turnCount, totalTextContent, 'budget_exceeded', cumulativeUsage);
        }
        if (budgetResult.remainingUsd !== undefined && budgetResult.remainingUsd < 1.0) {
          var warnEvent: StreamEvent = { type: 'budget_warning', remainingUsd: budgetResult.remainingUsd, usedUsd: 0 };
          options.onEvent?.(warnEvent);
        }
      } catch {}
    }

    // Call LLM with retry for transient errors
    var llmCallStart = Date.now();
    var llmResponse: LLMResponse = undefined as any;
    var llmRetryMax = 3;
    var llmRetryMaxRateLimit = 5; // More retries for rate limits (with longer backoff)
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
        console.log(`[agent-loop] LLM responded in ${Date.now() - llmCallStart}ms (${estimateMessageTokens(messages)} input tokens)`);
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
        var isRateLimit = /429|rate.limit|rate_limit/i.test(err.message);
        var isTransient = isRateLimit || /premature close|ECONNRESET|ETIMEDOUT|socket hang up|fetch failed|network|502|503|529|overloaded/i.test(err.message);
        var effectiveMax = isRateLimit ? llmRetryMaxRateLimit : llmRetryMax;
        if (isTransient && llmAttempt < effectiveMax) {
          // Rate limits get longer backoff (30s base) vs transient errors (normal backoff)
          var delay = isRateLimit ? Math.min(30000 * Math.pow(2, llmAttempt), 120000) : llmRetryDelay * Math.pow(2, llmAttempt);
          console.warn(`[agent-loop] LLM call failed (attempt ${llmAttempt + 1}/${llmRetryMax + 1}): ${err.message} — retrying in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        // ─── Model Fallback: Try backup models before giving up ───
        var fallbackModels = (options as any).fallbackModels as string[] | undefined;
        if (fallbackModels && fallbackModels.length > 0) {
          var primaryModel = config.model.provider + '/' + config.model.modelId;
          var remainingFallbacks = fallbackModels.filter(function(m) { return m !== primaryModel; });
          for (var fi = 0; fi < remainingFallbacks.length; fi++) {
            var fbModel = remainingFallbacks[fi];
            var fbParts = fbModel.split('/');
            var fbProvider = fbParts[0];
            var fbModelId = fbParts.slice(1).join('/');
            console.log(`[agent-loop] Primary model failed — trying fallback ${fi + 1}/${remainingFallbacks.length}: ${fbModel}`);
            try {
              var fbApiKey = options.apiKey;
              // Resolve API key for fallback provider if different
              if (fbProvider !== config.model.provider && (options as any).resolveApiKey) {
                var resolved = await (options as any).resolveApiKey(fbProvider);
                if (resolved) fbApiKey = resolved;
              }
              llmResponse = await callLLM(
                { provider: fbProvider, modelId: fbModelId, apiKey: fbApiKey, thinkingLevel: config.model.thinkingLevel },
                messages, toolDefs,
                { maxTokens, temperature, signal: options.signal },
                options.onEvent,
                options.retryConfig,
              );
              console.log(`[agent-loop] Fallback model ${fbModel} succeeded in ${Date.now() - llmCallStart}ms`);
              break;
            } catch (fbErr: any) {
              console.warn(`[agent-loop] Fallback model ${fbModel} also failed: ${fbErr.message}`);
              if (fi === remainingFallbacks.length - 1) {
                // All fallbacks exhausted
                console.error(`[agent-loop] All models failed (primary + ${remainingFallbacks.length} fallbacks): ${err.message}`);
                var errorEvent: StreamEvent = { type: 'error', message: `All models failed. Primary: ${err.message}`, retryable: false };
                options.onEvent?.(errorEvent);
                return buildResult(messages, 'failed', turnCount, totalTextContent, 'error', cumulativeUsage);
              }
            }
          }
          if (llmResponse) break; // fallback succeeded, exit retry loop
        }

        if (!llmResponse) {
          console.error(`[agent-loop] LLM call failed after ${llmAttempt + 1} attempts: ${err.message}`);
          var errorEvent2: StreamEvent = { type: 'error', message: err.message, retryable: isTransient };
          options.onEvent?.(errorEvent2);
          return buildResult(messages, 'failed', turnCount, totalTextContent, 'error', cumulativeUsage);
        }
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
        cumulativeUsage.inputTokens += usageInput;
        cumulativeUsage.outputTokens += usageOutput;
        cumulativeUsage.costUsd += costUsd;
      } catch {}
    }

    // Build assistant message from response
    var assistantMessage = buildAssistantMessage(llmResponse);
    (assistantMessage as any)._turn = turnCount;
    messages.push(assistantMessage);
    totalTextContent += llmResponse.textContent;

    // Handle stop reasons
    if (llmResponse.stopReason === 'end_turn') {
      lastStopReason = 'end_turn';

      // ─── Continuation nudge: if the agent used a messaging tool (telegram_send,
      // whatsapp_send, etc.) in this turn cycle, it may have sent a status update
      // while intending to keep working. Don't let the session die — nudge it once
      // to continue. If it truly has nothing left, it'll end_turn again cleanly.
      if (turnCount > 1 && turnCount < (maxTurns || 50) - 2 && !(options as any)._continuationNudged) {
        var usedMessagingTool = false;
        for (var mi = messages.length - 1; mi >= 0 && mi >= messages.length - 4; mi--) {
          var msg = messages[mi];
          if (msg.role === 'assistant' && Array.isArray(msg.content)) {
            for (var bl of msg.content) {
              if (bl.type === 'tool_use' && /^(telegram_send|whatsapp_send|gmail_send|signal_send|discord_send|imessage_send|slack_send)$/.test(bl.name)) {
                usedMessagingTool = true;
              }
            }
          }
        }
        if (usedMessagingTool) {
          console.log(`[agent-loop] Continuation nudge — agent used messaging tool then ended turn, checking if more work needed`);
          (options as any)._continuationNudged = true; // only nudge once per session
          messages.push({ role: 'user', content: '[System] You sent a message to the user. If you have more work to do (tool calls, analysis, scanning, etc.), continue now. If you are truly done, respond with just "done".' });
          turnCount++;
          continue;
        }
      }

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

        // Track tool start in real-time status
        try {
          const { describeToolActivity } = await import('../engine/agent-status.js');
          if ((options as any).runtime?._reportStatus) {
            (options as any).runtime._reportStatus({
              status: 'online',
              currentActivity: { type: 'tool_call', detail: describeToolActivity(toolCall.name), tool: toolCall.name, startedAt: new Date().toISOString() },
            });
          }
        } catch { /* non-blocking */ }

        var { result, content } = await executeTool(tool, effectiveToolCall, {
          timeoutMs: toolTimeout,
          signal: options.signal,
        });

        if (!result.success) {
          console.log(`[agent-loop] ❌ Tool ${toolCall.name} failed: ${result.error?.slice(0, 200)}`);
        } else {
          console.log(`[agent-loop] ✅ Tool ${toolCall.name} succeeded (${content.length} chars): ${content.slice(0, 300)}`);
        }

        // Record tool call to activity tracker (single lightweight event, no extra DB writes)
        try {
          const { activity } = await import('../engine/routes.js');
          activity.recordToolCallCompact({
            agentId: config.agentId, orgId: config.orgId, sessionId,
            tool: toolCall.name, success: !!result.success,
            durationMs: result.durationMs, error: result.error?.slice(0, 200),
          });
        } catch { /* non-blocking */ }

        // Track tool end in real-time status
        try {
          if ((options as any).runtime?._reportStatus) {
            (options as any).runtime._reportStatus({ currentActivity: null });
          }
        } catch { /* non-blocking */ }

        // Dynamic tool injection — request_tools returns new tools to add to the session
        if ((result as any)._dynamicTools?.length) {
          var newTools = (result as any)._dynamicTools as any[];
          var existingNames = new Set(config.tools.map((t: any) => t.name));
          var added = 0;
          for (var nt of newTools) {
            if (!existingNames.has(nt.name)) {
              config.tools.push(nt);
              toolDefs.push({ name: nt.name, description: nt.description, input_schema: nt.parameters });
              registry.register([nt]); // Register in execution registry so tool can actually be called
              existingNames.add(nt.name);
              added++;
            }
          }
          if (added) {
            console.log(`[agent-loop] Dynamically loaded ${added} new tools`);
            (globalThis as any).__currentSessionTools = config.tools;
          }
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

      // Inline truncation — cap each tool result to prevent 17K+ results from snowballing
      var cappedToolResults = truncateToolResults(toolResults);

      // Add tool results as user message (Anthropic format)
      messages.push({
        role: 'user',
        content: cappedToolResults.map(function(tr) {
          return { type: 'tool_result' as const, tool_use_id: tr.tool_use_id, content: tr.content, is_error: tr.is_error };
        }),
        tool_results: cappedToolResults.map(function(tr) {
          return { tool_use_id: tr.tool_use_id, content: tr.content, is_error: tr.is_error };
        }),
        _turn: turnCount,
      } as any);

      // Incremental checkpoint — persist messages to DB after each turn
      if (options.onCheckpoint) {
        try {
          var currentTokens = estimateMessageTokens(messages);
          await options.onCheckpoint({ messages, turnCount, tokenCount: currentTokens });
        } catch (err: any) {
          console.warn('[runtime] Checkpoint save error:', err.message);
        }
      }

      // ── Auto-end optimization: skip second LLM call for terminal tools ──
      // If every tool call in this turn was a "terminal" tool (sends a message, no further
      // reasoning needed) AND all succeeded, end the session without another LLM round-trip.
      // Saves ~$0.03 and ~3s per chat message.
      var TERMINAL_TOOLS = new Set([
        'google_chat_send_message', 'google_chat_send_card', 'google_chat_send_dm',
        'google_chat_reply_message',
      ]);
      var allTerminal = llmResponse.toolCalls.length > 0
        && llmResponse.toolCalls.every(function(tc: any) { return TERMINAL_TOOLS.has(tc.name); })
        && toolResults.every(function(tr: any) { return !tr.is_error; });
      if (allTerminal) {
        console.log(`[agent-loop] ⚡ Auto-end: all tools were terminal send tools, skipping confirmation LLM call`);
        lastStopReason = 'end_turn';
        var autoEndEvent: StreamEvent = { type: 'turn_end', stopReason: 'end_turn' };
        options.onEvent?.(autoEndEvent);
        break;
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
    cumulativeUsage,
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
  usage?: { inputTokens: number; outputTokens: number; costUsd: number },
): AgentLoopResult {
  return {
    messages,
    status,
    tokenCount: estimateMessageTokens(messages),
    turnCount,
    textContent,
    stopReason,
    usage,
  };
}

// Context compaction is now in ./compaction.ts
// Exported: compactContext, needsCompaction, COMPACTION_THRESHOLD
