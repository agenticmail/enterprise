/**
 * AgenticMail Agent Tools
 *
 * Enterprise-hardened tool implementations for AI agents.
 * Each tool is protected by path sandboxing, SSRF guards,
 * command sanitization, rate limiting, circuit breaking,
 * audit logging, and telemetry.
 *
 * Core tools (10):
 *   - read, write, edit, bash, glob, grep, web_fetch, web_search, browser, memory
 *
 * Enterprise tools (across 7 skills):
 *   - database (6)     — SQL queries, schema, explain, tables, sample
 *   - spreadsheet (8)  — CSV read/write/filter/aggregate/transform/merge/pivot/convert
 *   - documents (8)    — PDF/DOCX generation, OCR, invoice parsing, format conversion
 *   - http (4)         — HTTP requests, GraphQL, batch, download
 *   - security (6)     — Secret scanning, PII scanning/redaction, dep audit, compliance, hashing
 *   - code-sandbox (5) — Run JS/Python/shell, JSON transform, regex
 *   - diff (4)         — Text/JSON/spreadsheet diff, summary
 */

// --- Types ---
export type {
  AgentTool,
  AnyAgentTool,
  ToolResult,
  ToolContentBlock,
  ToolParameterSchema,
  ToolCreationOptions,
  AgenticMailToolConfig,
  AuditSink,
  TelemetrySink,
} from './types.js';

// --- Security ---
export {
  SecurityError,
  createPathSandbox,
  createSsrfGuard,
  createCommandSanitizer,
  isPrivateIp,
  shellEscape,
} from './security.js';
export type {
  PathSandbox,
  PathSandboxOptions,
  SsrfGuard,
  SsrfGuardOptions,
  CommandSanitizer,
  CommandSanitizerOptions,
} from './security.js';

// --- Middleware ---
export {
  wrapToolWithMiddleware,
  createToolMiddleware,
  redactParams,
} from './middleware.js';
export type {
  AuditEntry,
  TelemetryEntry,
  ToolMiddlewareConfig,
} from './middleware.js';

// --- Common utilities ---
export {
  ToolInputError,
  readStringParam,
  readNumberParam,
  readBooleanParam,
  readStringArrayParam,
  jsonResult,
  textResult,
  errorResult,
  imageResult,
  wrapExternalContent,
  wrapWebContent,
  normalizeSecretInput,
  createActionGate,
  redactSecrets,
} from './common.js';

// --- Tool creators (core) ---
export { createReadTool } from './tools/read.js';
export { createWriteTool } from './tools/write.js';
export { createEditTool } from './tools/edit.js';
export { createBashTool } from './tools/bash.js';
export { createGlobTool } from './tools/glob.js';
export { createGrepTool } from './tools/grep.js';
export { createWebFetchTool, fetchFirecrawlContent, extractReadableContent } from './tools/web-fetch.js';
export { createWebSearchTool } from './tools/web-search.js';
export { createBrowserTool } from './tools/browser.js';
// Enterprise browser tool — lazy import to avoid pulling in ws/playwright at module load time
// Use: const { createEnterpriseBrowserTool } = await import('@agenticmail/enterprise/browser-tool');
export type { EnterpriseBrowserToolConfig } from './tools/browser-tool.js';
export { createMemoryTool } from './tools/memory.js';
export { createMemoryTools } from './tools/memory.js';
export type { MemoryToolOptions } from './tools/memory.js';

// --- Tool creators (agenticmail) ---
export { createAgenticMailTools } from './tools/agenticmail.js';
export type { AgenticMailManagerRef, AgenticMailToolsConfig } from './tools/agenticmail.js';

// --- Tool creators (Google Workspace) ---
export { createAllGoogleTools, createGmailTools, createGoogleCalendarTools, createGoogleDriveTools, createGoogleSheetsTools, createGoogleDocsTools, createGoogleContactsTools, createMeetingTools } from './tools/google/index.js';
export { createTokenProvider } from './tools/oauth-token-provider.js';
export type { TokenProvider, OAuthTokens, TokenProviderConfig } from './tools/oauth-token-provider.js';

// --- Tool creators (meeting lifecycle) ---
export { createMeetingLifecycleTools } from './tools/meeting-lifecycle.js';

