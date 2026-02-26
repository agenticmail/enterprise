/**
 * Enterprise Dynamic Tool Resolver
 *
 * Problem: Loading ALL 200+ tool definitions into every LLM call burns ~10-20K tokens
 * just on schemas. A meeting session doesn't need spreadsheet tools. An email handler
 * doesn't need maps tools.
 *
 * Solution: Context-aware tool loading with on-demand expansion.
 *
 * Architecture:
 *   1. Tools are grouped into TOOL SETS (logical categories)
 *   2. Session CONTEXTS define which sets to load (meeting, chat, email, task, full)
 *   3. A `request_tools` meta-tool lets agents dynamically load more sets mid-session
 *   4. Auto-detection infers context from system prompt, session kind, and runtime flags
 *
 * Token savings:
 *   - Meeting:  ~20 tools instead of 200+ (90% reduction, ~15K tokens saved per LLM call)
 *   - Chat:     ~70 tools instead of 200+ (65% reduction)
 *   - Email:    ~50 tools instead of 200+ (75% reduction)
 *   - Task:     ~140 tools (30% reduction — tasks need broad access)
 *   - Full:     All tools (backward-compatible)
 *
 * MAINTENANCE: When adding new tools, update:
 *   1. TOOL_REGISTRY — add the tool name and its set
 *   2. SESSION_TOOL_SETS — add the set to relevant contexts (if new set)
 *   3. Run `npm run build` to verify no TypeScript errors
 *
 * @module tool-resolver
 */

import type { AnyAgentTool } from './index.js';
import type { AllToolsOptions } from './index.js';

// ─── Tool Set Definitions ────────────────────────────────

export type ToolSet =
  // Core (always loaded)
  | 'core'
  | 'browser'
  | 'system'
  // Memory
  | 'memory'
  | 'visual_memory'
  // Meetings
  | 'meeting_voice'        // In-meeting voice/chat (meeting_speak, meeting_action, etc.)
  | 'meeting_lifecycle'    // Join/leave/schedule (meeting_join, meeting_rsvp, meetings_upcoming, etc.)
  // Google Workspace
  | 'gws_chat'
  | 'gws_gmail'
  | 'gws_calendar'
  | 'gws_drive'
  | 'gws_docs'
  | 'gws_sheets'
  | 'gws_contacts'
  | 'gws_slides'
  | 'gws_forms'
  | 'gws_tasks'
  | 'gws_maps'
  // Enterprise
  | 'ent_database'
  | 'ent_spreadsheet'
  | 'ent_documents'
  | 'ent_http'
  | 'ent_security'
  | 'ent_code'
  | 'ent_diff'
  // Communication
  | 'agenticmail'
  // Integrations
  | 'mcp_bridge';

// ─── Exhaustive Tool Registry ────────────────────────────
// Every tool name → its set. This is the SINGLE SOURCE OF TRUTH.
// If a tool isn't listed here, it falls into the 'unregistered' bucket
// and gets loaded in all contexts (safe default).

