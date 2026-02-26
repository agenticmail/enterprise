/**
 * Dynamic Tool Resolver
 *
 * Instead of loading ALL 150+ tools into every session (burning ~8-15K tokens
 * just on tool definitions), this resolver loads only the tools relevant to
 * the session's context.
 *
 * Tool Sets:
 *   - CORE:       Always loaded (read, write, edit, bash, glob, grep, web_fetch, web_search)
 *   - BROWSER:    Loaded when browser is available
 *   - MEMORY:     Always loaded (memory_store, memory_search, etc.)
 *   - MEETING:    meeting_speak, meeting_action, meeting_audio_setup, meeting_voices
 *   - MEETING_LIFECYCLE: meeting_join, meeting_rsvp (for joining meetings from chat)
 *   - GWS_CHAT:   google_chat_send_message, google_chat_* (for chat sessions)
 *   - GWS_GMAIL:  gmail_* tools
 *   - GWS_CALENDAR: calendar_* tools
 *   - GWS_DRIVE:  drive_* tools
 *   - GWS_DOCS:   docs_* tools
 *   - GWS_SHEETS: sheets_* tools
 *   - GWS_CONTACTS: contacts_* tools
 *   - GWS_SLIDES: slides_* tools
 *   - GWS_FORMS:  forms_* tools
 *   - GWS_MAPS:   maps_* tools
 *   - ENTERPRISE: database, spreadsheet, document, http, security, code-sandbox, diff tools
 *   - AGENTICMAIL: agenticmail_* tools
 *   - VISUAL_MEMORY: visual_* tools
 *   - MCP_BRIDGE: dynamically loaded MCP adapter tools
 *
 * Session types auto-resolve to tool sets:
 *   - meeting:     CORE + MEMORY + MEETING + GWS_CHAT (minimal — voice conversation)
 *   - chat:        CORE + MEMORY + BROWSER + MEETING_LIFECYCLE + GWS_CHAT + GWS_GMAIL + GWS_CALENDAR + GWS_DRIVE + AGENTICMAIL
 *   - email:       CORE + MEMORY + GWS_GMAIL + GWS_CALENDAR + GWS_CONTACTS + AGENTICMAIL
 *   - task:        CORE + MEMORY + BROWSER + ALL GWS + ENTERPRISE + AGENTICMAIL + MCP_BRIDGE
 *   - full:        Everything (backward-compatible, for sessions that need it all)
 *
 * Agents can always request additional tool sets at runtime via `request_tools`.
 */

import type { AnyAgentTool, AllToolsOptions } from './index.js';

// ─── Tool Set Names ──────────────────────────────────────

export type ToolSet =
  | 'core' | 'browser' | 'memory' | 'visual_memory'
  | 'meeting' | 'meeting_lifecycle'
  | 'gws_chat' | 'gws_gmail' | 'gws_calendar' | 'gws_drive'
  | 'gws_docs' | 'gws_sheets' | 'gws_contacts' | 'gws_slides'
  | 'gws_forms' | 'gws_maps'
  | 'enterprise' | 'agenticmail' | 'mcp_bridge';

// ─── Session Type → Tool Set Mapping ─────────────────────

export type SessionContext = 'meeting' | 'chat' | 'email' | 'task' | 'full';

const SESSION_TOOL_SETS: Record<SessionContext, ToolSet[]> = {
  meeting: [
    'core', 'memory', 'meeting', 'gws_chat',
  ],
  chat: [
    'core', 'memory', 'browser', 'meeting_lifecycle',
    'gws_chat', 'gws_gmail', 'gws_calendar', 'gws_drive', 'gws_docs',
    'agenticmail',
  ],
  email: [
    'core', 'memory', 'gws_gmail', 'gws_calendar', 'gws_contacts',
    'agenticmail',
  ],
  task: [
    'core', 'memory', 'browser', 'visual_memory',
    'meeting_lifecycle',
    'gws_chat', 'gws_gmail', 'gws_calendar', 'gws_drive',
    'gws_docs', 'gws_sheets', 'gws_contacts', 'gws_slides', 'gws_forms',
    'gws_maps', 'enterprise', 'agenticmail', 'mcp_bridge',
  ],
  full: [
    'core', 'memory', 'browser', 'visual_memory',
    'meeting', 'meeting_lifecycle',
    'gws_chat', 'gws_gmail', 'gws_calendar', 'gws_drive',
    'gws_docs', 'gws_sheets', 'gws_contacts', 'gws_slides', 'gws_forms',
    'gws_maps', 'enterprise', 'agenticmail', 'mcp_bridge',
  ],
};

