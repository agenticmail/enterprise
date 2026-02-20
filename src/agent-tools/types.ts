/**
 * AgenticMail Agent Tools — Core Types
 *
 * Defines the tool interface used by AI agents in the AgenticMail platform.
 * Inspired by the MCP tool protocol but simplified for internal use.
 */

/** Result content block — text or image */
export type ToolContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

/** Result returned by a tool execution */
export interface ToolResult<T = unknown> {
  content: ToolContentBlock[];
  details?: T;
}

/** JSON Schema definition for tool parameters */
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    default?: unknown;
    enum?: string[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
  }>;
  required?: string[];
}

/** A single agent tool definition */
export interface AgentTool<TParams = Record<string, unknown>, TResult = unknown> {
  /** Unique tool name (snake_case) */
  name: string;
  /** Human-readable label for UI display */
  label?: string;
  /** What this tool does */
  description: string;
  /** JSON Schema for parameters */
  parameters: ToolParameterSchema;
  /** Execute the tool with given parameters */
  execute: (toolCallId: string, params: TParams) => Promise<ToolResult<TResult>>;
  /** Whether this tool is restricted to agent owner */
  ownerOnly?: boolean;
  /** Category for grouping in UI */
  category?: 'file' | 'web' | 'search' | 'command' | 'browser' | 'memory' | 'utility';
  /** Risk level */
  risk?: 'low' | 'medium' | 'high' | 'critical';
}

/** Shorthand for any tool regardless of param/result types */
export type AnyAgentTool = AgentTool<any, unknown>;

/** Audit sink interface for tool execution logging */
export interface AuditSink {
  log(entry: {
    traceId: string;
    toolName: string;
    toolCallId: string;
    agentId: string;
    timestamp: string;
    params: Record<string, unknown>;
    durationMs: number;
    success: boolean;
    error?: string;
    outputSize?: number;
  }): void;
}

/** Telemetry sink interface for tool metrics */
export interface TelemetrySink {
  record(entry: {
    toolName: string;
    agentId: string;
    durationMs: number;
    success: boolean;
    outputSize: number;
    timestamp: string;
  }): void;
}

/** Configuration passed when creating tools */
export interface ToolCreationOptions {
  /** Working directory for file operations */
  workspaceDir?: string;
  /** Whether the agent is sandboxed */
  sandboxed?: boolean;
  /** Unique agent identifier for audit + rate limiting */
  agentId?: string;
  /** AgenticMail tool-specific config overrides */
  config?: AgenticMailToolConfig;
  /** Security sandbox configuration */
  security?: {
    pathSandbox?: {
      enabled?: boolean;
      allowedDirs?: string[];
      blockedPatterns?: string[];
    };
    ssrf?: {
      enabled?: boolean;
      allowedHosts?: string[];
      blockedCidrs?: string[];
    };
    commandSanitizer?: {
      enabled?: boolean;
      mode?: 'blocklist' | 'allowlist';
      allowedCommands?: string[];
      blockedPatterns?: string[];
    };
  };
  /** Middleware configuration for cross-cutting concerns */
  middleware?: {
    audit?: {
      enabled?: boolean;
      sink?: AuditSink;
      redactKeys?: string[];
    };
    rateLimit?: {
      enabled?: boolean;
      overrides?: Record<string, { maxTokens: number; refillRate: number }>;
    };
    circuitBreaker?: {
      enabled?: boolean;
    };
    telemetry?: {
      enabled?: boolean;
      sink?: TelemetrySink;
    };
  };
}

/** Tool-level configuration */
export interface AgenticMailToolConfig {
  web?: {
    fetch?: {
      enabled?: boolean;
      maxChars?: number;
      maxCharsCap?: number;
      maxResponseBytes?: number;
      maxRedirects?: number;
      timeoutSeconds?: number;
      cacheTtlMinutes?: number;
      readability?: boolean;
      userAgent?: string;
      firecrawl?: {
        enabled?: boolean;
        apiKey?: string;
        baseUrl?: string;
        onlyMainContent?: boolean;
        maxAgeMs?: number;
        timeoutSeconds?: number;
      };
    };
    search?: {
      enabled?: boolean;
      provider?: 'brave' | 'perplexity' | 'grok';
      apiKey?: string;
      maxResults?: number;
      timeoutSeconds?: number;
      cacheTtlMinutes?: number;
      perplexity?: {
        apiKey?: string;
        baseUrl?: string;
        model?: string;
      };
      grok?: {
        apiKey?: string;
        model?: string;
        inlineCitations?: boolean;
      };
    };
  };
  bash?: {
    enabled?: boolean;
    timeoutMs?: number;
    maxOutputBytes?: number;
    allowedCommands?: string[];
    blockedCommands?: string[];
  };
  browser?: {
    enabled?: boolean;
    headless?: boolean;
    timeoutMs?: number;
  };
  memory?: {
    enabled?: boolean;
    backend?: 'local' | 'sqlite' | 'vector';
  };
}
