/**
 * Enterprise Dynamic Tool Resolver v2
 *
 * PROBLEM: Loading ALL 200+ tool definitions into every LLM call burns ~18-20K tokens
 * just on schemas. A simple "hey how are you" costs 40K tokens because 98 tools are loaded.
 *
 * SOLUTION: Three-tier lazy loading system:
 *
 *   TIER 1 — ESSENTIAL (always loaded, ~8-12 tools, ~2-3K tokens)
 *     Tools the agent needs for ANY conversation. Think of it as "what a human always has":
 *     ability to think (memory), communicate (chat), look things up (search), and ask for more tools.
 *
 *   TIER 2 — CONTEXTUAL (loaded when context signals demand, ~20-40 tools)
 *     Loaded based on session context (meeting, email handler, etc.) or when the conversation
 *     shifts to need them. The agent can also request these via `request_tools`.
 *
 *   TIER 3 — SPECIALIST (loaded on-demand only, ~100+ tools)
 *     Niche tools (slides, forms, security scans, spreadsheet transforms). Only loaded when
 *     the agent explicitly requests them or the task requires them.
 *
 * KEEP-ALIVE INTEGRATION:
 *   - Sessions track their loaded tool sets in `SessionToolState`
 *   - When a session transitions (chat → meeting → chat), tools are re-resolved
 *   - `request_tools` results persist across the session (no re-requesting)
 *   - Tool state survives session resume after process restart
 *
 * TOKEN IMPACT:
 *   - Simple chat: ~12 tools (~3K tokens) instead of 98 (~20K) = 85% reduction
 *   - Active work: ~30-50 tools (~8-12K tokens) loaded progressively as needed
 *   - Meeting: ~15 tools (~4K tokens)
 *   - Full (backward compat): all tools
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
  | 'meeting_voice'
  | 'meeting_lifecycle'
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
  | 'remotion_video'
  | 'ent_knowledge'
  // Local system
  | 'local_filesystem'
  | 'local_shell'
  // Communication
  | 'agenticmail'
  // Messaging channels
  | 'msg_whatsapp'
  | 'msg_telegram'
  // Management (hierarchy, delegation, escalation)
  | 'management'
  // Integrations
  | 'mcp_bridge'
  // Aliases (legacy/shorthand)
  | 'filesystem'
  | 'web';

// ─── Tier Classification ─────────────────────────────────

export type ToolTier = 1 | 2 | 3;

/**
 * Tier 1: ESSENTIAL — Always loaded in every session. Absolute minimum for the agent to function.
 * Tier 2: CONTEXTUAL — Loaded by session context or conversation signals.
 * Tier 3: SPECIALIST — Only loaded on explicit request_tools or task context.
 */
const TIER_MAP: Record<ToolSet, ToolTier> = {
  // Tier 1 — Agent can't function without these
  core: 1,           // read/write/search/bash — fundamental
  memory: 1,         // agent memory is always needed

  // Tier 2 — Common workflows, loaded by context
  gws_chat: 2,       // only when source is Google Chat
  browser: 2,
  system: 2,
  visual_memory: 2,
  meeting_voice: 2,
  meeting_lifecycle: 2,
  gws_gmail: 2,
  gws_calendar: 2,
  gws_drive: 2,
  gws_docs: 2,
  gws_tasks: 2,
  gws_contacts: 2,
  agenticmail: 2,
  ent_http: 2,

  // Tier 3 — Specialist, on-demand only
  gws_sheets: 3,
  gws_slides: 3,
  gws_forms: 3,
  gws_maps: 3,
  ent_database: 3,
  ent_spreadsheet: 3,
  ent_documents: 3,
  ent_security: 3,
  ent_code: 3,
  ent_diff: 3,
  remotion_video: 3,
  ent_knowledge: 2,
  local_filesystem: 2,
  local_shell: 2,
  management: 1,      // always loaded — agent must know its position
  msg_whatsapp: 2,
  msg_telegram: 2,
  mcp_bridge: 3,
  filesystem: 2,
  web: 2,
  smtp_email: 2,
};

// ─── Exhaustive Tool Registry ────────────────────────────
// Every tool name → its set. SINGLE SOURCE OF TRUTH.