// --- Environment detection ---
export { detectCapabilities, getCapabilitySummary, resetCapabilitiesCache } from '../runtime/environment.js';
export type { SystemCapabilities, DeploymentType } from '../runtime/environment.js';

// --- Tool creators (enterprise) ---
export { createDatabaseTools } from './tools/enterprise-database.js';
export { createSpreadsheetTools } from './tools/enterprise-spreadsheet.js';
export { createDocumentTools } from './tools/enterprise-documents.js';
export { createEnterpriseHttpTools } from './tools/enterprise-http.js';
export { createSecurityScanTools } from './tools/enterprise-security-scan.js';
export { createCodeSandboxTools } from './tools/enterprise-code-sandbox.js';
export { createDiffTools } from './tools/enterprise-diff.js';

// --- Web utilities (useful standalone) ---
export { htmlToMarkdown, markdownToText, truncateText } from './tools/web-fetch-utils.js';

// --- LRU Cache (useful standalone) ---
export { LRUCache } from './tools/web-shared.js';
export type { LRUCacheOptions } from './tools/web-shared.js';

// --- Convenience: create all tools at once ---
import type { AnyAgentTool, ToolCreationOptions } from './types.js';
import { createPathSandbox } from './security.js';
import { createSsrfGuard } from './security.js';
import { createCommandSanitizer } from './security.js';
import { createToolMiddleware } from './middleware.js';
import { createReadTool } from './tools/read.js';
import { createWriteTool } from './tools/write.js';
import { createEditTool } from './tools/edit.js';
import { createBashTool } from './tools/bash.js';
import { createGlobTool } from './tools/glob.js';
import { createGrepTool } from './tools/grep.js';
import { createWebFetchTool } from './tools/web-fetch.js';
import { createWebSearchTool } from './tools/web-search.js';
import { createBrowserTool } from './tools/browser.js';
// createEnterpriseBrowserTool is lazy-loaded — not imported at startup
import { createMemoryTools } from './tools/memory.js';
import type { MemoryToolOptions } from './tools/memory.js';

// Enterprise tool creators
import { createDatabaseTools } from './tools/enterprise-database.js';
import { createSpreadsheetTools } from './tools/enterprise-spreadsheet.js';
import { createDocumentTools } from './tools/enterprise-documents.js';
import { createEnterpriseHttpTools } from './tools/enterprise-http.js';
import { createSecurityScanTools } from './tools/enterprise-security-scan.js';
import { createCodeSandboxTools } from './tools/enterprise-code-sandbox.js';
import { createDiffTools } from './tools/enterprise-diff.js';
import { createAgenticMailTools } from './tools/agenticmail.js';
import type { AgenticMailManagerRef } from './tools/agenticmail.js';
import { createAllGoogleTools } from './tools/google/index.js';
import { createTokenProvider } from './tools/oauth-token-provider.js';
import type { OAuthTokens, TokenProvider } from './tools/oauth-token-provider.js';
import { createMeetingLifecycleTools } from './tools/meeting-lifecycle.js';
import { detectCapabilities } from '../runtime/environment.js';

import type { AgentMemoryManager } from '../engine/agent-memory.js';

/** Extended options that includes AgenticMail manager */
export interface AllToolsOptions extends ToolCreationOptions {
  /** AgenticMail manager for org email access */
  agenticmailManager?: AgenticMailManagerRef;
  /** Agent memory manager for persistent DB-backed memory */
  agentMemoryManager?: AgentMemoryManager;
  /** Organization ID for memory scoping */
  orgId?: string;
  /** OAuth token provider for Google/Microsoft API tools */
  oauthTokenProvider?: TokenProvider;
  /** Raw email config for auto-creating token provider */
  emailConfig?: {
    oauthProvider?: string;
    oauthAccessToken?: string;
    oauthRefreshToken?: string;
    oauthTokenExpiry?: string;
    oauthClientId?: string;
    oauthClientSecret?: string;
    email?: string;
  };
  /** Callback to persist updated tokens after refresh */
  onTokenRefresh?: (tokens: Partial<OAuthTokens>) => void;
  /** Browser configuration for enterprise browser tool */
  browserConfig?: {
    provider?: string;
    baseUrl?: string;
    defaultProfile?: string;
    allowEvaluate?: boolean;
    headless?: boolean;
  };
  /** Use enterprise browser tool (full Playwright) instead of simple browser */
  useEnterpriseBrowser?: boolean;
  /** Which Google services to load (e.g. ['gmail','calendar','drive','tasks','chat','slides','forms']). Default: core set only. */
  enabledGoogleServices?: string[];
}