const TOOL_REGISTRY: Record<string, ToolSet> = {
  // ── Core (10) ──
  read: 'core',
  write: 'core',
  edit: 'core',
  bash: 'core',
  glob: 'core',
  grep: 'core',
  web_fetch: 'core',
  web_search: 'core',

  // ── Browser (1-2) ──
  browser: 'browser',

  // ── System (1) ──
  system_capabilities: 'system',

  // ── Memory (4) ──
  memory: 'memory',
  memory_context: 'memory',
  memory_reflect: 'memory',
  memory_stats: 'memory',

  // ── Visual Memory (10) ──
  vision_capture: 'visual_memory',
  vision_compare: 'visual_memory',
  vision_diff: 'visual_memory',
  vision_health: 'visual_memory',
  vision_ocr: 'visual_memory',
  vision_query: 'visual_memory',
  vision_session_end: 'visual_memory',
  vision_session_start: 'visual_memory',
  vision_similar: 'visual_memory',
  vision_track: 'visual_memory',

  // ── Meeting Voice (4) — tools used DURING a meeting ──
  meeting_speak: 'meeting_voice',
  meeting_action: 'meeting_voice',
  meeting_audio_setup: 'meeting_voice',
  meeting_voices: 'meeting_voice',

  // ── Meeting Lifecycle (10) — tools for joining/managing meetings ──
  meeting_join: 'meeting_lifecycle',
  meeting_rsvp: 'meeting_lifecycle',
  meeting_can_join: 'meeting_lifecycle',
  meeting_prepare: 'meeting_lifecycle',
  meeting_record: 'meeting_lifecycle',
  meeting_save: 'meeting_lifecycle',
  meetings_scan_inbox: 'meeting_lifecycle',
  meetings_upcoming: 'meeting_lifecycle',

  // ── Google Chat (13) ──
  google_chat_send_message: 'gws_chat',
  google_chat_list_messages: 'gws_chat',
  google_chat_list_spaces: 'gws_chat',
  google_chat_get_space: 'gws_chat',
  google_chat_find_dm: 'gws_chat',
  google_chat_add_member: 'gws_chat',
  google_chat_list_members: 'gws_chat',
  google_chat_delete_message: 'gws_chat',
  google_chat_update_message: 'gws_chat',
  google_chat_react: 'gws_chat',
  google_chat_send_image: 'gws_chat',
  google_chat_upload_attachment: 'gws_chat',
  google_chat_download_attachment: 'gws_chat',
  google_chat_setup_space: 'gws_chat',

  // ── Gmail (15) ──
  gmail_search: 'gws_gmail',
  gmail_read: 'gws_gmail',
  gmail_send: 'gws_gmail',
  gmail_reply: 'gws_gmail',
  gmail_forward: 'gws_gmail',
  gmail_trash: 'gws_gmail',
  gmail_modify: 'gws_gmail',
  gmail_labels: 'gws_gmail',
  gmail_drafts: 'gws_gmail',
  gmail_thread: 'gws_gmail',
  gmail_attachment: 'gws_gmail',
  gmail_profile: 'gws_gmail',
  gmail_get_signature: 'gws_gmail',
  gmail_set_signature: 'gws_gmail',
  gmail_vacation: 'gws_gmail',

  // ── Google Calendar (6) ──
  google_calendar_list: 'gws_calendar',
  google_calendar_events: 'gws_calendar',
  google_calendar_create_event: 'gws_calendar',
  google_calendar_update_event: 'gws_calendar',
  google_calendar_delete_event: 'gws_calendar',
  google_calendar_freebusy: 'gws_calendar',

  // ── Google Drive (7) ──
  google_drive_list: 'gws_drive',
  google_drive_get: 'gws_drive',
  google_drive_create: 'gws_drive',
  google_drive_delete: 'gws_drive',
  google_drive_move: 'gws_drive',
  google_drive_share: 'gws_drive',
  google_drive_request_access: 'gws_drive',

  // ── Google Docs (3) ──
  google_docs_create: 'gws_docs',
  google_docs_read: 'gws_docs',
  google_docs_write: 'gws_docs',

  // ── Google Sheets (7) ──
  google_sheets_read: 'gws_sheets',
  google_sheets_write: 'gws_sheets',
  google_sheets_append: 'gws_sheets',
  google_sheets_create: 'gws_sheets',
  google_sheets_get: 'gws_sheets',
  google_sheets_add_sheet: 'gws_sheets',
  google_sheets_clear: 'gws_sheets',

  // ── Google Contacts (5) ──
  google_contacts_list: 'gws_contacts',
  google_contacts_search: 'gws_contacts',
  google_contacts_create: 'gws_contacts',
  google_contacts_update: 'gws_contacts',
  google_contacts_search_directory: 'gws_contacts',

  // ── Google Slides (12) ──
  google_slides_create: 'gws_slides',
  google_slides_get: 'gws_slides',
  google_slides_get_page: 'gws_slides',
  google_slides_add_slide: 'gws_slides',
  google_slides_delete_slide: 'gws_slides',
  google_slides_duplicate_slide: 'gws_slides',
  google_slides_insert_text: 'gws_slides',
  google_slides_replace_text: 'gws_slides',
  google_slides_create_textbox: 'gws_slides',
  google_slides_add_image: 'gws_slides',
  google_slides_batch_update: 'gws_slides',
  google_slides_thumbnail: 'gws_slides',

  // ── Google Forms (8) ──
  google_forms_create: 'gws_forms',
  google_forms_get: 'gws_forms',
  google_forms_add_question: 'gws_forms',
  google_forms_delete_item: 'gws_forms',
  google_forms_update_info: 'gws_forms',
  google_forms_publish_settings: 'gws_forms',
  google_forms_get_response: 'gws_forms',
  google_forms_list_responses: 'gws_forms',

  // ── Google Tasks (7) ──
  google_tasks_list: 'gws_tasks',
  google_tasks_list_tasklists: 'gws_tasks',
  google_tasks_create: 'gws_tasks',
  google_tasks_create_list: 'gws_tasks',
  google_tasks_update: 'gws_tasks',
  google_tasks_complete: 'gws_tasks',
  google_tasks_delete: 'gws_tasks',

  // ── Google Maps (10) ──
  google_maps_search: 'gws_maps',
  google_maps_place_details: 'gws_maps',
  google_maps_nearby: 'gws_maps',
  google_maps_geocode: 'gws_maps',
  google_maps_directions: 'gws_maps',
  google_maps_distance: 'gws_maps',
  google_maps_elevation: 'gws_maps',
  google_maps_timezone: 'gws_maps',
  google_maps_autocomplete: 'gws_maps',
  google_maps_static: 'gws_maps',

  // ── Enterprise: Database (6) ──
  ent_db_query: 'ent_database',
  ent_db_schema: 'ent_database',
  ent_db_tables: 'ent_database',
  ent_db_sample: 'ent_database',
  ent_db_explain: 'ent_database',
  ent_db_connections: 'ent_database',

  // ── Enterprise: Spreadsheet (7) ──
  ent_sheet_read: 'ent_spreadsheet',
  ent_sheet_write: 'ent_spreadsheet',
  ent_sheet_filter: 'ent_spreadsheet',
  ent_sheet_aggregate: 'ent_spreadsheet',
  ent_sheet_transform: 'ent_spreadsheet', // ent_sheet_transform
  ent_sheet_merge: 'ent_spreadsheet',
  ent_sheet_pivot: 'ent_spreadsheet',
  ent_sheet_convert: 'ent_spreadsheet',

  // ── Enterprise: Documents (8) ──
  ent_doc_generate_pdf: 'ent_documents',
  ent_doc_generate_docx: 'ent_documents',
  ent_doc_ocr: 'ent_documents',
  ent_doc_parse_invoice: 'ent_documents',
  ent_doc_convert: 'ent_documents',
  ent_doc_extract_tables: 'ent_documents',
  ent_doc_fill_form: 'ent_documents',
  ent_doc_merge_pdfs: 'ent_documents',

  // ── Enterprise: HTTP (4) ──
  ent_http_request: 'ent_http',
  ent_http_graphql: 'ent_http',
  ent_http_batch: 'ent_http',
  ent_http_download: 'ent_http',

  // ── Enterprise: Security (6) ──
  ent_sec_scan_secrets: 'ent_security',
  ent_sec_scan_pii: 'ent_security',
  ent_sec_redact_pii: 'ent_security',
  ent_sec_scan_deps: 'ent_security',
  ent_sec_compliance_check: 'ent_security',
  ent_sec_hash: 'ent_security',

  // ── Enterprise: Code Sandbox (5) ──
  ent_code_run_js: 'ent_code',
  ent_code_run_python: 'ent_code',
  ent_code_run_shell: 'ent_code',
  ent_code_transform_json: 'ent_code',
  ent_code_regex: 'ent_code',

  // ── Enterprise: Diff (4) ──
  ent_diff_text: 'ent_diff',
  ent_diff_json: 'ent_diff',
  ent_diff_spreadsheet: 'ent_diff',
  ent_diff_summary: 'ent_diff',

  // ── AgenticMail (40) ──
  agenticmail_inbox: 'agenticmail',
  agenticmail_read: 'agenticmail',
  agenticmail_send: 'agenticmail',
  agenticmail_reply: 'agenticmail',
  agenticmail_forward: 'agenticmail',
  agenticmail_delete: 'agenticmail',
  agenticmail_search: 'agenticmail',
  agenticmail_move: 'agenticmail',
  agenticmail_mark_read: 'agenticmail',
  agenticmail_mark_unread: 'agenticmail',
  agenticmail_folders: 'agenticmail',
  agenticmail_create_folder: 'agenticmail',
  agenticmail_list_folder: 'agenticmail',
  agenticmail_digest: 'agenticmail',
  agenticmail_contacts: 'agenticmail',
  agenticmail_drafts: 'agenticmail',
  agenticmail_signatures: 'agenticmail',
  agenticmail_templates: 'agenticmail',
  agenticmail_template_send: 'agenticmail',
  agenticmail_tags: 'agenticmail',
  agenticmail_rules: 'agenticmail',
  agenticmail_schedule: 'agenticmail',
  agenticmail_spam: 'agenticmail',
  agenticmail_batch_read: 'agenticmail',
  agenticmail_batch_delete: 'agenticmail',
  agenticmail_batch_mark_read: 'agenticmail',
  agenticmail_batch_mark_unread: 'agenticmail',
  agenticmail_batch_move: 'agenticmail',
  agenticmail_whoami: 'agenticmail',
  agenticmail_update_metadata: 'agenticmail',
  agenticmail_storage: 'agenticmail',
  agenticmail_list_agents: 'agenticmail',
  agenticmail_message_agent: 'agenticmail',
  agenticmail_call_agent: 'agenticmail',
  agenticmail_check_messages: 'agenticmail',
  agenticmail_check_tasks: 'agenticmail',
  agenticmail_claim_task: 'agenticmail',
  agenticmail_complete_task: 'agenticmail',
  agenticmail_submit_result: 'agenticmail',
  agenticmail_wait_for_email: 'agenticmail',
};