const TOOL_REGISTRY: Record<string, ToolSet> = {
  // ── Core (8) ──
  read: 'core',
  write: 'core',
  edit: 'core',
  bash: 'core',
  glob: 'core',
  grep: 'core',
  web_fetch: 'core',
  web_search: 'core',

  // ── Browser (1) ──
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

  // ── Meeting Voice (4) ──
  meeting_speak: 'meeting_voice',
  meeting_action: 'meeting_voice',
  meeting_audio_setup: 'meeting_voice',
  meeting_voices: 'meeting_voice',

  // ── Meeting Lifecycle (8) ──
  meeting_join: 'meeting_lifecycle',
  meeting_rsvp: 'meeting_lifecycle',
  meeting_can_join: 'meeting_lifecycle',
  meeting_prepare: 'meeting_lifecycle',
  meeting_record: 'meeting_lifecycle',
  meeting_save: 'meeting_lifecycle',
  meetings_scan_inbox: 'meeting_lifecycle',
  meetings_upcoming: 'meeting_lifecycle',

  // ── Google Chat (14) ──
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

  // ── SMTP/IMAP Email (10) ──
  email_send: 'smtp_email',
  email_reply: 'smtp_email',
  email_forward: 'smtp_email',
  email_search: 'smtp_email',
  email_read: 'smtp_email',
  email_list: 'smtp_email',
  email_folders: 'smtp_email',
  email_move: 'smtp_email',
  email_delete: 'smtp_email',
  email_mark_read: 'smtp_email',

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

  // ── Enterprise: Spreadsheet (8) ──
  ent_sheet_read: 'ent_spreadsheet',
  ent_sheet_write: 'ent_spreadsheet',
  ent_sheet_filter: 'ent_spreadsheet',
  ent_sheet_aggregate: 'ent_spreadsheet',
  ent_sheet_transform: 'ent_spreadsheet',
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

  // ── Remotion Video (8) ──
  remotion_create_project: 'remotion_video',
  remotion_create_composition: 'remotion_video',
  remotion_render: 'remotion_video',
  remotion_render_still: 'remotion_video',
  remotion_list_compositions: 'remotion_video',
  remotion_preview_url: 'remotion_video',
  remotion_add_asset: 'remotion_video',
  remotion_install_package: 'remotion_video',
  remotion_share_file: 'remotion_video',

  // ── Knowledge Search (3) ──
  knowledge_base_search: 'ent_knowledge',
  knowledge_hub_search: 'ent_knowledge',
  knowledge_search_stats: 'ent_knowledge',

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

  // ── Local: Filesystem (7) ──
  file_read: 'local_filesystem',
  file_write: 'local_filesystem',
  file_edit: 'local_filesystem',
  file_list: 'local_filesystem',
  file_search: 'local_filesystem',
  file_move: 'local_filesystem',
  file_delete: 'local_filesystem',

  // ── Local: Shell & System (7) ──
  shell_exec: 'local_shell',
  shell_interactive: 'local_shell',
  shell_sudo: 'local_shell',
  shell_install: 'local_shell',
  shell_session_list: 'local_shell',
  shell_session_kill: 'local_shell',
  system_info: 'local_shell',
  check_dependency: 'local_shell',
  install_dependency: 'local_shell',
  check_environment: 'local_shell',
  cleanup_installed: 'local_shell',

  // ── Messaging: WhatsApp (16) ──
  whatsapp_connect: 'msg_whatsapp',
  whatsapp_status: 'msg_whatsapp',
  whatsapp_send: 'msg_whatsapp',
  whatsapp_send_media: 'msg_whatsapp',
  whatsapp_get_groups: 'msg_whatsapp',
  whatsapp_send_voice: 'msg_whatsapp',
  whatsapp_send_location: 'msg_whatsapp',
  whatsapp_send_contact: 'msg_whatsapp',
  whatsapp_react: 'msg_whatsapp',
  whatsapp_typing: 'msg_whatsapp',
  whatsapp_read_receipts: 'msg_whatsapp',
  whatsapp_profile: 'msg_whatsapp',
  whatsapp_group_manage: 'msg_whatsapp',
  whatsapp_delete_message: 'msg_whatsapp',
  whatsapp_forward: 'msg_whatsapp',
  whatsapp_disconnect: 'msg_whatsapp',

  // ── Messaging: Telegram (4) ──
  telegram_send: 'msg_telegram',
  telegram_send_media: 'msg_telegram',
  telegram_download_file: 'msg_telegram',
  telegram_get_me: 'msg_telegram',
  telegram_get_chat: 'msg_telegram',

  // ── Management (11) ──
  team_status: 'management',
  team_delegate_task: 'management',
  team_tasks: 'management',
  team_reassign_task: 'management',
  team_feedback: 'management',
  team_resolve_escalation: 'management',
  team_forward_escalation: 'management',
  team_org_chart: 'management',
  task_update: 'management',
  my_tasks: 'management',
  escalate: 'management',
};

