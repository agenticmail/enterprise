/**
 * Multi-Provider LLM Client
 *
 * Unified streaming interface for 17+ LLM providers.
 * Yields StreamEvent objects for real-time UI updates.
 *
 * API Types:
 *   - anthropic          — Anthropic Messages API (@anthropic-ai/sdk)
 *   - openai-compatible  — OpenAI Chat Completions (openai SDK with baseURL)
 *                          Supports: OpenAI, DeepSeek, xAI, Mistral, Groq,
 *                          Together, Fireworks, Moonshot, Cerebras, OpenRouter,
 *                          NVIDIA, vLLM, LM Studio, LiteLLM, custom endpoints
 *   - google             — Google Gemini REST API (fetch, no SDK needed)
 *   - ollama             — Ollama native /api/chat (fetch, local)
 */

import type { AgentMessage, StreamEvent, ToolCall } from './types.js';
import { PROVIDER_REGISTRY, resolveProvider, type ApiType, type CustomProviderDef } from './providers.js';

// ─── Types ───────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

export interface LLMCallOptions {
  maxTokens: number;
  temperature: number;
  signal?: AbortSignal;
}

export interface RetryConfig {
  /** Maximum duration to keep retrying in ms (default: 3600000 = 1 hour) */
  maxRetryDurationMs?: number;
  /** Max individual retries — secondary safety cap (default: 200) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000 = 1s) */
  baseDelayMs?: number;
  /** Max delay per retry in ms (default: 60000 = 1 min) */
  maxDelayMs?: number;
}

export interface LLMResponse {
  events: StreamEvent[];
  toolCalls: ToolCall[];
  textContent: string;
  thinkingContent: string;
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage?: { inputTokens: number; outputTokens: number };
}

// ─── Token Estimation ────────────────────────────────────

/** Rough token estimate: ~4 chars per token for English text */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(messages: AgentMessage[]): number {
  var total = 0;
  for (var msg of messages) {
    if (typeof msg.content === 'string') {
      total += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (var block of msg.content) {
        if (block.type === 'text') total += estimateTokens(block.text);
        else if (block.type === 'thinking') total += estimateTokens(block.thinking);
        else if (block.type === 'tool_use') total += estimateTokens(JSON.stringify(block.input));
        else if (block.type === 'tool_result') {
          var resultContent = typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content);
          total += estimateTokens(resultContent);
        }
      }
    }
    if (msg.tool_calls) {
      for (var tc of msg.tool_calls) {
        total += estimateTokens(tc.name + JSON.stringify(tc.input));
      }
    }
    if (msg.tool_results) {
      for (var tr of msg.tool_results) {
        total += estimateTokens(tr.content);
      }
    }
  }
  return total;
}

// ─── Anthropic Client ────────────────────────────────────

function convertToAnthropicMessages(messages: AgentMessage[]): any[] {
  var result: any[] = [];
  for (var msg of messages) {
    if (msg.role === 'system') continue; // system handled separately

    if (msg.role === 'user') {
      // Check for tool results in user messages
      if (msg.tool_results && msg.tool_results.length > 0) {
        var toolResultBlocks = msg.tool_results.map(function(tr) {
          return {
            type: 'tool_result',
            tool_use_id: tr.tool_use_id,
            content: tr.content,
            is_error: tr.is_error || false,
          };
        });
        result.push({ role: 'user', content: toolResultBlocks });
      } else {
        result.push({
          role: 'user',
          content: typeof msg.content === 'string' ? msg.content : msg.content,
        });
      }
    } else if (msg.role === 'assistant') {
      var content: any[] = [];
      if (typeof msg.content === 'string') {
        if (msg.content) content.push({ type: 'text', text: msg.content });
      } else if (Array.isArray(msg.content)) {
        content = msg.content as any[];
      }
      // Append tool_use blocks from tool_calls
      if (msg.tool_calls) {
        for (var tc of msg.tool_calls) {
          content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
        }
      }
      if (content.length > 0) {
        result.push({ role: 'assistant', content });
      }
    }
  }
  return result;
}

