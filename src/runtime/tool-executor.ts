/**
 * Tool Execution Engine
 *
 * Bridges the agent loop with agent-tools/ implementations.
 * Validates input, executes with timeout, formats results.
 */

import type { AnyAgentTool, ToolResult } from '../agent-tools/types.js';
import type { ToolCall, ToolCallResult } from './types.js';

// ─── Constants ───────────────────────────────────────────

const DEFAULT_TOOL_TIMEOUT_MS = 30_000;
const MAX_RESULT_CHARS = 200_000;

// ─── Tool Registry ───────────────────────────────────────

export class ToolRegistry {
  private tools = new Map<string, AnyAgentTool>();

  register(tools: AnyAgentTool[]): void {
    for (var tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  get(name: string): AnyAgentTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): AnyAgentTool[] {
    return Array.from(this.tools.values());
  }

  clear(): void {
    this.tools.clear();
  }
}

// ─── Execution ───────────────────────────────────────────

/**
 * Execute a single tool call and return a formatted result.
 */
export async function executeTool(
  tool: AnyAgentTool,
  toolCall: ToolCall,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<{ result: ToolCallResult; content: string }> {
  var timeoutMs = options?.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  var started = Date.now();

  try {
    // Validate required parameters
    var validationError = validateToolInput(tool, toolCall.input);
    if (validationError) {
      return {
        result: { success: false, error: validationError, durationMs: Date.now() - started },
        content: `Error: ${validationError}`,
      };
    }

    // Execute with timeout
    var toolResult = await executeWithTimeout(
      tool.execute(toolCall.id, toolCall.input),
      timeoutMs,
      options?.signal,
    );

    var content = formatToolResult(toolResult);
    var durationMs = Date.now() - started;

    return {
      result: { success: true, output: content, durationMs },
      content: truncateResult(content),
    };
  } catch (err: any) {
    var durationMs = Date.now() - started;
    var errorMessage = err?.message || String(err);

    if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
      errorMessage = `Tool "${tool.name}" timed out after ${timeoutMs}ms`;
    }

    return {
      result: { success: false, error: errorMessage, durationMs },
      content: `Error executing ${tool.name}: ${errorMessage}`,
    };
  }
}

// ─── Validation ──────────────────────────────────────────

function validateToolInput(tool: AnyAgentTool, input: Record<string, any>): string | null {
  var schema = tool.parameters;
  if (!schema || !schema.required) return null;

  for (var field of schema.required) {
    if (input[field] === undefined || input[field] === null) {
      return `Missing required parameter: "${field}" for tool "${tool.name}"`;
    }
  }

  // Basic type checks
  if (schema.properties) {
    for (var [key, prop] of Object.entries(schema.properties)) {
      if (input[key] === undefined) continue;

      var expectedType = prop.type;
      var actualValue = input[key];
      var actualType = typeof actualValue;

      if (expectedType === 'string' && actualType !== 'string') {
        return `Parameter "${key}" must be a string, got ${actualType}`;
      }
      if (expectedType === 'number' && actualType !== 'number') {
        return `Parameter "${key}" must be a number, got ${actualType}`;
      }
      if (expectedType === 'boolean' && actualType !== 'boolean') {
        return `Parameter "${key}" must be a boolean, got ${actualType}`;
      }
      if (expectedType === 'array' && !Array.isArray(actualValue)) {
        return `Parameter "${key}" must be an array`;
      }
    }
  }

  return null;
}

// ─── Timeout Wrapper ─────────────────────────────────────

async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    throw new Error('Aborted');
  }

  return new Promise<T>(function(resolve, reject) {
    var timer = setTimeout(function() {
      var err = new Error('Tool execution timed out');
      err.name = 'TimeoutError';
      reject(err);
    }, timeoutMs);

    var onAbort = function() {
      clearTimeout(timer);
      var err = new Error('Tool execution aborted');
      err.name = 'AbortError';
      reject(err);
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    promise.then(
      function(value) {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(value);
      },
      function(err) {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

// ─── Result Formatting ──────────────────────────────────

function formatToolResult(result: ToolResult): string {
  if (!result.content || result.content.length === 0) {
    return '(no output)';
  }

  var parts: string[] = [];
  for (var block of result.content) {
    if (block.type === 'text') {
      parts.push(block.text);
    } else if (block.type === 'image') {
      parts.push(`[Image: ${block.mimeType}]`);
    }
  }

  return parts.join('\n');
}

function truncateResult(content: string): string {
  if (content.length <= MAX_RESULT_CHARS) return content;
  var truncated = content.slice(0, MAX_RESULT_CHARS);
  return truncated + `\n\n... [truncated, ${content.length - MAX_RESULT_CHARS} chars omitted]`;
}