// ─── Session Context Types ───────────────────────────────

export type SessionContext = 'meeting' | 'chat' | 'email' | 'task' | 'full' | 'whatsapp' | 'telegram';

// ─── Session Tool State ──────────────────────────────────
// Tracks what tools are loaded per session. Survives across sendMessage calls.

export interface SessionToolState {
  context: SessionContext;
  loadedSets: Set<ToolSet>;
  /** Tool instances cached for this session — avoids recreating */
  cachedTools: AnyAgentTool[] | null;
  /** All tools (unfiltered) for request_tools to pull from */
  allToolsRef: AnyAgentTool[] | null;
  /** Timestamp of last context change */
  lastContextChange: number;
  /** History of loaded sets for debugging */
  loadHistory: Array<{ sets: ToolSet[]; reason: string; time: number }>;
}

/** Global session tool state registry */
const sessionToolStates = new Map<string, SessionToolState>();

export function getSessionToolState(sessionId: string): SessionToolState | undefined {
  return sessionToolStates.get(sessionId);
}

export function clearSessionToolState(sessionId: string): void {
  sessionToolStates.delete(sessionId);
}

// ─── Context → Tier 2 Promotion Rules ───────────────────
// Which Tier 2 sets get auto-loaded for each context.
// Tier 1 is ALWAYS loaded. Tier 3 is NEVER auto-loaded (must be requested).

const _ALL_SETS = Object.keys(TIER_MAP) as ToolSet[];

// Tier 2 sets that are commonly needed — loaded for most contexts
const _COMMON_T2: ToolSet[] = ['local_filesystem', 'local_shell', 'browser', 'system', 'ent_knowledge'];

const CONTEXT_PROMOTIONS: Record<SessionContext, ToolSet[]> = {
  // Meeting: voice + lifecycle essential, plus common tools
  meeting: ['meeting_voice', 'meeting_lifecycle', ..._COMMON_T2],

  // Chat (webchat/generic): common tools only — rest loaded on demand via signals or request_tools
  chat: _COMMON_T2,

  // Messaging channels: load the relevant channel's tools + common tools
  // The agent's OWN channel tools are essential (Tier 1-like for that session)
  // Other channel tools and specialist tools load on demand
  whatsapp: ['msg_whatsapp', 'smtp_email', ..._COMMON_T2],
  telegram: ['msg_telegram', 'smtp_email', ..._COMMON_T2],
  email: ['agenticmail', 'gws_gmail', 'smtp_email', ..._COMMON_T2],

  // Task/full: broader set for agent-to-agent work
  task: ['agenticmail', ..._COMMON_T2],
  full: _ALL_SETS,
};

// ─── Conversation Signal Detection ───────────────────────
// Analyze user message to auto-promote tool sets mid-conversation.
// This prevents the agent from needing to call request_tools for obvious needs.

interface SignalRule {
  patterns: RegExp[];
  sets: ToolSet[];
}