function extractSystemPrompt(messages: AgentMessage[]): string {
  var systemParts: string[] = [];
  for (var msg of messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string') {
        systemParts.push(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (var block of msg.content) {
          if (block.type === 'text') systemParts.push(block.text);
        }
      }
    }
  }
  return systemParts.join('\n\n');
}

async function callAnthropic(
  config: { modelId: string; apiKey: string; thinkingLevel?: string },
  messages: AgentMessage[],
  tools: ToolDefinition[],
  options: LLMCallOptions,
  onEvent?: (event: StreamEvent) => void,
): Promise<LLMResponse> {
  // Dynamic import — SDK may not be installed
  var Anthropic: any;
  try {
    var mod = await import('@anthropic-ai/sdk');
    Anthropic = mod.default || mod.Anthropic;
  } catch {
    throw new Error(
      'Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk'
    );
  }

  var client = new Anthropic({ apiKey: config.apiKey });
  var systemPrompt = extractSystemPrompt(messages);
  var anthropicMessages = convertToAnthropicMessages(messages);

  var requestBody: Record<string, any> = {
    model: config.modelId,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    messages: anthropicMessages,
  };

  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }

  if (tools.length > 0) {
    requestBody.tools = tools.map(function(t) {
      return { name: t.name, description: t.description, input_schema: t.input_schema };
    });
  }

  // Extended thinking support
  if (config.thinkingLevel && config.thinkingLevel !== 'off') {
    var budgetMap: Record<string, number> = { low: 2048, medium: 8192, high: 16384 };
    requestBody.thinking = {
      type: 'enabled',
      budget_tokens: budgetMap[config.thinkingLevel] || 8192,
    };
    // Thinking requires temperature = 1
    requestBody.temperature = 1;
  }

  var events: StreamEvent[] = [];
  var toolCalls: ToolCall[] = [];
  var textParts: string[] = [];
  var thinkingParts: string[] = [];
  var stopReason: LLMResponse['stopReason'] = 'end_turn';
  var usage = { inputTokens: 0, outputTokens: 0 };

  // Use streaming
  var stream = client.messages.stream(requestBody, {
    signal: options.signal,
  });

  for await (var event of stream) {
    if (event.type === 'content_block_delta') {
      var delta = event.delta as any;
      if (delta.type === 'text_delta') {
        textParts.push(delta.text);
        var textEvent: StreamEvent = { type: 'text_delta', text: delta.text };
        events.push(textEvent);
        onEvent?.(textEvent);
      } else if (delta.type === 'thinking_delta') {
        thinkingParts.push(delta.thinking);
        var thinkEvent: StreamEvent = { type: 'thinking_delta', text: delta.thinking };
        events.push(thinkEvent);
        onEvent?.(thinkEvent);
      } else if (delta.type === 'input_json_delta') {
        // Tool input streaming — collected at content_block_stop
      }
    } else if (event.type === 'content_block_start') {
      var block = event.content_block as any;
      if (block?.type === 'tool_use') {
        var tcStartEvent: StreamEvent = {
          type: 'tool_call_start',
          toolName: block.name,
          toolCallId: block.id,
        };
        events.push(tcStartEvent);
        onEvent?.(tcStartEvent);
      }
    } else if (event.type === 'message_delta') {
      var msgDelta = event.delta as any;
      if (msgDelta.stop_reason) {
        stopReason = msgDelta.stop_reason;
      }
      if (event.usage) {
        usage.outputTokens += (event.usage as any).output_tokens || 0;
      }
    } else if (event.type === 'message_start') {
      var message = (event as any).message;
      if (message?.usage) {
        usage.inputTokens = message.usage.input_tokens || 0;
        usage.outputTokens = message.usage.output_tokens || 0;
      }
    }
  }

  // Collect final message for tool_use blocks
  var finalMessage = await stream.finalMessage();
  if (finalMessage.content) {
    for (var block of finalMessage.content) {
      if ((block as any).type === 'tool_use') {
        var tuBlock = block as any;
        toolCalls.push({
          id: tuBlock.id,
          name: tuBlock.name,
          input: tuBlock.input || {},
        });
      }
    }
  }
  if (finalMessage.usage) {
    usage.inputTokens = finalMessage.usage.input_tokens;
    usage.outputTokens = finalMessage.usage.output_tokens;
  }
  stopReason = finalMessage.stop_reason as LLMResponse['stopReason'];

  return {
    events,
    toolCalls,
    textContent: textParts.join(''),
    thinkingContent: thinkingParts.join(''),
    stopReason,
    usage,
  };
}