// Total registered: ~205 tools

// ─── Session Context → Tool Set Mapping ──────────────────

export type SessionContext = 'meeting' | 'chat' | 'email' | 'task' | 'full';

/**
 * Which tool sets each session context loads.
 *
 * Design principles:
 *  - meeting: MINIMAL — only what's needed for real-time voice conversation
 *  - chat: MODERATE — daily work tools + ability to join meetings
 *  - email: FOCUSED — email handling + supporting lookups
 *  - task: BROAD — autonomous work needs wide tool access
 *  - full: EVERYTHING — backward-compatible, no filtering
 */
const SESSION_TOOL_SETS: Record<SessionContext, ToolSet[]> = {
  meeting: [
    'core',                     // read/write/search (may need to look things up)
    'memory',                   // remember context from the meeting
    'meeting_voice',            // speak, chat, audio control
    'gws_chat',                 // send messages to chat space
    'gws_calendar',             // check schedule if asked
  ],

  chat: [
    'core', 'browser', 'system',
    'memory', 'visual_memory',
    'meeting_lifecycle',        // can join meetings from chat
    'meeting_voice',            // in case meeting starts mid-session
    'gws_chat', 'gws_gmail', 'gws_calendar', 'gws_drive', 'gws_docs',
    'gws_tasks', 'gws_contacts',
    'agenticmail',
    'ent_http',                 // may need to fetch APIs
  ],

  email: [
    'core', 'system',
    'memory',
    'gws_gmail', 'gws_calendar', 'gws_contacts', 'gws_drive',
    'gws_tasks',
    'agenticmail',
    'ent_documents',            // may need to generate/parse attachments
  ],

  task: [
    'core', 'browser', 'system',
    'memory', 'visual_memory',
    'meeting_lifecycle',
    'gws_chat', 'gws_gmail', 'gws_calendar', 'gws_drive',
    'gws_docs', 'gws_sheets', 'gws_contacts', 'gws_slides',
    'gws_forms', 'gws_tasks', 'gws_maps',
    'ent_database', 'ent_spreadsheet', 'ent_documents',
    'ent_http', 'ent_security', 'ent_code', 'ent_diff',
    'agenticmail', 'mcp_bridge',
  ],

  full: [
    'core', 'browser', 'system',
    'memory', 'visual_memory',
    'meeting_voice', 'meeting_lifecycle',
    'gws_chat', 'gws_gmail', 'gws_calendar', 'gws_drive',
    'gws_docs', 'gws_sheets', 'gws_contacts', 'gws_slides',
    'gws_forms', 'gws_tasks', 'gws_maps',
    'ent_database', 'ent_spreadsheet', 'ent_documents',
    'ent_http', 'ent_security', 'ent_code', 'ent_diff',
    'agenticmail', 'mcp_bridge',
  ],
};