const SIGNAL_RULES: SignalRule[] = [
  // Email mentions
  { patterns: [/\bemail\b/i, /\bgmail\b/i, /\binbox\b/i, /\bsend.*mail\b/i],
    sets: ['gws_gmail', 'smtp_email'] },
  // Calendar mentions
  { patterns: [/\bcalendar\b/i, /\bschedule\b/i, /\bmeeting.*upcoming\b/i, /\bevent\b/i, /\bfree.*busy\b/i],
    sets: ['gws_calendar'] },
  // Drive/docs
  { patterns: [/\bdrive\b/i, /\bdocument\b/i, /\bgoogle doc\b/i],
    sets: ['gws_drive', 'gws_docs'] },
  // Sheets
  { patterns: [/\bspreadsheet\b/i, /\bsheet\b/i, /\bcsv\b/i, /\bexcel\b/i],
    sets: ['gws_sheets'] },
  // Slides
  { patterns: [/\bslide\b/i, /\bpresentation\b/i, /\bpowerpoint\b/i],
    sets: ['gws_slides'] },
  // Forms
  { patterns: [/\bform\b/i, /\bsurvey\b/i, /\bquestionnaire\b/i],
    sets: ['gws_forms'] },
  // Maps
  { patterns: [/\bmap\b/i, /\bdirection\b/i, /\bplace\b/i, /\brestaurant\b/i, /\bnearby\b/i, /\bgeocode\b/i, /\bdistance\b/i],
    sets: ['gws_maps'] },
  // Meeting join — broad patterns to catch casual phrasing
  { patterns: [/\bjoin.*meeting\b/i, /\bmeeting.*join\b/i, /\bgoogle meet\b/i, /meet\.google\.com/i, /\bjoin.*call\b/i, /\bvideo.*call\b/i, /\bjoin.*meet\b/i, /\bjoin.*again\b/i, /\brejoin\b/i, /\bjoin back\b/i, /\bjoin the\b/i, /\bget.*in.*meeting\b/i],
    sets: ['meeting_lifecycle', 'meeting_voice'] },
  // Database
  { patterns: [/\bdatabase\b/i, /\bsql\b/i, /\bquery\b/i, /\bpostgres\b/i],
    sets: ['ent_database'] },
  // Security
  { patterns: [/\bsecurity\b/i, /\bscan.*secret\b/i, /\bpii\b/i, /\bcompliance\b/i],
    sets: ['ent_security'] },
  // PDF/docs
  { patterns: [/\bpdf\b/i, /\binvoice\b/i, /\bocr\b/i, /\bdocx\b/i],
    sets: ['ent_documents'] },
  // Code
  { patterns: [/\brun.*python\b/i, /\brun.*javascript\b/i, /\bcode.*sandbox\b/i, /\bregex\b/i],
    sets: ['ent_code'] },
  // Contacts
  { patterns: [/\bcontact\b/i, /\bphone.*number\b/i, /\bdirectory\b/i],
    sets: ['gws_contacts'] },
  // AgenticMail
  { patterns: [/\bagenticmail\b/i, /\bagent.*email\b/i],
    sets: ['agenticmail'] },
  // Knowledge base / hub
  { patterns: [/\bknowledge\s*base\b/i, /\bknowledge\s*hub\b/i, /\bfaq\b/i, /\bdocumentation\b/i, /\bwiki\b/i, /\bhow\s+do\s+(we|i)\b/i, /\bwhat.*(policy|process|procedure)\b/i, /\bcompany.*(guide|handbook)\b/i],
    sets: ['ent_knowledge'] },
  // WhatsApp (cross-channel)
  { patterns: [/\bwhatsapp\b/i, /\bsend.*whatsapp\b/i, /\bwa\s+message\b/i],
    sets: ['msg_whatsapp'] },
  // Telegram (cross-channel)
  { patterns: [/\btelegram\b/i, /\bsend.*telegram\b/i, /\btg\s+message\b/i],
    sets: ['msg_telegram'] },
  // Spreadsheet / CSV
  { patterns: [/\bcsv\b/i, /\bspreadsheet\b/i, /\btransform.*data\b/i, /\bpivot\b/i],
    sets: ['ent_spreadsheet'] },
  // Diff
  { patterns: [/\bdiff\b/i, /\bcompare.*files?\b/i, /\bwhat.*changed\b/i],
    sets: ['ent_diff'] },
  // Tasks (Google)
  { patterns: [/\bgoogle\s*tasks?\b/i, /\btask\s*list\b/i, /\btodo\b/i],
    sets: ['gws_tasks'] },
  // Visual memory
  { patterns: [/\bscreenshot\b/i, /\bcapture\b/i, /\bvision\b/i, /\bwhat.*see\b/i, /\blook\s*at\b/i],
    sets: ['visual_memory'] },
  // AgenticMail (broader)
  { patterns: [/\bsend.*email\b/i, /\bwrite.*email\b/i, /\bdraft\b/i, /\binbox\b/i, /\bcheck.*mail\b/i],
    sets: ['agenticmail'] },
  // Remotion Video
  { patterns: [/\bremotion\b/i, /\bcreate.*video\b/i, /\brender.*video\b/i, /\bvideo\s*project\b/i, /\bmarketing\s*video\b/i, /\bsocial\s*reel\b/i, /\banimation\b/i, /\bmotion\s*graphics?\b/i],
    sets: ['remotion_video'] },
];