// ─── OpenAI-Compatible Client ────────────────────────────
// Used by: OpenAI, DeepSeek, xAI, Mistral, Groq, Together,
// Fireworks, Moonshot, Cerebras, OpenRouter, NVIDIA, vLLM,
// LM Studio, LiteLLM, and any custom OpenAI-compatible endpoint.

function convertToOpenAIMessages(messages: AgentMessage[]): any[] {
  var result: any[] = [];
  for (var msg of messages) {
    if (msg.role === 'system') {
      result.push({
        role: 'system',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      });
    } else if (msg.role === 'user') {
      if (msg.tool_results && msg.tool_results.length > 0) {
        for (var tr of msg.tool_results) {
          result.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id,
            content: tr.content,
          });
        }
      } else {
        result.push({
          role: 'user',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      }
    } else if (msg.role === 'assistant') {
      var entry: any = {
        role: 'assistant',
        content: typeof msg.content === 'string' ? msg.content : null,
      };
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        entry.tool_calls = msg.tool_calls.map(function(tc) {
          return {
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          };
        });
      }
      result.push(entry);
    }
  }
  return result;
}

async function callOpenAICompatible(
  config: { modelId: string; apiKey: string; baseURL?: string; headers?: Record<string, string> },
  messages: AgentMessage[],
  tools: ToolDefinition[],
  options: LLMCallOptions,
  onEvent?: (event: StreamEvent) => void,
): Promise<LLMResponse> {
  var OpenAI: any;
  try {
    var mod = await import('openai');
    OpenAI = mod.default || mod.OpenAI;
  } catch {
    throw new Error(
      'OpenAI SDK not installed. Run: npm install openai'
    );
  }

  var clientOpts: Record<string, any> = { apiKey: config.apiKey || 'not-needed' };
  if (config.baseURL) clientOpts.baseURL = config.baseURL;
  if (config.headers) clientOpts.defaultHeaders = config.headers;
  var client = new OpenAI(clientOpts);
  var openaiMessages = convertToOpenAIMessages(messages);

  var requestBody: Record<string, any> = {
    model: config.modelId,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    messages: openaiMessages,
    stream: true,
  };

  if (tools.length > 0) {
    requestBody.tools = tools.map(function(t) {
      return {
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      };
    });
  }

  var events: StreamEvent[] = [];
  var toolCalls: ToolCall[] = [];
  var textParts: string[] = [];
  var stopReason: LLMResponse['stopReason'] = 'end_turn';
  var usage = { inputTokens: 0, outputTokens: 0 };

  // Track partial tool calls
  var partialToolCalls = new Map<number, { id: string; name: string; args: string }>();

  var stream = await client.chat.completions.create(requestBody, {
    signal: options.signal,
  });

  for await (var chunk of stream) {
    var choice = chunk.choices?.[0];
    if (!choice) continue;

    var delta = choice.delta;

    // Text content
    if (delta?.content) {
      textParts.push(delta.content);
      var textEvent: StreamEvent = { type: 'text_delta', text: delta.content };
      events.push(textEvent);
      onEvent?.(textEvent);
    }

    // Tool calls
    if (delta?.tool_calls) {
      for (var tcDelta of delta.tool_calls) {
        var idx = tcDelta.index ?? 0;
        if (!partialToolCalls.has(idx)) {
          partialToolCalls.set(idx, {
            id: tcDelta.id || '',
            name: tcDelta.function?.name || '',
            args: '',
          });
          if (tcDelta.function?.name) {
            var tcStartEvent: StreamEvent = {
              type: 'tool_call_start',
              toolName: tcDelta.function.name,
              toolCallId: tcDelta.id || '',
            };
            events.push(tcStartEvent);
            onEvent?.(tcStartEvent);
          }
        }
        var partial = partialToolCalls.get(idx)!;
        if (tcDelta.id) partial.id = tcDelta.id;
        if (tcDelta.function?.name) partial.name = tcDelta.function.name;
        if (tcDelta.function?.arguments) partial.args += tcDelta.function.arguments;
      }
    }

    // Stop reason
    if (choice.finish_reason) {
      if (choice.finish_reason === 'tool_calls') stopReason = 'tool_use';
      else if (choice.finish_reason === 'length') stopReason = 'max_tokens';
      else if (choice.finish_reason === 'stop') stopReason = 'end_turn';
    }

    // Usage
    if (chunk.usage) {
      usage.inputTokens = chunk.usage.prompt_tokens || 0;
      usage.outputTokens = chunk.usage.completion_tokens || 0;
    }
  }

  // Finalize tool calls
  for (var [, partial] of partialToolCalls) {
    var parsedInput: Record<string, any> = {};
    try {
      parsedInput = JSON.parse(partial.args || '{}');
    } catch {}
    toolCalls.push({ id: partial.id, name: partial.name, input: parsedInput });
  }

  return {
    events,
    toolCalls,
    textContent: textParts.join(''),
    thinkingContent: '',
    stopReason,
    usage,
  };
}