// ─── Tool Name → Set Mapping ─────────────────────────────
// Maps tool name prefixes to their set. Used to filter the full tool array.

const TOOL_SET_PATTERNS: Record<ToolSet, (name: string) => boolean> = {
  core: (n) => ['read', 'write', 'edit', 'bash', 'glob', 'grep', 'web_fetch', 'web_search'].includes(n),
  browser: (n) => n === 'browser' || n === 'screenshot' || n.startsWith('enterprise_browser'),
  memory: (n) => n.startsWith('memory_') || n === 'memory',
  visual_memory: (n) => n.startsWith('visual_'),
  meeting: (n) => n.startsWith('meeting_speak') || n === 'meeting_action' || n === 'meeting_audio_setup' || n === 'meeting_voices',
  meeting_lifecycle: (n) => n === 'meeting_join' || n === 'meeting_rsvp' || n === 'meeting_action',
  gws_chat: (n) => n.startsWith('google_chat_'),
  gws_gmail: (n) => n.startsWith('gmail_') || n === 'google_gmail_search' || n.startsWith('google_gmail'),
  gws_calendar: (n) => n.startsWith('calendar_') || n.startsWith('google_calendar'),
  gws_drive: (n) => n.startsWith('drive_') || n.startsWith('google_drive'),
  gws_docs: (n) => n.startsWith('docs_') || n.startsWith('google_docs'),
  gws_sheets: (n) => n.startsWith('sheets_') || n.startsWith('google_sheets'),
  gws_contacts: (n) => n.startsWith('contacts_') || n.startsWith('google_contacts'),
  gws_slides: (n) => n.startsWith('slides_') || n.startsWith('google_slides'),
  gws_forms: (n) => n.startsWith('forms_') || n.startsWith('google_forms'),
  gws_maps: (n) => n.startsWith('maps_') || n.startsWith('google_maps'),
  enterprise: (n) => [
    'enterprise_', 'database_', 'spreadsheet_', 'document_', 'http_',
    'security_', 'code_sandbox_', 'diff_', 'sql_', 'csv_', 'pdf_', 'docx_',
  ].some(p => n.startsWith(p)),
  agenticmail: (n) => n.startsWith('agenticmail_'),
  mcp_bridge: (n) => n.startsWith('mcp_') || n.includes('_mcp'),
};

// ─── Context Detection ───────────────────────────────────

/**
 * Auto-detect session context from system prompt and runtime signals.
 */
export function detectSessionContext(opts: {
  systemPrompt?: string;
  isKeepAlive?: boolean;
  sessionKind?: string;
  explicitContext?: SessionContext;
}): SessionContext {
  // Explicit override wins
  if (opts.explicitContext) return opts.explicitContext;

  // Session kind from router
  if (opts.sessionKind === 'meeting') return 'meeting';
  if (opts.sessionKind === 'email') return 'email';
  if (opts.sessionKind === 'task') return 'task';

  // Detect from system prompt content
  const sp = opts.systemPrompt || '';

  // Meeting session: has MeetingMonitor or meeting_speak instructions
  if (opts.isKeepAlive && (sp.includes('MeetingMonitor') || sp.includes('meeting_speak'))) {
    return 'meeting';
  }

  // Email session
  if (sp.includes('email_') && !sp.includes('meeting_')) return 'email';

  // Default for chat sessions
  return 'chat';
}

// ─── Tool Filtering ──────────────────────────────────────

/**
 * Filter a full tool array down to only the tools needed for a session context.
 * Returns the filtered tools + a `request_tools` meta-tool that lets the agent
 * dynamically load additional tool sets mid-session.
 */