/**
 * Detect tool sets needed based on conversation text.
 * Returns sets that should be promoted (may already be loaded).
 */
export function detectSignals(text: string): ToolSet[] {
  const needed = new Set<ToolSet>();
  for (const rule of SIGNAL_RULES) {
    if (rule.patterns.some(p => p.test(text))) {
      for (const s of rule.sets) needed.add(s);
    }
  }
  return [...needed];
}

// ─── Context Detection ───────────────────────────────────

export function detectSessionContext(opts: {
  systemPrompt?: string;
  isKeepAlive?: boolean;
  sessionKind?: string;
  explicitContext?: SessionContext | string;
}): SessionContext {
  if (opts.explicitContext && opts.explicitContext in CONTEXT_PROMOTIONS) return opts.explicitContext as SessionContext;
  if (opts.sessionKind === 'meeting') return 'meeting';
  if (opts.sessionKind === 'email') return 'email';
  if (opts.sessionKind === 'task') return 'task';

  const sp = opts.systemPrompt || '';
  if (opts.isKeepAlive && (sp.includes('MeetingMonitor') || sp.includes('meeting_speak'))) {
    return 'meeting';
  }
  if (sp.includes('[Email Handler]') || sp.includes('email triage')) return 'email';
  return 'chat';
}

// ─── Tool Filtering ──────────────────────────────────────

/**
 * Get the tool sets for a context: Tier 1 (always) + context promotions + additional.
 */
function resolveSetsForContext(
  context: SessionContext,
  additionalSets?: ToolSet[],
): Set<ToolSet> {
  const sets = new Set<ToolSet>();

  // Tier 1 — always loaded
  for (const [setName, tier] of Object.entries(TIER_MAP)) {
    if (tier === 1) sets.add(setName as ToolSet);
  }

  // Context promotions
  for (const s of CONTEXT_PROMOTIONS[context]) sets.add(s);

  // Explicit additions
  if (additionalSets) {
    for (const s of additionalSets) sets.add(s);
  }

  return sets;
}

/**
 * Filter tools based on active sets.
 */
export function filterToolsForContext(
  allTools: AnyAgentTool[],
  context: SessionContext,
  options?: { additionalSets?: ToolSet[]; sessionId?: string; userMessage?: string }
): AnyAgentTool[] {
  const activeSets = resolveSetsForContext(context, options?.additionalSets);

  // Auto-promote from user message signals
  if (options?.userMessage) {
    const signaled = detectSignals(options.userMessage);
    for (const s of signaled) activeSets.add(s);
  }

  // Restore previously loaded sets from session state
  const sessionId = options?.sessionId;
  if (sessionId) {
    const state = sessionToolStates.get(sessionId);
    if (state) {
      for (const s of state.loadedSets) activeSets.add(s);
    }
  }

  const filtered = allTools.filter(tool => {
    const set = TOOL_REGISTRY[tool.name];
    if (!set) return true; // Unregistered → always include
    return activeSets.has(set);
  });

  // Add request_tools meta-tool
  filtered.push(createRequestToolsTool(allTools, activeSets, context));

  // Update session state
  if (sessionId) {
    const existing = sessionToolStates.get(sessionId);
    if (existing) {
      existing.loadedSets = activeSets;
      existing.cachedTools = filtered;
      existing.allToolsRef = allTools;
      existing.context = context;
    } else {
      sessionToolStates.set(sessionId, {
        context,
        loadedSets: activeSets,
        cachedTools: filtered,
        allToolsRef: allTools,
        lastContextChange: Date.now(),
        loadHistory: [{ sets: [...activeSets], reason: `initial:${context}`, time: Date.now() }],
      });
    }
  }

  return filtered;
}

// ─── Context Transition ──────────────────────────────────
// When a keep-alive session changes context (e.g., chat → meeting),
// re-resolve tools while preserving any dynamically loaded sets.