// ─── Google Gemini Client ────────────────────────────────
// Uses REST API directly (no SDK dependency). Streams via NDJSON.

function convertToGeminiContents(messages: AgentMessage[]): { systemInstruction: any; contents: any[] } {
  var systemParts: any[] = [];
  var contents: any[] = [];

  for (var msg of messages) {
    if (msg.role === 'system') {
      var text = typeof msg.content === 'string' ? msg.content : '';
      if (Array.isArray(msg.content)) {
        for (var b of msg.content) {
          if (b.type === 'text') text += (text ? '\n' : '') + b.text;
        }
      }
      if (text) systemParts.push({ text: text });
      continue;
    }

    if (msg.role === 'user') {
      if (msg.tool_results && msg.tool_results.length > 0) {
        var frParts = msg.tool_results.map(function(tr) {
          return {
            functionResponse: {
              name: tr.tool_use_id,
              response: { content: tr.content },
            },
          };
        });
        contents.push({ role: 'user', parts: frParts });
      } else {
        var userText = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        contents.push({ role: 'user', parts: [{ text: userText }] });
      }
    } else if (msg.role === 'assistant') {
      var parts: any[] = [];
      if (typeof msg.content === 'string' && msg.content) {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (var block of msg.content) {
          if (block.type === 'text') parts.push({ text: block.text });
        }
      }
      if (msg.tool_calls) {
        for (var tc of msg.tool_calls) {
          parts.push({ functionCall: { name: tc.name, args: tc.input } });
        }
      }
      if (parts.length > 0) contents.push({ role: 'model', parts: parts });
    }
  }

  return {
    systemInstruction: systemParts.length > 0 ? { parts: systemParts } : undefined,
    contents: contents,
  };
}