export function filterToolsForContext(
  allTools: AnyAgentTool[],
  context: SessionContext,
  options?: { additionalSets?: ToolSet[] }
): AnyAgentTool[] {
  const sets = new Set<ToolSet>([
    ...SESSION_TOOL_SETS[context],
    ...(options?.additionalSets || []),
  ]);

  // Build a combined matcher from all active sets
  const matchers = [...sets].map(s => TOOL_SET_PATTERNS[s]).filter(Boolean);

  const filtered = allTools.filter(tool => {
    const name = tool.name;
    return matchers.some(m => m(name));
  });

  // Add the request_tools meta-tool so the agent can load more tools on demand
  const requestToolsTool = createRequestToolsTool(allTools, sets);
  filtered.push(requestToolsTool);

  return filtered;
}

/**
 * Create the `request_tools` meta-tool.
 * The agent can call this to load additional tool sets into the session.
 */
function createRequestToolsTool(
  allTools: AnyAgentTool[],
  activeSets: Set<ToolSet>
): AnyAgentTool {
  // Track which tools have been loaded (start with active sets)
  const loadedSets = new Set<ToolSet>(activeSets);

  // List what's available but not loaded
  const availableSets = Object.keys(TOOL_SET_PATTERNS) as ToolSet[];

  return {
    name: 'request_tools',
    label: 'Request Tools',
    description: `Load additional tool sets into this session. Currently loaded: ${[...activeSets].join(', ')}. ` +
      `Available sets: ${availableSets.filter(s => !activeSets.has(s)).join(', ') || 'all loaded'}. ` +
      `Use this when you need tools not currently available (e.g., need spreadsheet tools, or maps).`,
    category: 'utility' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        sets: {
          type: 'array',
          items: { type: 'string', enum: availableSets },
          description: 'Tool sets to load. Available: ' + availableSets.join(', '),
        },
      },
      required: ['sets'],
    },
    async execute(_id: string, params: any) {
      const requested = (params.sets || []) as ToolSet[];
      const newSets = requested.filter(s => !loadedSets.has(s) && TOOL_SET_PATTERNS[s]);

      if (newSets.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'no_change',
              loaded: [...loadedSets],
              message: 'All requested tool sets are already loaded.',
            }),
          }],
        };
      }

      // Find tools matching the new sets
      const newMatchers = newSets.map(s => TOOL_SET_PATTERNS[s]);
      const newTools = allTools.filter(t => newMatchers.some(m => m(t.name)));

      // Mark as loaded
      for (const s of newSets) loadedSets.add(s);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'loaded',
            newSets,
            newTools: newTools.map(t => t.name),
            totalLoaded: [...loadedSets],
            message: `Loaded ${newTools.length} tools from sets: ${newSets.join(', ')}. These tools are now available.`,
          }),
        }],
        // Signal to the runtime to inject these tools into the session
        _dynamicTools: newTools,
      };
    },
  } as AnyAgentTool;
}

// ─── Convenience: Create Tools for Context ───────────────

/**
 * Create tools for a specific session context.
 * This is the main entry point — replaces `createAllTools` for context-aware sessions.
 *
 * Usage:
 *   const tools = await createToolsForContext(options, 'meeting');
 *   // → Only loads ~15 tools instead of 150+
 */
export async function createToolsForContext(
  options: AllToolsOptions,
  context: SessionContext,
  additionalSets?: ToolSet[],
): Promise<AnyAgentTool[]> {
  // Import the full tool creator lazily
  const { createAllTools } = await import('./index.js');

  // For 'full' context, skip filtering entirely
  if (context === 'full') {
    return createAllTools(options);
  }

  // Create all tools (they're cheap to create, expensive to send to LLM)
  const allTools = await createAllTools(options);

  // Filter down to what this session needs
  return filterToolsForContext(allTools, context, { additionalSets });
}

// ─── Stats ───────────────────────────────────────────────

/**
 * Get tool count stats for logging/debugging.
 */
export function getToolSetStats(tools: AnyAgentTool[]): {
  total: number;
  bySet: Record<string, number>;
  unmatched: string[];
} {
  const bySet: Record<string, number> = {};
  const matched = new Set<string>();

  for (const [setName, matcher] of Object.entries(TOOL_SET_PATTERNS)) {
    const count = tools.filter(t => matcher(t.name)).length;
    if (count > 0) bySet[setName] = count;
    for (const t of tools) {
      if (matcher(t.name)) matched.add(t.name);
    }
  }

  const unmatched = tools
    .filter(t => !matched.has(t.name))
    .map(t => t.name);

  return { total: tools.length, bySet, unmatched };
}