export function transitionSessionContext(
  sessionId: string,
  newContext: SessionContext,
  allTools: AnyAgentTool[],
): AnyAgentTool[] | null {
  const state = sessionToolStates.get(sessionId);
  if (!state) return null;

  const oldContext = state.context;
  if (oldContext === newContext) return null; // No change

  console.log(`[tool-resolver] Session ${sessionId} transitioning: ${oldContext} → ${newContext}`);

  // Keep dynamically loaded sets (user explicitly requested them)
  const dynamicSets = new Set<ToolSet>();
  const baseSetsOld = resolveSetsForContext(oldContext);
  for (const s of state.loadedSets) {
    if (!baseSetsOld.has(s)) dynamicSets.add(s); // Was dynamically added
  }

  // Resolve new base + carry over dynamic
  const newSets = resolveSetsForContext(newContext);
  for (const s of dynamicSets) newSets.add(s);

  // Filter
  const filtered = allTools.filter(tool => {
    const set = TOOL_REGISTRY[tool.name];
    if (!set) return true;
    return newSets.has(set);
  });
  filtered.push(createRequestToolsTool(allTools, newSets, newContext));

  // Update state
  state.context = newContext;
  state.loadedSets = newSets;
  state.cachedTools = filtered;
  state.lastContextChange = Date.now();
  state.loadHistory.push({ sets: [...newSets], reason: `transition:${oldContext}→${newContext}`, time: Date.now() });

  console.log(`[tool-resolver] Transitioned ${sessionId}: ${filtered.length} tools (was ${state.cachedTools?.length || '?'})`);
  return filtered;
}

// ─── Request Tools Meta-Tool ─────────────────────────────

const SET_DESCRIPTIONS: Record<ToolSet, string> = {
  core: 'File I/O, search, bash (8 tools)',
  browser: 'Web browser automation (1 tool)',
  system: 'System capabilities check (1 tool)',
  memory: 'Agent memory — store/search/reflect (4 tools)',
  visual_memory: 'Vision capture, OCR, visual comparison (10 tools)',
  meeting_voice: 'In-meeting voice + chat (4 tools)',
  meeting_lifecycle: 'Join/schedule/manage meetings (8 tools)',
  gws_chat: 'Google Chat messaging (14 tools)',
  smtp_email: 'Email via SMTP/IMAP — send, read, search, manage (10 tools)',
  gws_gmail: 'Gmail read/send/search (15 tools)',
  gws_calendar: 'Google Calendar events (6 tools)',
  gws_drive: 'Google Drive files (7 tools)',
  gws_docs: 'Google Docs read/write (3 tools)',
  gws_sheets: 'Google Sheets read/write (7 tools)',
  gws_contacts: 'Google Contacts (5 tools)',
  gws_slides: 'Google Slides presentations (12 tools)',
  gws_forms: 'Google Forms surveys (8 tools)',
  gws_tasks: 'Google Tasks (7 tools)',
  gws_maps: 'Google Maps + Places (10 tools)',
  ent_database: 'SQL database tools (6 tools)',
  ent_spreadsheet: 'CSV/spreadsheet processing (8 tools)',
  ent_documents: 'PDF/DOCX generation, OCR, invoices (8 tools)',
  ent_http: 'HTTP requests, GraphQL (4 tools)',
  ent_security: 'Security scanning — secrets, PII, deps (6 tools)',
  ent_code: 'Code sandbox — JS, Python, shell (5 tools)',
  ent_diff: 'Text/JSON/spreadsheet diffs (4 tools)',
  ent_knowledge: 'Knowledge base + hub search (3 tools)',
  agenticmail: 'Full email management (40 tools)',
  local_filesystem: 'File read/write/edit/move/delete/search (7 tools)',
  local_shell: 'Shell exec, PTY sessions, sudo, package install, dependency management (11 tools)',
  msg_whatsapp: 'WhatsApp messaging, media, groups (16 tools)',
  msg_telegram: 'Telegram messaging, media, and file download (5 tools)',
  management: 'Team management — delegate tasks, escalate, org chart (10 tools)',
  mcp_bridge: 'MCP integration adapters',
  filesystem: 'File system tools (alias)',
  web: 'Web tools (alias)',
};