/**
 * Create all available agent tools with the given options.
 * Automatically applies security sandbox and middleware wrapping.
 * Returns only tools that are enabled (non-null).
 *
 * Includes 10 core tools + 87 enterprise tools (16 skills) + 63 AgenticMail tools (if configured).
 */
export async function createAllTools(options?: AllToolsOptions): Promise<AnyAgentTool[]> {
  // Create security primitives
  var pathSandbox = options?.workspaceDir && options?.security?.pathSandbox?.enabled !== false
    ? createPathSandbox(options.workspaceDir, {
        allowedDirs: options.security?.pathSandbox?.allowedDirs,
        blockedPatterns: options.security?.pathSandbox?.blockedPatterns,
      })
    : undefined;

  var ssrfGuard = options?.security?.ssrf?.enabled !== false
    ? createSsrfGuard({
        allowedHosts: options?.security?.ssrf?.allowedHosts,
        blockedCidrs: options?.security?.ssrf?.blockedCidrs,
      })
    : undefined;

  var commandSanitizer = options?.security?.commandSanitizer?.enabled !== false
    ? createCommandSanitizer({
        mode: options?.security?.commandSanitizer?.mode,
        allowedCommands: options?.security?.commandSanitizer?.allowedCommands,
        blockedPatterns: options?.security?.commandSanitizer?.blockedPatterns,
      })
    : undefined;

  // Core tools with security primitives injected
  var rawTools: (AnyAgentTool | null)[] = [
    createReadTool({ ...options, pathSandbox }),
    createWriteTool({ ...options, pathSandbox }),
    createEditTool({ ...options, pathSandbox }),
    createBashTool({ ...options, commandSanitizer }),
    createGlobTool({ ...options, pathSandbox }),
    createGrepTool({ ...options, pathSandbox }),
    createWebFetchTool({ ...options, ssrfGuard }),
    createWebSearchTool(options),
    createBrowserTool({ ...options, ssrfGuard }),
    // Memory tools added separately below (may produce multiple tools)
  ];

  // Replace simple browser with enterprise browser tool if configured
  // Uses lazy import to avoid pulling in ws/playwright at module load
  if (options?.useEnterpriseBrowser) {
    // Remove the simple browser tool
    rawTools = rawTools.filter(function(t) { return !t || t.name !== 'browser'; });
    // Enterprise browser will be added async — caller must await createAllToolsAsync()
    // For sync createAllTools, add a stub that tells the agent to use system_capabilities first
    var caps = detectCapabilities();
    if (!caps.hasBrowser) {
      rawTools.push({
        name: 'browser',
        label: 'Browser',
        description: 'Browser automation — NOT AVAILABLE on this deployment. Use system_capabilities to check what is available.',
        category: 'browser',
        parameters: { type: 'object', properties: { action: { type: 'string' } }, required: ['action'] },
        execute: async function() {
          var c = detectCapabilities();
          var { getCapabilitySummary: getSummary } = await import('../runtime/environment.js');
          var summary = getSummary(c);
          return {
            content: [{
              type: 'text',
              text: 'Browser is not available on this ' + summary.deployment + ' deployment.\n\n' +
                'Missing: ' + summary.unavailable.join(', ') + '\n\n' +
                summary.recommendations.join('\n') + '\n\n' +
                'API-based tools (email, calendar, drive, docs) work without a browser.',
            }],
          };
        },
      } as AnyAgentTool);
    }
  }

  // Memory tools (DB-backed when manager available, file-based fallback)
  var memoryTools = createMemoryTools({
    ...options,
    agentMemoryManager: options?.agentMemoryManager,
    agentId: options?.agentId,
    orgId: options?.orgId,
  } as MemoryToolOptions);
  rawTools = rawTools.concat(memoryTools as any);

  // Enterprise tools (7 skills)
  var enterpriseTools: AnyAgentTool[] = [
    ...createDatabaseTools(options),
    ...createSpreadsheetTools(options),
    ...createDocumentTools(options),
    ...createEnterpriseHttpTools(options),
    ...createSecurityScanTools(options),
    ...createCodeSandboxTools(options),
    ...createDiffTools(options),
  ];

  // AgenticMail tools (if manager + agentId provided)
  var agenticmailTools: AnyAgentTool[] = [];
  if (options?.agenticmailManager && options?.agentId) {
    agenticmailTools = createAgenticMailTools(
      { manager: options.agenticmailManager, agentId: options.agentId },
      options,
    );
  }

  // Google Workspace / Microsoft Graph tools (if OAuth configured)
  var workspaceTools: AnyAgentTool[] = [];
  var tp = options?.oauthTokenProvider;
  if (!tp && options?.emailConfig?.oauthAccessToken) {
    // Auto-create token provider from email config
    var ec = options.emailConfig;
    tp = createTokenProvider({
      getTokens: function() {
        return {
          accessToken: ec.oauthAccessToken!,
          refreshToken: ec.oauthRefreshToken,
          expiresAt: ec.oauthTokenExpiry,
          provider: (ec.oauthProvider === 'microsoft' ? 'microsoft' : 'google') as any,
          clientId: ec.oauthClientId || '',
          clientSecret: ec.oauthClientSecret || '',
        };
      },
      saveTokens: function(newTokens) {
        if (newTokens.accessToken) ec.oauthAccessToken = newTokens.accessToken;
        if (newTokens.refreshToken) ec.oauthRefreshToken = newTokens.refreshToken;
        if (newTokens.expiresAt) ec.oauthTokenExpiry = newTokens.expiresAt;
        if (options?.onTokenRefresh) options.onTokenRefresh(newTokens);
      },
      getEmail: function() { return ec.email; },
    });
  }
  if (tp) {
    var provider = tp.getProvider();
    if (provider === 'google') {
      const googleOpts = options?.enabledGoogleServices ? { ...options, enabledGoogleServices: options.enabledGoogleServices } : options;
      workspaceTools = createAllGoogleTools({ tokenProvider: tp }, googleOpts);
      // Meeting lifecycle tools (work on all deployments — API-based)
      workspaceTools = workspaceTools.concat(createMeetingLifecycleTools({ tokenProvider: tp }, options));
    }
    // TODO: Microsoft Graph tools
    // if (provider === 'microsoft') { workspaceTools = createAllMicrosoftTools({ tokenProvider: tp }, options); }
  }

  // Try to load enterprise browser tool async (non-blocking)
  var enterpriseBrowserTools: AnyAgentTool[] = [];
  if (options?.useEnterpriseBrowser) {
    try {
      var { createEnterpriseBrowserTool: createEB } = await import('./tools/browser-tool.js');
      var ebTool = createEB(options.browserConfig);
      enterpriseBrowserTools = [ebTool];
    } catch (_e) {
      // browser-tool.ts has heavy deps — fall through to simple browser or stub
    }
  }

  // MCP skill adapter bridge — loads tools for integrations with vault credentials
  var mcpBridgeTools: AnyAgentTool[] = [];
  if ((options as any)?.vault) {
    try {
      var { createMcpBridgeTools } = await import('./tools/mcp-bridge.js');
      mcpBridgeTools = await createMcpBridgeTools({
        vault: (options as any).vault,
        orgId: (options as any)?.orgId,
        agentId: options?.agentId,
      });
    } catch (e: any) {
      console.warn(`[tools] MCP bridge load failed: ${e.message}`);
    }
  }

  var enabledTools = rawTools
    .filter(function(t): t is AnyAgentTool { return t !== null; })
    .concat(enterpriseTools)
    .concat(agenticmailTools)
    .concat(workspaceTools)
    .concat(enterpriseBrowserTools)
    .concat(mcpBridgeTools);

  // Wrap with middleware if configured
  if (options?.middleware) {
    var mw = createToolMiddleware({
      agentId: options.agentId,
      audit: options.middleware.audit,
      rateLimit: options.middleware.rateLimit,
      circuitBreaker: options.middleware.circuitBreaker,
      telemetry: options.middleware.telemetry,
    });
    enabledTools = enabledTools.map(function(tool) { return mw.wrap(tool); });
  }

  return enabledTools;
}