// ─── Context Detection ───────────────────────────────────

/**
 * Auto-detect session context from available signals.
 * Priority: explicit > sessionKind > system prompt analysis > default
 */
export function detectSessionContext(opts: {
  systemPrompt?: string;
  isKeepAlive?: boolean;
  sessionKind?: string;
  explicitContext?: SessionContext;
}): SessionContext {
  if (opts.explicitContext) return opts.explicitContext;

  if (opts.sessionKind === 'meeting') return 'meeting';
  if (opts.sessionKind === 'email') return 'email';
  if (opts.sessionKind === 'task') return 'task';

  const sp = opts.systemPrompt || '';

  // Keep-alive + meeting keywords = active meeting
  if (opts.isKeepAlive && (sp.includes('MeetingMonitor') || sp.includes('meeting_speak'))) {
    return 'meeting';
  }

  // Meeting join prompt (not yet in meeting, but about to)
  if (sp.includes('meeting_join') && sp.includes('MeetingMonitor')) return 'chat';

  // Email-focused session
  if (sp.includes('[Email Handler]') || sp.includes('email triage')) return 'email';

  // Default: chat (most common)
  return 'chat';
}

// ─── Tool Filtering ──────────────────────────────────────

/**
 * Filter tools for a session context.
 *
 * How it works:
 *  1. Look up each tool's name in TOOL_REGISTRY to find its set
 *  2. Check if that set is in the active sets for this context
 *  3. Unregistered tools (not in TOOL_REGISTRY) are ALWAYS included (safe default for new/MCP tools)
 *  4. Add `request_tools` meta-tool for on-demand expansion
 */