function createRequestToolsTool(
  allTools: AnyAgentTool[],
  activeSets: Set<ToolSet>,
  _context: SessionContext,
): AnyAgentTool {
  const loadedSets = new Set<ToolSet>(activeSets);
  // Only show sets that have actual tools available (e.g., don't show gws_gmail if no OAuth)
  const availableSetsInAllTools = new Set<ToolSet>();
  for (const tool of allTools) {
    const set = TOOL_REGISTRY[tool.name];
    if (set) availableSetsInAllTools.add(set);
  }
  const allSets = (Object.keys(SET_DESCRIPTIONS) as ToolSet[]).filter(s => availableSetsInAllTools.has(s));
  const notLoaded = allSets.filter(s => !loadedSets.has(s));

  // Compact description — only list what's NOT loaded to save tokens
  const description = notLoaded.length > 0
    ? `Load more tools into this session. Available: ${notLoaded.map(s => `${s} (${SET_DESCRIPTIONS[s]})`).join('; ')}.`
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
          description: 'Tool sets to load',
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
        _dynamicTools: newTools,
      };
    },
  } as AnyAgentTool;
}

// ─── Main Entry Points ───────────────────────────────────

/**
 * Create tools for a session context with lazy loading.
 * Drop-in replacement for createAllTools — context-aware + session-stateful.
 */
export async function createToolsForContext(
  options: AllToolsOptions,
  context: SessionContext,
  opts?: { additionalSets?: ToolSet[]; sessionId?: string; userMessage?: string },
): Promise<AnyAgentTool[]> {
  const { createAllTools } = await import('./index.js');

  if (context === 'full') {
    return createAllTools(options);
  }

  const allTools = await createAllTools(options);
  return filterToolsForContext(allTools, context, {
    additionalSets: opts?.additionalSets,
    sessionId: opts?.sessionId,
    userMessage: opts?.userMessage,
  });
}

/**
 * Get tools for a session, using cached state if available.
 * This is the preferred entry point for sendMessage — reuses existing tool state.
 */
export async function getToolsForSession(
  sessionId: string,
  options: AllToolsOptions,
  opts?: { context?: SessionContext; userMessage?: string },
): Promise<AnyAgentTool[]> {
  const state = sessionToolStates.get(sessionId);

  if (state?.cachedTools && state.allToolsRef) {
    // Session has existing tool state — check if user message signals new sets
    if (opts?.userMessage) {
      const signaled = detectSignals(opts.userMessage);
      const newSignals = signaled.filter(s => !state.loadedSets.has(s));

      if (newSignals.length > 0) {
        // Auto-promote: add signaled sets without agent needing to call request_tools
        for (const s of newSignals) state.loadedSets.add(s);
        state.loadHistory.push({ sets: newSignals, reason: `signal:${newSignals.join(',')}`, time: Date.now() });
        console.log(`[tool-resolver] Auto-promoted sets for ${sessionId}: ${newSignals.join(', ')}`);

        // Re-filter with expanded sets
        const filtered = state.allToolsRef.filter(tool => {
          const set = TOOL_REGISTRY[tool.name];
          if (!set) return true;
          return state.loadedSets.has(set);
        });
        filtered.push(createRequestToolsTool(state.allToolsRef, state.loadedSets, state.context));
        state.cachedTools = filtered;
        return filtered;
      }
    }

    // Context transition check
    if (opts?.context && opts.context !== state.context) {
      const transitioned = transitionSessionContext(sessionId, opts.context, state.allToolsRef);
      if (transitioned) return transitioned;
    }

    return state.cachedTools;
  }

  // No cached state — create fresh
  const context = opts?.context || state?.context || 'chat';
  return createToolsForContext(options, context, {
    sessionId,
    userMessage: opts?.userMessage,
  });
}

// ─── Diagnostics ─────────────────────────────────────────

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

export function validateToolRegistry(allTools: AnyAgentTool[]): {
  registered: number;
  unregistered: string[];
  registryOrphans: string[];
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

/**
 * Get all session tool states for diagnostics.
 */
export function getAllSessionToolStates(): Map<string, { context: SessionContext; toolCount: number; loadedSets: string[]; history: any[] }> {
  const result = new Map<string, any>();
  for (const [id, state] of sessionToolStates) {
    result.set(id, {
      context: state.context,
      toolCount: state.cachedTools?.length || 0,
      loadedSets: [...state.loadedSets],
      history: state.loadHistory,
    });
  }
  return result;
}