async function callGoogle(
  config: { modelId: string; apiKey: string },
  messages: AgentMessage[],
  tools: ToolDefinition[],
  options: LLMCallOptions,
  onEvent?: (event: StreamEvent) => void,
): Promise<LLMResponse> {
  var { systemInstruction, contents } = convertToGeminiContents(messages);

  var requestBody: Record<string, any> = {
    contents: contents,
    generationConfig: {
      maxOutputTokens: options.maxTokens,
      temperature: options.temperature,
    },
  };

  if (systemInstruction) {
    requestBody.systemInstruction = systemInstruction;
  }

  if (tools.length > 0) {
    requestBody.tools = [{
      functionDeclarations: tools.map(function(t) {
        return {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        };
      }),
    }];
  }

  var url = `https://generativelanguage.googleapis.com/v1beta/models/${config.modelId}:streamGenerateContent?key=${config.apiKey}&alt=sse`;

  var resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: options.signal,
  });

  if (!resp.ok) {
    var errText = await resp.text().catch(function() { return ''; });
    var err: any = new Error(`Gemini API error ${resp.status}: ${errText}`);
    err.status = resp.status;
    throw err;
  }

  var events: StreamEvent[] = [];
  var toolCalls: ToolCall[] = [];
  var textParts: string[] = [];
  var stopReason: LLMResponse['stopReason'] = 'end_turn';
  var usage = { inputTokens: 0, outputTokens: 0 };
  var toolCallCounter = 0;

  // Parse SSE stream
  var reader = resp.body!.getReader();
  var decoder = new TextDecoder();
  var buffer = '';

  while (true) {
    var { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    var lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (var line of lines) {
      if (!line.startsWith('data: ')) continue;
      var jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;

      var chunk: any;
      try { chunk = JSON.parse(jsonStr); } catch { continue; }

      var candidate = chunk.candidates?.[0];
      if (!candidate) continue;

      var cParts = candidate.content?.parts || [];
      for (var part of cParts) {
        if (part.text) {
          textParts.push(part.text);
          var textEvent: StreamEvent = { type: 'text_delta', text: part.text };
          events.push(textEvent);
          onEvent?.(textEvent);
        }
        if (part.functionCall) {
          var tcId = 'gemini_tc_' + (++toolCallCounter);
          var tcStartEvent: StreamEvent = {
            type: 'tool_call_start',
            toolName: part.functionCall.name,
            toolCallId: tcId,
          };
          events.push(tcStartEvent);
          onEvent?.(tcStartEvent);
          toolCalls.push({
            id: tcId,
            name: part.functionCall.name,
            input: part.functionCall.args || {},
          });
        }
      }

      if (candidate.finishReason) {
        if (candidate.finishReason === 'STOP') stopReason = 'end_turn';
        else if (candidate.finishReason === 'MAX_TOKENS') stopReason = 'max_tokens';
        else if (candidate.finishReason === 'TOOL_USE' || toolCalls.length > 0) stopReason = 'tool_use';
      }

      if (chunk.usageMetadata) {
        usage.inputTokens = chunk.usageMetadata.promptTokenCount || 0;
        usage.outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
      }
    }
  }

  // If we collected tool calls but stopReason wasn't set, mark as tool_use
  if (toolCalls.length > 0 && stopReason === 'end_turn') {
    stopReason = 'tool_use';
  }

  return {
    events,
    toolCalls,
    textContent: textParts.join(''),
    thinkingContent: '',
    stopReason,
    usage,
  };
}

// ─── Ollama Client ──────────────────────────────────────
// Uses native /api/chat endpoint. Streams via NDJSON.
// Supports tool calling in Ollama 0.5+.

function convertToOllamaMessages(messages: AgentMessage[]): any[] {
  var result: any[] = [];
  for (var msg of messages) {
    if (msg.role === 'system') {
      var text = typeof msg.content === 'string' ? msg.content : '';
      if (Array.isArray(msg.content)) {
        for (var b of msg.content) {
          if (b.type === 'text') text += (text ? '\n' : '') + b.text;
        }
      }
      result.push({ role: 'system', content: text });
    } else if (msg.role === 'user') {
      if (msg.tool_results && msg.tool_results.length > 0) {
        for (var tr of msg.tool_results) {
          result.push({ role: 'tool', content: tr.content });
        }
      } else {
        var userText = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        result.push({ role: 'user', content: userText });
      }
    } else if (msg.role === 'assistant') {
      var entry: any = {
        role: 'assistant',
        content: typeof msg.content === 'string' ? msg.content : '',
      };
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        entry.tool_calls = msg.tool_calls.map(function(tc) {
          return {
            function: { name: tc.name, arguments: tc.input },
          };
        });
      }
      result.push(entry);
    }
  }
  return result;
}

