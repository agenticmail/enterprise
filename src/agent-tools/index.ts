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
 * Enterprise tools (87 across 16 skills):
 *   - database (6)     — SQL queries, schema, explain, tables, sample
 *   - spreadsheet (8)  — CSV read/write/filter/aggregate/transform/merge/pivot/convert
 *   - documents (8)    — PDF/DOCX generation, OCR, invoice parsing, format conversion
 *   - calendar (6)     — Events, availability, timezone conversion
 *   - knowledge (5)    — Internal KB search, spaces, recent updates
 *   - web-research (5) — Web search, scrape, extract, monitor, screenshot
 *   - translation (5)  — Text/document/batch translation, language detection
 *   - logs (5)         — Log search, aggregate, tail, correlate, errors
 *   - workflow (5)     — Approval requests, status, pending, cancel, remind
 *   - notifications (5)— Send, broadcast, webhook, escalate, schedule
 *   - finance (5)      — Budget, expenses, spending summary, invoices, forecast
 *   - http (4)         — HTTP requests, GraphQL, batch, download
 *   - security (6)     — Secret scanning, PII scanning/redaction, dep audit, compliance, hashing
 *   - code-sandbox (5) — Run JS/Python/shell, JSON transform, regex
 *   - diff (4)         — Text/JSON/spreadsheet diff, summary
 *   - vision (5)       — Image describe, OCR, UI analysis, chart extraction, compare
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
export { createMemoryTool } from './tools/memory.js';

// --- Tool creators (enterprise) ---
export { createDatabaseTools } from './tools/enterprise-database.js';
export { createSpreadsheetTools } from './tools/enterprise-spreadsheet.js';
export { createDocumentTools } from './tools/enterprise-documents.js';
export { createCalendarTools } from './tools/enterprise-calendar.js';
export { createEnterpriseKnowledgeSearchTools } from './tools/enterprise-knowledge-search.js';
export { createEnterpriseWebResearchTools } from './tools/enterprise-web-research.js';
export { createEnterpriseTranslationTools } from './tools/enterprise-translation.js';
export { createEnterpriseLogTools } from './tools/enterprise-logs.js';
export { createEnterpriseWorkflowTools } from './tools/enterprise-workflow.js';
export { createEnterpriseNotificationTools } from './tools/enterprise-notifications.js';
export { createEnterpriseFinanceTools } from './tools/enterprise-finance.js';
export { createEnterpriseHttpTools } from './tools/enterprise-http.js';
export { createSecurityScanTools } from './tools/enterprise-security-scan.js';
export { createCodeSandboxTools } from './tools/enterprise-code-sandbox.js';
export { createDiffTools } from './tools/enterprise-diff.js';
export { createVisionTools } from './tools/enterprise-vision.js';

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
import { createMemoryTool } from './tools/memory.js';

// Enterprise tool creators
import { createDatabaseTools } from './tools/enterprise-database.js';
import { createSpreadsheetTools } from './tools/enterprise-spreadsheet.js';
import { createDocumentTools } from './tools/enterprise-documents.js';
import { createCalendarTools } from './tools/enterprise-calendar.js';
import { createEnterpriseKnowledgeSearchTools } from './tools/enterprise-knowledge-search.js';
import { createEnterpriseWebResearchTools } from './tools/enterprise-web-research.js';
import { createEnterpriseTranslationTools } from './tools/enterprise-translation.js';
import { createEnterpriseLogTools } from './tools/enterprise-logs.js';
import { createEnterpriseWorkflowTools } from './tools/enterprise-workflow.js';
import { createEnterpriseNotificationTools } from './tools/enterprise-notifications.js';
import { createEnterpriseFinanceTools } from './tools/enterprise-finance.js';
import { createEnterpriseHttpTools } from './tools/enterprise-http.js';
import { createSecurityScanTools } from './tools/enterprise-security-scan.js';
import { createCodeSandboxTools } from './tools/enterprise-code-sandbox.js';
import { createDiffTools } from './tools/enterprise-diff.js';
import { createVisionTools } from './tools/enterprise-vision.js';

/**
 * Create all available agent tools with the given options.
 * Automatically applies security sandbox and middleware wrapping.
 * Returns only tools that are enabled (non-null).
 *
 * Includes 10 core tools + 87 enterprise tools (16 skills).
 */
export function createAllTools(options?: ToolCreationOptions): AnyAgentTool[] {
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
    createMemoryTool(options),
  ];

  // Enterprise tools (16 skills, 87 tools)
  var enterpriseTools: AnyAgentTool[] = [
    ...createDatabaseTools(options),
    ...createSpreadsheetTools(options),
    ...createDocumentTools(options),
    ...createCalendarTools(options),
    ...createEnterpriseKnowledgeSearchTools(options),
    ...createEnterpriseWebResearchTools(options),
    ...createEnterpriseTranslationTools(options),
    ...createEnterpriseLogTools(options),
    ...createEnterpriseWorkflowTools(options),
    ...createEnterpriseNotificationTools(options),
    ...createEnterpriseFinanceTools(options),
    ...createEnterpriseHttpTools(options),
    ...createSecurityScanTools(options),
    ...createCodeSandboxTools(options),
    ...createDiffTools(options),
    ...createVisionTools(options),
  ];

  var enabledTools = rawTools
    .filter(function(t): t is AnyAgentTool { return t !== null; })
    .concat(enterpriseTools);

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