export function filterToolsForContext(
  allTools: AnyAgentTool[],
  context: SessionContext,
  options?: { additionalSets?: ToolSet[] }
): AnyAgentTool[] {
  const activeSets = new Set<ToolSet>([
    ...SESSION_TOOL_SETS[context],
    ...(options?.additionalSets || []),
  ]);

  const filtered = allTools.filter(tool => {
    const set = TOOL_REGISTRY[tool.name];
    if (!set) return true; // Unregistered tool → always include (safe default)
    return activeSets.has(set);
  });

  // Add request_tools meta-tool
  filtered.push(createRequestToolsTool(allTools, activeSets, context));

  return filtered;
}

// ─── Request Tools Meta-Tool ─────────────────────────────

/**
 * Creates the `request_tools` meta-tool that lets agents dynamically
 * load additional tool sets mid-session.
 *
 * Example: Agent is in a meeting and needs to check a spreadsheet.
 *   → Agent calls request_tools({ sets: ['gws_sheets'] })
 *   → Sheets tools are injected into the session
 *   → Agent can now use google_sheets_read, etc.
 */
function createRequestToolsTool(
  allTools: AnyAgentTool[],
  activeSets: Set<ToolSet>,
  context: SessionContext,
): AnyAgentTool {
  const loadedSets = new Set<ToolSet>(activeSets);

  // Build human-readable set descriptions
  const SET_DESCRIPTIONS: Record<ToolSet, string> = {
    core: 'File I/O, search, bash',
    browser: 'Web browser automation',
    system: 'System capabilities check',
    memory: 'Agent memory (store/search/reflect)',
    visual_memory: 'Vision capture, OCR, visual comparison',
    meeting_voice: 'In-meeting voice + chat',
    meeting_lifecycle: 'Join/schedule/manage meetings',
    gws_chat: 'Google Chat messaging',
    gws_gmail: 'Gmail read/send/search',
    gws_calendar: 'Google Calendar events',
    gws_drive: 'Google Drive files',
    gws_docs: 'Google Docs read/write',
    gws_sheets: 'Google Sheets read/write',
    gws_contacts: 'Google Contacts',
    gws_slides: 'Google Slides',
    gws_forms: 'Google Forms',
    gws_tasks: 'Google Tasks',
    gws_maps: 'Google Maps + Places',
    ent_database: 'SQL database tools',
    ent_spreadsheet: 'CSV/spreadsheet processing',
    ent_documents: 'PDF/DOCX generation, OCR, invoices',
    ent_http: 'HTTP requests, GraphQL',
    ent_security: 'Security scanning (secrets, PII, deps)',
    ent_code: 'Code sandbox (JS, Python, shell)',
    ent_diff: 'Text/JSON/spreadsheet diffs',
    agenticmail: 'Email management (40 tools)',
    mcp_bridge: 'MCP integration adapters',
  };

  const allSets = Object.keys(SET_DESCRIPTIONS) as ToolSet[];
  const notLoaded = allSets.filter(s => !loadedSets.has(s));

  const description = notLoaded.length > 0
    ? `Load additional tool sets into this session on demand. ` +
      `Currently loaded: ${[...loadedSets].join(', ')}. ` +
      `Available to load: ${notLoaded.map(s => `${s} (${SET_DESCRIPTIONS[s]})`).join(', ')}.`
    : 'All tool sets are loaded.';

  return {
    name: 'request_tools',
    label: 'Request Tools',
    description,
    category: 'utility' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        sets: {
          type: 'array',
          items: { type: 'string', enum: allSets },
          description: 'Tool sets to load: ' + notLoaded.map(s => `"${s}"`).join(', '),
        },
      },
      required: ['sets'],
    },
    async execute(_id: string, params: any) {
      const requested = (params.sets || []) as ToolSet[];
      const newSets = requested.filter(s => !loadedSets.has(s) && SET_DESCRIPTIONS[s]);

      if (newSets.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'no_change',
            loaded: [...loadedSets],
            message: requested.length === 0
              ? 'No sets specified. Available: ' + notLoaded.join(', ')
              : 'All requested sets already loaded.',
          }) }],
        };
      }

      // Find tools in the new sets
      const newToolNames = new Set<string>();
      for (const [name, set] of Object.entries(TOOL_REGISTRY)) {
        if (newSets.includes(set)) newToolNames.add(name);
      }
      const newTools = allTools.filter(t => newToolNames.has(t.name));

      for (const s of newSets) loadedSets.add(s);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          status: 'loaded',
          newSets,
          newToolCount: newTools.length,
          newTools: newTools.map(t => t.name),
          allLoaded: [...loadedSets],
          message: `Loaded ${newTools.length} tools from: ${newSets.join(', ')}. They are now available.`,
        }) }],
        // Signal to agent-loop to inject these into the session
        _dynamicTools: newTools,
      };
    },
  } as AnyAgentTool;
}