async function callOllama(
  config: { modelId: string; baseURL?: string },
  messages: AgentMessage[],
  tools: ToolDefinition[],
  options: LLMCallOptions,
  onEvent?: (event: StreamEvent) => void,
): Promise<LLMResponse> {
  var baseURL = config.baseURL || 'http://localhost:11434';
  var ollamaMessages = convertToOllamaMessages(messages);

  var requestBody: Record<string, any> = {
    model: config.modelId,
    messages: ollamaMessages,
    stream: true,
    options: {
      temperature: options.temperature,
      num_predict: options.maxTokens,
    },
  };

  if (tools.length > 0) {
    requestBody.tools = tools.map(function(t) {
      return {
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      };
    });
  }

  var resp = await fetch(baseURL + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: options.signal,
  });

  if (!resp.ok) {
    var errText = await resp.text().catch(function() { return ''; });
    var err: any = new Error(`Ollama error ${resp.status}: ${errText}`);
    err.status = resp.status;
    throw err;
  }

  var events: StreamEvent[] = [];
  var toolCalls: ToolCall[] = [];
  var textParts: string[] = [];
  var stopReason: LLMResponse['stopReason'] = 'end_turn';
  var usage = { inputTokens: 0, outputTokens: 0 };
  var toolCallCounter = 0;

  // Parse NDJSON stream
  var reader = resp.body!.getReader();
  var decoder = new TextDecoder();
  var buffer = '';

  while (true) {
    var { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    var lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (var line of lines) {
      var trimmed = line.trim();
      if (!trimmed) continue;

      var chunk: any;
      try { chunk = JSON.parse(trimmed); } catch { continue; }

      // Text content
      if (chunk.message?.content) {
        textParts.push(chunk.message.content);
        var textEvent: StreamEvent = { type: 'text_delta', text: chunk.message.content };
        events.push(textEvent);
        onEvent?.(textEvent);
      }

      // Tool calls (Ollama 0.5+)
      if (chunk.message?.tool_calls) {
        for (var tc of chunk.message.tool_calls) {
          var tcId = 'ollama_tc_' + (++toolCallCounter);
          var tcStartEvent: StreamEvent = {
            type: 'tool_call_start',
            toolName: tc.function?.name || '',
            toolCallId: tcId,
          };
          events.push(tcStartEvent);
          onEvent?.(tcStartEvent);
          toolCalls.push({
            id: tcId,
            name: tc.function?.name || '',
            input: tc.function?.arguments || {},
          });
        }
      }

      // Final chunk with usage
      if (chunk.done) {
        if (chunk.prompt_eval_count) usage.inputTokens = chunk.prompt_eval_count;
        if (chunk.eval_count) usage.outputTokens = chunk.eval_count;
      }
    }
  }

  if (toolCalls.length > 0) {
    stopReason = 'tool_use';
  }

  return {
    events,
    toolCalls,
    textContent: textParts.join(''),
    thinkingContent: '',
    stopReason,
    usage,
  };
}

// ─── Retry with Exponential Backoff ─────────────────────

var DEFAULT_MAX_RETRY_DURATION_MS = 3600000; // 1 hour
var DEFAULT_MAX_RETRIES = 200;               // secondary safety cap
var DEFAULT_BASE_DELAY_MS = 1000;            // 1 second
var DEFAULT_MAX_DELAY_MS = 60000;            // 1 minute cap per retry

/** Returns true if the error is transient and the request should be retried. */
function isRetryableError(err: any): boolean {
  // Non-retryable HTTP status codes — throw immediately
  var status = err.status || err.statusCode || err?.response?.status;
  if (status === 400 || status === 401 || status === 403) {
    return false;
  }

  // Retryable HTTP status codes
  if (status === 429 || status === 500 || status === 502 || status === 503) {
    return true;
  }

  // Network errors
  var message = String(err.message || err || '').toLowerCase();
  if (
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('socket hang up') ||
    message.includes('econnrefused')
  ) {
    return true;
  }

  return false;
}

/** Parse retry-after header value into milliseconds. Returns 0 if unavailable. */
function parseRetryAfterMs(err: any): number {
  var retryAfter =
    err.headers?.get?.('retry-after') ||
    err.headers?.['retry-after'] ||
    err.response?.headers?.get?.('retry-after') ||
    err.response?.headers?.['retry-after'];
  if (!retryAfter) return 0;

  var seconds = Number(retryAfter);
  if (!isNaN(seconds) && seconds > 0) {
    return Math.ceil(seconds * 1000);
  }

  // Try parsing as HTTP-date
  var date = Date.parse(retryAfter);
  if (!isNaN(date)) {
    var delayMs = date - Date.now();
    return delayMs > 0 ? delayMs : 0;
  }

  return 0;
}

