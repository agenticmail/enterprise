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
export { createKnowledgeSearchTools } from './tools/knowledge-search.js';
export { createCodeSandboxTools } from './tools/enterprise-code-sandbox.js';
export { createDiffTools } from './tools/enterprise-diff.js';
export { createRemotonTools } from './tools/remotion-video.js';
export { createPolymarketOnchainTools } from './tools/polymarket-onchain.js';
export { createPolymarketSocialTools } from './tools/polymarket-social.js';
export { createPolymarketFeedTools } from './tools/polymarket-feeds.js';
export { createPolymarketAnalyticsTools } from './tools/polymarket-analytics.js';
export { createPolymarketExecutionTools } from './tools/polymarket-execution.js';
export { createPolymarketCounterintelTools } from './tools/polymarket-counterintel.js';
export { createPolymarketPortfolioTools } from './tools/polymarket-portfolio.js';

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
import { createRemotonTools } from './tools/remotion-video.js';
import { createKnowledgeSearchTools } from './tools/knowledge-search.js';
import { createAgenticMailTools } from './tools/agenticmail.js';
import { createWhatsAppTools } from './tools/messaging/whatsapp.js';
import { createTelegramTools } from './tools/messaging/telegram.js';
import type { AgenticMailManagerRef } from './tools/agenticmail.js';
import { createAllGoogleTools } from './tools/google/index.js';
import { createTokenProvider } from './tools/oauth-token-provider.js';
import type { OAuthTokens, TokenProvider } from './tools/oauth-token-provider.js';
import { createMeetingLifecycleTools } from './tools/meeting-lifecycle.js';
import { createVisualMemoryTools } from './tools/visual-memory/index.js';
import { createPolymarketTools } from './tools/polymarket.js';
import { createPolymarketQuantTools } from './tools/polymarket-quant.js';
import { createPolymarketOnchainTools } from './tools/polymarket-onchain.js';
import { createPolymarketSocialTools } from './tools/polymarket-social.js';
import { createPolymarketFeedTools } from './tools/polymarket-feeds.js';
import { createPolymarketAnalyticsTools } from './tools/polymarket-analytics.js';
import { createPolymarketExecutionTools } from './tools/polymarket-execution.js';
import { createPolymarketCounterintelTools } from './tools/polymarket-counterintel.js';
import { createPolymarketPortfolioTools } from './tools/polymarket-portfolio.js';
import { initVisualStorage } from './tools/visual-memory/storage.js';
import { detectCapabilities } from '../runtime/environment.js';

import type { AgentMemoryManager } from '../engine/agent-memory.js';