// ─── Main Entry Point ────────────────────────────────────

/**
 * Create tools for a specific session context.
 * Drop-in replacement for `createAllTools` that's context-aware.
 *
 * Usage:
 *   // Instead of:
 *   const tools = await createAllTools(options);
 *
 *   // Use:
 *   const tools = await createToolsForContext(options, 'meeting');
 *   // → ~20 tools instead of 200+
 */
export async function createToolsForContext(
  options: AllToolsOptions,
  context: SessionContext,
  additionalSets?: ToolSet[],
): Promise<AnyAgentTool[]> {
  const { createAllTools } = await import('./index.js');

  if (context === 'full') {
    return createAllTools(options);
  }

  const allTools = await createAllTools(options);
  return filterToolsForContext(allTools, context, { additionalSets });
}

// ─── Diagnostics ─────────────────────────────────────────

/**
 * Get detailed tool loading stats for logging.
 */
export function getToolSetStats(tools: AnyAgentTool[]): {
  total: number;
  bySet: Record<string, number>;
  unregistered: string[];
} {
  const bySet: Record<string, number> = {};
  const unregistered: string[] = [];

  for (const tool of tools) {
    const set = TOOL_REGISTRY[tool.name];
    if (!set) {
      if (tool.name !== 'request_tools') unregistered.push(tool.name);
      continue;
    }
    bySet[set] = (bySet[set] || 0) + 1;
  }

  return { total: tools.length, bySet, unregistered };
}

/**
 * Validate that all tools in the system are registered.
 * Call at startup to catch missing registrations early.
 */
export function validateToolRegistry(allTools: AnyAgentTool[]): {
  registered: number;
  unregistered: string[];
  registryOrphans: string[]; // In registry but not in tools
} {
  const toolNames = new Set(allTools.map(t => t.name));
  const unregistered = allTools
    .filter(t => !TOOL_REGISTRY[t.name])
    .map(t => t.name);

  const registryOrphans = Object.keys(TOOL_REGISTRY)
    .filter(name => !toolNames.has(name));

  return {
    registered: allTools.length - unregistered.length,
    unregistered,
    registryOrphans,
  };
}