/**
 * Wraps an async LLM call with retry + exponential backoff.
 * Retries for up to maxRetryDurationMs (default: 1 hour) on transient errors
 * (429, 5xx, network). Non-retryable errors (400, 401, 403) are thrown immediately.
 */
async function callWithRetry(
  fn: () => Promise<LLMResponse>,
  retryConfig: RetryConfig | undefined,
  onEvent?: (event: StreamEvent) => void,
): Promise<LLMResponse> {
  var maxDuration = retryConfig?.maxRetryDurationMs ?? DEFAULT_MAX_RETRY_DURATION_MS;
  var maxRetries = retryConfig?.maxRetries ?? DEFAULT_MAX_RETRIES;
  var baseDelay = retryConfig?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  var maxDelay = retryConfig?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  var attempt = 0;
  var startTime = Date.now();

  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      var elapsed = Date.now() - startTime;

      // Stop retrying if: error is not retryable, time window exhausted, or attempt cap hit
      if (!isRetryableError(err) || elapsed >= maxDuration || attempt >= maxRetries) {
        throw err;
      }

      attempt++;

      // Calculate delay: respect retry-after header for 429, otherwise exponential backoff + jitter
      var retryAfterMs = parseRetryAfterMs(err);
      var exponentialDelay = Math.min(
        baseDelay * Math.pow(2, attempt - 1) + Math.random() * baseDelay,
        maxDelay,
      );
      var delayMs = retryAfterMs > 0 ? Math.max(retryAfterMs, exponentialDelay) : exponentialDelay;

      // Don't sleep past the retry window — cap delay to remaining time
      var remainingMs = maxDuration - elapsed;
      if (delayMs > remainingMs) {
        delayMs = remainingMs;
      }

      // Emit retry event with remaining time
      var reason = err.message || String(err);
      onEvent?.({
        type: 'retry',
        attempt: attempt,
        maxRetries: maxRetries,
        delayMs: Math.round(delayMs),
        reason: reason,
      });

      await new Promise(function(resolve) {
        setTimeout(resolve, delayMs);
      });
    }
  }
}

// ─── Unified Interface ──────────────────────────────────

export async function callLLM(
  config: {
    provider: string;
    modelId: string;
    apiKey: string;
    thinkingLevel?: string;
    baseUrl?: string;
    headers?: Record<string, string>;
  },
  messages: AgentMessage[],
  tools: ToolDefinition[],
  options: LLMCallOptions,
  onEvent?: (event: StreamEvent) => void,
  retryConfig?: RetryConfig,
): Promise<LLMResponse> {
  var invokeLLM = function(): Promise<LLMResponse> {
    // Resolve provider definition from registry
    var providerDef = resolveProvider(config.provider);
    var apiType: ApiType = providerDef
      ? providerDef.apiType
      : 'openai-compatible'; // default for unknown providers with baseUrl

    // Resolve base URL: explicit config > provider registry
    var baseURL = config.baseUrl || (providerDef ? providerDef.baseUrl : undefined);

    switch (apiType) {
      case 'anthropic':
        return callAnthropic(
          { modelId: config.modelId, apiKey: config.apiKey, thinkingLevel: config.thinkingLevel },
          messages, tools, options, onEvent,
        );

      case 'openai-compatible':
        return callOpenAICompatible(
          { modelId: config.modelId, apiKey: config.apiKey, baseURL: baseURL, headers: config.headers },
          messages, tools, options, onEvent,
        );

      case 'google':
        return callGoogle(
          { modelId: config.modelId, apiKey: config.apiKey },
          messages, tools, options, onEvent,
        );

      case 'ollama':
        return callOllama(
          { modelId: config.modelId, baseURL: baseURL },
          messages, tools, options, onEvent,
        );

      default:
        throw new Error(`Unsupported API type "${apiType}" for provider "${config.provider}"`);
    }
  };

  return callWithRetry(invokeLLM, retryConfig, onEvent);
}

/**
 * Convert AgentTool[] to ToolDefinition[] for LLM API calls.
 */
export function toolsToDefinitions(tools: import('../agent-tools/types.js').AnyAgentTool[]): ToolDefinition[] {
  return tools.map(function(t) {
    return {
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Record<string, any>,
    };
  });
}