/** Extended options that includes AgenticMail manager */
export interface AllToolsOptions extends ToolCreationOptions {
  /** AgenticMail manager for org email access */
  agenticmailManager?: AgenticMailManagerRef;
  /** Agent memory manager for persistent DB-backed memory */
  agentMemoryManager?: AgentMemoryManager;
  /** Engine database for direct table access (visual memory, etc.) */
  engineDb?: any;
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
    provider?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    password?: string;
    imapHost?: string;
    imapPort?: number;
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
  /** Which Microsoft services to load (e.g. ['mail','calendar','onedrive','teams','tasks','contacts']). Default: core set (mail, calendar, onedrive, tasks). */
  enabledMicrosoftServices?: string[];
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
  // Default allowed dirs: workspace + /tmp + home (agents need temp file access for media processing, etc.)
  var defaultAllowedDirs = ['/tmp', '/var/tmp', process.env.HOME || '/root'];
  var configuredDirs = options?.security?.pathSandbox?.allowedDirs || [];
  var pathSandbox = options?.workspaceDir && options?.security?.pathSandbox?.enabled !== false
    ? createPathSandbox(options.workspaceDir, {
        allowedDirs: [...defaultAllowedDirs, ...configuredDirs],
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

  // Visual memory tools (enterprise DB-backed, integrated with AgentMemoryManager)
  // Initialize storage with centralized DB + memory manager (not local files)
  if ((options as any)?.engineDb) {
    initVisualStorage((options as any).engineDb, options?.agentMemoryManager);
  }
  var visualMemoryTools = createVisualMemoryTools(options || {});
  rawTools = rawTools.concat(visualMemoryTools as any);

  // Enterprise Database Access tools (real multi-DB connections via DatabaseConnectionManager)
  if ((options as any)?.databaseManager && options?.agentId) {
    try {
      const { createDatabaseTools: createDbAccessTools } = await import('../database-access/agent-tools.js');
      const dbAccessTools = createDbAccessTools((options as any).databaseManager, options.agentId);
      rawTools = rawTools.concat(dbAccessTools as any);
    } catch (e: any) {
      console.warn('[tools] Failed to load database access tools:', e.message);
    }
  }

  // Enterprise tools (7 skills)
  var enterpriseTools: AnyAgentTool[] = [
    ...createDatabaseTools(options),
    ...createSpreadsheetTools(options),
    ...createDocumentTools(options),
    ...createEnterpriseHttpTools(options),
    ...createSecurityScanTools(options),
    ...createCodeSandboxTools(options),
    ...createDiffTools(options),
    ...createRemotonTools(),
    ...createKnowledgeSearchTools(options || {} as any),
    ...createPolymarketTools(options || {}),
    ...createPolymarketQuantTools(options || {}),
    ...createPolymarketOnchainTools(options || {}),
    ...createPolymarketSocialTools(options || {}),
    ...createPolymarketFeedTools(options || {}),
    ...createPolymarketAnalyticsTools(options || {}),
    ...createPolymarketExecutionTools(options || {}),
    ...createPolymarketCounterintelTools(options || {}),
    ...createPolymarketPortfolioTools(options || {}),
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
    if (provider === 'microsoft') {
      const { createAllMicrosoftTools } = await import('./tools/microsoft/index.js');
      const msOpts = options?.enabledMicrosoftServices ? { ...options, enabledMicrosoftServices: options.enabledMicrosoftServices } : options;
      workspaceTools = createAllMicrosoftTools({ tokenProvider: tp }, msOpts);
    }
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

  // ─── SMTP/IMAP Email Tools (when no OAuth, agent has SMTP credentials) ───
  var smtpEmailTools: AnyAgentTool[] = [];
  var smtpProvider = options?.emailConfig?.provider;
  if (options?.emailConfig?.smtpHost && (!tp || smtpProvider === 'imap' || smtpProvider === 'smtp')) {
    // Agent has SMTP credentials — load generic email tools (even alongside OAuth if provider is explicitly SMTP/IMAP)
    try {
      var { executeSmtpEmailTool, getSmtpEmailTools: getSmtpIds } = await import('./tools/smtp-email.js');
      var smtpToolIds = getSmtpIds();
      var smtpToolDefs: Record<string, { desc: string; params: any }> = {
        email_send: { desc: 'Send an email via SMTP', params: { type: 'object', properties: { to: { type: 'string', description: 'Recipient email' }, cc: { type: 'string' }, bcc: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string', description: 'Email body text' }, html: { type: 'string' }, replyTo: { type: 'string' } }, required: ['to', 'body'] } },
        email_reply: { desc: 'Reply to an email by UID', params: { type: 'object', properties: { uid: { type: 'number', description: 'Email UID to reply to' }, folder: { type: 'string' }, body: { type: 'string' }, all: { type: 'boolean', description: 'Reply all' } }, required: ['uid', 'body'] } },
        email_forward: { desc: 'Forward an email', params: { type: 'object', properties: { uid: { type: 'number' }, to: { type: 'string' }, folder: { type: 'string' }, comment: { type: 'string' } }, required: ['uid', 'to'] } },
        email_search: { desc: 'Search emails', params: { type: 'object', properties: { query: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, subject: { type: 'string' }, since: { type: 'string' }, before: { type: 'string' }, folder: { type: 'string' }, limit: { type: 'number' } } } },
        email_read: { desc: 'Read a specific email by UID', params: { type: 'object', properties: { uid: { type: 'number' }, folder: { type: 'string' }, markRead: { type: 'boolean' } }, required: ['uid'] } },
        email_list: { desc: 'List recent emails', params: { type: 'object', properties: { folder: { type: 'string' }, limit: { type: 'number' }, unreadOnly: { type: 'boolean' } } } },
        email_folders: { desc: 'List email folders', params: { type: 'object', properties: {} } },
        email_move: { desc: 'Move email to folder', params: { type: 'object', properties: { uid: { type: 'number' }, from: { type: 'string' }, to: { type: 'string' } }, required: ['uid', 'to'] } },
        email_delete: { desc: 'Delete email', params: { type: 'object', properties: { uid: { type: 'number' }, folder: { type: 'string' }, permanent: { type: 'boolean' } }, required: ['uid'] } },
        email_mark_read: { desc: 'Mark email read/unread', params: { type: 'object', properties: { uid: { type: 'number' }, folder: { type: 'string' }, unread: { type: 'boolean' } }, required: ['uid'] } },
      };
      var emailCfg = options.emailConfig;
      for (var toolId of smtpToolIds) {
        var def = smtpToolDefs[toolId];
        if (!def) continue;
        smtpEmailTools.push({
          name: toolId,
          label: toolId.replace(/_/g, ' ').replace(/\b\w/g, function(c: string) { return c.toUpperCase(); }),
          description: def.desc,
          category: 'communication',
          input_schema: def.params,
          execute: (function(tid: string) {
            return async function(_id: string, params: any) {
              var ctx = { emailConfig: emailCfg } as any;
              var result = await executeSmtpEmailTool(tid, ctx, params);
              if (result.error) return { content: [{ type: 'text', text: 'Error: ' + result.error }] };
              return { content: [{ type: 'text', text: JSON.stringify(result.result, null, 2) }] };
            };
          })(toolId),
        } as AnyAgentTool);
      }
      if (smtpEmailTools.length > 0) {
        console.log(`[tools] Loaded ${smtpEmailTools.length} SMTP/IMAP email tools for ${emailCfg.email || emailCfg.smtpUser}`);
        // Register with permission engine so tools aren't blocked as "Unknown tool"
        if ((options as any)?.permissionEngine) {
          const smtpDefs = smtpEmailTools.map(t => ({
            id: t.name, name: t.name, description: (t as any).description || t.name,
            category: 'communicate' as any, risk: t.name.includes('send') || t.name.includes('reply') || t.name.includes('forward') ? 'high' as any : 'low' as any,
            skillId: 'smtp-email', sideEffects: t.name.includes('send') || t.name.includes('reply') || t.name.includes('forward') ? ['sends-email'] as any[] : [] as any[],
          }));
          (options as any).permissionEngine.registerDynamicTools('smtp-email', smtpDefs);
        }
      }
    } catch (e: any) {
      console.warn(`[tools] SMTP email tools load failed: ${e.message}`);
    }
  }

  // ─── Integration Tools (Slack, GitHub, Jira, Stripe, etc.) ───
  // 144 integrations — only loads tools for services with vault credentials
  var integrationTools: AnyAgentTool[] = [];
  if ((options as any)?.vault) {
    try {
      var { createAllIntegrationTools } = await import('./tools/integrations/index.js');
      integrationTools = await createAllIntegrationTools({
        vault: (options as any).vault,
        orgId: (options as any)?.orgId,
        agentId: options?.agentId,
      });
      // Register with permission engine so tools aren't blocked as "Unknown tool"
      if ((options as any)?.permissionEngine && integrationTools.length > 0) {
        const toolDefs = integrationTools.map(t => ({
          id: t.name, name: t.name, description: t.description || t.name,
          category: 'utility' as any, risk: 'medium' as any,
          skillId: 'mcp-bridge', sideEffects: ['external_api'] as any[],
        }));
        (options as any).permissionEngine.registerDynamicTools('mcp-bridge', toolDefs);
      }
    } catch (e: any) {
      console.warn(`[tools] Integration tools load failed: ${e.message}`);
    }
  }

  // ─── External MCP Server Tools ───
  // Tools from MCP servers registered via Dashboard → Integrations & MCP
  var mcpServerTools: AnyAgentTool[] = [];
  if ((options as any)?.mcpProcessManager) {
    try {
      var { createMcpServerTools } = await import('./tools/mcp-server-tools.js');
      mcpServerTools = createMcpServerTools({
        mcpManager: (options as any).mcpProcessManager,
        agentId: options?.agentId,
        permissionEngine: (options as any)?.permissionEngine,
      });
      if (mcpServerTools.length > 0) {
        console.log(`[tools] Loaded ${mcpServerTools.length} MCP server tools for agent ${options?.agentId || 'all'}`);
      }
    } catch (e: any) {
      console.warn(`[tools] MCP server tools load failed: ${e.message}`);
    }
  }

  // ─── Messaging Tools (WhatsApp, Telegram) ───
  var messagingTools: AnyAgentTool[] = [];
  try {
    // Outbound message recorder — stores agent replies in messaging_history
    var _outboundRecorder: ((platform: string, contactId: string, text: string) => void) | undefined;
    try {
      const { storeMessage } = await import('../engine/messaging-history.js');
      const agentId = options?.agentId || '';
      const engineDb = (options as any)?.engineDb;
      if (engineDb && agentId) {
        _outboundRecorder = (platform: string, contactId: string, text: string) => {
          storeMessage(engineDb, {
            agentId, platform, contactId, direction: 'outbound',
            senderName: 'Agent', messageText: text,
          }).catch(() => {});
        };
      }
    } catch {}

    // WhatsApp
    const dataDir = options?.workspaceDir ? (await import('node:path')).resolve(options.workspaceDir, '..') : process.cwd();
    const _rec = _outboundRecorder;
    messagingTools = messagingTools.concat(createWhatsAppTools({
      agentId: options?.agentId || '', dataDir,
      onOutbound: _rec ? (contactId: string, text: string) => _rec('whatsapp', contactId, text) : undefined,
    }) as any);
    // Telegram
    const telegramConfig = (options as any)?.agentConfig?.messagingChannels?.telegram || {};
    if (telegramConfig.botToken) {
      messagingTools = messagingTools.concat(createTelegramTools({
        botToken: telegramConfig.botToken,
        onOutbound: _rec ? (chatId: string, text: string) => _rec('telegram', chatId, text) : undefined,
      }) as any);
    }
  } catch (e: any) {
    console.warn(`[tools] Messaging tools load failed: ${e.message}`);
  }

  // ─── Management / Hierarchy Tools (delegation, escalation, org chart) ───
  var managementTools: AnyAgentTool[] = [];
  if ((options as any)?.hierarchyManager && options?.agentId) {
    try {
      var { createManagementTools } = await import('./tools/management.js');
      managementTools = createManagementTools({
        hierarchyManager: (options as any).hierarchyManager,
        agentId: options.agentId,
        runtime: (options as any)?.runtimeRef,
      }) as AnyAgentTool[];
    } catch (e: any) {
      console.warn(`[tools] Management tools load failed: ${e.message}`);
    }
  }

  // ─── Local System Tools (filesystem, shell, coding, dependency manager) ───
  var localSystemTools: AnyAgentTool[] = [];
  try {
    var { createLocalSystemTools } = await import('./tools/local/index.js');
    localSystemTools = createLocalSystemTools({
      sandboxRoot: options?.workspaceDir || undefined,
      shellCwd: options?.workspaceDir || process.cwd(),
      shellTimeout: 120,
      toolOptions: options,
    }) as AnyAgentTool[];
    // Register with permission engine so tools aren't blocked as "Unknown tool"
    if ((options as any)?.permissionEngine && localSystemTools.length > 0) {
      const localToolDefs = localSystemTools.map(t => ({
        id: t.name, name: t.name, description: (t as any).description || t.name,
        category: 'utility' as any, risk: 'medium' as any,
        skillId: 'local-shell', sideEffects: [] as any[],
      }));
      (options as any).permissionEngine.registerDynamicTools('local-shell', localToolDefs);
    }
  } catch (e: any) {
    console.warn(`[tools] Local system tools load failed: ${e.message}`);
  }

  var enabledTools = rawTools
    .filter(function(t): t is AnyAgentTool { return t !== null; })
    .concat(enterpriseTools)
    .concat(agenticmailTools)
    .concat(workspaceTools)
    .concat(smtpEmailTools)
    .concat(enterpriseBrowserTools)
    .concat(integrationTools)
    .concat(mcpServerTools)
    .concat(messagingTools)
    .concat(managementTools)
    .concat(localSystemTools);

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
