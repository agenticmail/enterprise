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
  | 'smtp_email'
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
  | 'web'
  // Polymarket Trading
  | 'polymarket'
  | 'polymarket_quant'
  | 'polymarket_onchain'
  | 'polymarket_social'
  | 'polymarket_feeds'
  | 'polymarket_analytics'
  | 'polymarket_execution'
  | 'polymarket_counterintel'
  | 'polymarket_portfolio'
  | 'polymarket_watcher'
  | 'polymarket_pipeline'
  // Database Access (external DBs)
  | 'db_access'
  // Coding
  | 'coding'
  // Agent Control
  | 'agent_control';

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
  browser: 3,        // on-demand — most agents rarely browse
  system: 2,
  visual_memory: 3,  // on-demand
  meeting_voice: 2,
  meeting_lifecycle: 2,
  gws_gmail: 3,      // on-demand — loaded by email context or signal detection
  gws_calendar: 3,   // on-demand
  gws_drive: 3,      // on-demand
  gws_docs: 3,       // on-demand
  gws_tasks: 3,      // on-demand
  gws_contacts: 3,   // on-demand
  agenticmail: 2,
  ent_http: 3,       // on-demand

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
  local_filesystem: 3,  // on-demand — loaded by signal detection
  local_shell: 3,       // on-demand — loaded by signal detection
  management: 1,      // always loaded — agent must know its position
  msg_whatsapp: 2,
  msg_telegram: 2,
  mcp_bridge: 3,
  filesystem: 3,       // on-demand
  web: 2,
  smtp_email: 3,       // on-demand — loaded by email context or signal
  polymarket: 2,            // Core trading (20 tools) — always loaded for polymarket agents
  polymarket_watcher: 2,     // Watcher system — always loaded (session start protocol)
  polymarket_execution: 3,   // Execution specialist — on-demand (batch orders, history, export)
  polymarket_quant: 3,       // Specialist — on-demand (Kelly, Monte Carlo, Bayesian, etc.)
  polymarket_onchain: 3,     // Specialist — on-demand (whale tracking, orderbook, flows)
  polymarket_social: 3,      // Specialist — on-demand (Twitter, Reddit, Telegram sentiment)
  polymarket_feeds: 3,       // Specialist — on-demand (calendar, news, odds, resolution)
  polymarket_analytics: 3,   // Specialist — on-demand (correlation, arbitrage, regime)
  polymarket_counterintel: 3, // Specialist — on-demand (manipulation, resolution risk)
  polymarket_portfolio: 3,   // Specialist — on-demand (optimization, drawdown, P&L)
  polymarket_pipeline: 3,    // Specialist — on-demand (full/quick analysis, batch screen)
  db_access: 3,
  coding: 3,           // on-demand
  agent_control: 2,
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

  // ── Polymarket Core (20) — essential for every trading session ──
  poly_get_balance: 'polymarket',
  poly_get_positions: 'polymarket',
  poly_search_markets: 'polymarket',
  poly_scan_opportunities: 'polymarket',
  poly_get_market: 'polymarket',
  poly_get_prices: 'polymarket',
  poly_place_order: 'polymarket',
  poly_cancel_order: 'polymarket',
  poly_get_open_orders: 'polymarket',
  poly_set_config: 'polymarket',
  poly_get_config: 'polymarket',
  poly_set_alert: 'polymarket',
  poly_list_alerts: 'polymarket',
  poly_screen_markets: 'polymarket',
  poly_record_prediction: 'polymarket',
  poly_recall_lessons: 'polymarket',
  poly_goals: 'polymarket',
  poly_record_lesson: 'polymarket',
  poly_circuit_breaker: 'polymarket',
  poly_pending_trades: 'polymarket',
  poly_approve_trade: 'polymarket',

  // ── Polymarket Market Data (core — essential for trade decisions) ──
  poly_get_event: 'polymarket',
  poly_get_orderbook: 'polymarket',
  poly_get_trades: 'polymarket',
  poly_price_history: 'polymarket',
  poly_trending_markets: 'polymarket',
  poly_analyze_market: 'polymarket',
  poly_compare_markets: 'polymarket',
  poly_estimate_fill: 'polymarket',
  poly_estimate_price: 'polymarket',
  poly_related_markets: 'polymarket',
  // ── Polymarket Research (on-demand — social, leaderboard, news) ──
  poly_market_comments: 'polymarket_feeds',
  poly_market_news: 'polymarket_feeds',
  poly_leaderboard: 'polymarket_feeds',
  poly_top_holders: 'polymarket_feeds',

  // ── Polymarket Wallet Status (core — agent needs balance/status checks) ──
  poly_wallet_status: 'polymarket',
  poly_api_status: 'polymarket',
  poly_redeem: 'polymarket',
  // ── Polymarket Wallet Admin (on-demand — user handles setup/funding via dashboard) ──
  poly_set_allowances: 'polymarket_portfolio',
  poly_deposit: 'polymarket_portfolio',
  poly_swap_to_usdce: 'polymarket_portfolio',
  poly_withdraw: 'polymarket_portfolio',
  poly_gas_price: 'polymarket_portfolio',
  poly_transfer_funds: 'polymarket_portfolio',

  // ── Polymarket Order Management (core — essential for active trading) ──
  poly_get_order: 'polymarket',
  poly_cancel_orders: 'polymarket',
  poly_cancel_all: 'polymarket',
  poly_replace_order: 'polymarket',
  poly_trade_history: 'polymarket',
  poly_auto_approve_rule: 'polymarket',
  poly_reject_trade: 'polymarket',
  poly_get_closed_positions: 'polymarket',
  poly_delete_alert: 'polymarket',
  // ── Polymarket Execution Specialist (on-demand — batch, export) ──
  poly_place_batch_orders: 'polymarket_execution',
  poly_export_trades: 'polymarket_execution',

  // ── Polymarket Learning (on-demand — review, calibration, paper trading) ──
  poly_resolve_prediction: 'polymarket_analytics',
  poly_trade_review: 'polymarket_analytics',
  poly_calibration: 'polymarket_analytics',
  poly_strategy_performance: 'polymarket_analytics',
  poly_unresolved_predictions: 'polymarket_analytics',
  poly_paper_trade: 'polymarket_analytics',
  poly_paper_portfolio: 'polymarket_analytics',
  poly_portfolio_summary: 'polymarket_analytics',
  poly_track_wallet: 'polymarket_onchain',
  poly_heartbeat: 'polymarket_pipeline',

  // ── Polymarket Quant (14) ──
  poly_kelly_criterion: 'polymarket_quant',
  poly_binary_pricing: 'polymarket_quant',
  poly_bayesian_update: 'polymarket_quant',
  poly_monte_carlo: 'polymarket_quant',
  poly_technical_indicators: 'polymarket_quant',
  poly_volatility: 'polymarket_quant',
  poly_stat_arb: 'polymarket_quant',
  poly_value_at_risk: 'polymarket_quant',
  poly_entropy: 'polymarket_quant',
  poly_news_feed: 'polymarket_quant',
  poly_sentiment_analysis: 'polymarket_quant',
  poly_generate_signal: 'polymarket_quant',
  poly_correlation_matrix: 'polymarket_quant',
  poly_efficiency_test: 'polymarket_quant',

  // ── Polymarket On-Chain (6) ──
  poly_whale_tracker: 'polymarket_onchain',
  poly_orderbook_depth: 'polymarket_onchain',
  poly_onchain_flow: 'polymarket_onchain',
  poly_wallet_profiler: 'polymarket_onchain',
  poly_liquidity_map: 'polymarket_onchain',
  poly_transaction_decoder: 'polymarket_onchain',

  // ── Polymarket Social (5) ──
  poly_twitter_sentiment: 'polymarket_social',
  poly_polymarket_comments: 'polymarket_social',
  poly_reddit_pulse: 'polymarket_social',
  poly_telegram_monitor: 'polymarket_social',
  poly_social_velocity: 'polymarket_social',

  // ── Polymarket Feeds (5) ──
  poly_calendar_events: 'polymarket_feeds',
  poly_official_sources: 'polymarket_feeds',
  poly_odds_aggregator: 'polymarket_feeds',
  poly_resolution_tracker: 'polymarket_feeds',
  poly_breaking_news: 'polymarket_feeds',

  // ── Polymarket Analytics (5) ──
  poly_market_correlation: 'polymarket_analytics',
  poly_arbitrage_scanner: 'polymarket_analytics',
  poly_regime_detector: 'polymarket_analytics',
  poly_smart_money_index: 'polymarket_analytics',
  poly_market_microstructure: 'polymarket_analytics',

  // ── Polymarket Execution (4) ──
  poly_sniper: 'polymarket_execution',
  poly_scale_in: 'polymarket_execution',
  poly_hedge: 'polymarket_execution',
  poly_exit_strategy: 'polymarket_execution',

  // ── Polymarket Counter-Intel (3) ──
  poly_manipulation_detector: 'polymarket_counterintel',
  poly_resolution_risk: 'polymarket_counterintel',
  poly_counterparty_analysis: 'polymarket_counterintel',

  // ── Polymarket Portfolio (3) ──
  poly_portfolio_optimizer: 'polymarket_portfolio',
  poly_drawdown_monitor: 'polymarket_portfolio',
  poly_pnl_attribution: 'polymarket_portfolio',
  poly_watcher: 'polymarket_watcher',
  poly_watcher_config: 'polymarket_watcher',
  poly_watcher_events: 'polymarket_watcher',
  poly_setup_monitors: 'polymarket_watcher',

  // ── Polymarket Pipeline (4) ──
  poly_full_analysis: 'polymarket_pipeline',
  poly_quick_analysis: 'polymarket_pipeline',
  poly_batch_screen: 'polymarket_pipeline',
  poly_portfolio_review: 'polymarket_pipeline',

  // ── Polymarket Optimizer (6) ──
  poly_daily_scorecard: 'polymarket',
  poly_momentum_scanner: 'polymarket',
  poly_quick_edge: 'polymarket',
  poly_position_heatmap: 'polymarket',
  poly_profit_lock: 'polymarket',
  poly_capital_recycler: 'polymarket',

  // ── Polymarket Bracket Orders (2) ──
  poly_bracket_config: 'polymarket_execution',
  poly_list_brackets: 'polymarket_execution',

  // ── Database Access (external DBs via DatabaseConnectionManager) (4) ──
  db_list_connections: 'db_access',
  db_query: 'db_access',
  db_describe_table: 'db_access',
  db_list_tables: 'db_access',

  // ── Google Drive Download (1) ──
  google_drive_download: 'gws_drive',

  // ── Coding (10) ──
  code_plan: 'coding',
  code_search: 'coding',
  code_read: 'coding',
  code_multi_edit: 'coding',
  code_build: 'coding',
  code_test: 'coding',
  code_git: 'coding',
  code_create: 'coding',
  code_diff: 'coding',
  code_pm2: 'coding',

  // ── Agent Control (1) ──
  agent_stop: 'agent_control',
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
// Kept minimal: specialist tools load on-demand via request_tools or signal detection
const _COMMON_T2: ToolSet[] = ['system', 'ent_knowledge'];

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
  email: ['agenticmail', 'gws_gmail', 'smtp_email', 'gws_calendar', 'gws_contacts', ..._COMMON_T2],

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
  // Browser + visual memory (auto-promote visual memory with browser for persistent visual recall)
  { patterns: [/\bbrows/i, /\bwebsite\b/i, /\bopen.*url\b/i, /\bvisit.*page\b/i, /\bnavigate\b/i, /\bscrape\b/i, /\bscreenshot\b/i, /polymarket\.com/i],
    sets: ['browser', 'visual_memory'] },
  // Filesystem & shell
  { patterns: [/\bfile\b/i, /\bread.*file\b/i, /\bwrite.*file\b/i, /\bdirectory\b/i, /\bfolder\b/i, /\bdownload\b/i, /\bupload\b/i],
    sets: ['local_filesystem'] },
  { patterns: [/\brun.*command\b/i, /\bbash\b/i, /\bterminal\b/i, /\bshell\b/i, /\bexecute\b/i, /\binstall\b/i, /\bnpm\b/i, /\bpip\b/i],
    sets: ['local_shell'] },
  // HTTP / API
  { patterns: [/\bhttp\b/i, /\bapi\b/i, /\bfetch\b/i, /\bcurl\b/i, /\bwebhook\b/i, /\bendpoint\b/i],
    sets: ['ent_http'] },
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
  // Polymarket — core trading
  { patterns: [/\bpolymarket\b/i, /\bprediction\s*market\b/i, /\btrad(e|ing)\b/i, /\bmarket\s*odds\b/i, /\bbet\b/i, /\bwager\b/i, /\bposition\b/i, /\bportfolio\b/i],
    sets: ['polymarket'] },
  // Polymarket — quant (specialist, Tier 3)
  { patterns: [/\bkelly\b/i, /\bmonte\s*carlo\b/i, /\bblack.scholes\b/i, /\bbayesian\b/i, /\bvolatility\b/i, /\bvalue.at.risk\b/i, /\bsignal\s*generat/i, /\bquant\b/i, /\bposition\s*siz/i, /\boptimal\s*size/i, /\bentropy\b/i, /\bstat\s*arb\b/i, /\bcorrelation\s*matrix\b/i, /\btechnical\s*indicator/i, /\befficiency\s*test/i],
    sets: ['polymarket_quant'] },
  // Polymarket — on-chain (specialist, Tier 3)
  { patterns: [/\bwhale\b/i, /\bon.chain\b/i, /\borderbook\b/i, /\bliquidity\s*map\b/i, /\bwallet.*track\b/i, /\bwallet.*profil/i, /\btransaction\s*decod/i, /\bflow\s*analys/i, /\borderbook\s*depth\b/i],
    sets: ['polymarket_onchain'] },
  // Polymarket — social intel (specialist, Tier 3)
  { patterns: [/\bsentiment\b/i, /\btwitter\b/i, /\breddit\b/i, /\bsocial.*signal\b/i, /\btelegram.*monitor\b/i, /\bsocial\s*velocity\b/i, /\breddit\s*pulse\b/i],
    sets: ['polymarket_social'] },
  // Polymarket — feeds (specialist, Tier 3 — market data, history, events, leaderboard)
  { patterns: [/\bcalendar\s*event/i, /\bofficial\s*source/i, /\bodds\s*aggregat/i, /\bresolution\s*track/i, /\bbreaking\s*news\b/i, /\bnews\s*feed\b/i, /\bupcoming\s*event/i, /\bprice\s*history\b/i, /\bhistoric/i, /\btrending\b/i, /\bleaderboard\b/i, /\btop\s*holder/i, /\bmarket\s*comment/i, /\brelated\s*market/i, /\bcompare\s*market/i, /\bfill\s*estimat/i, /\bget_event\b/i, /\bget_trades\b/i, /\borderbook\b/i],
    sets: ['polymarket_feeds'] },
  // Polymarket — analytics (specialist, Tier 3 — calibration, strategy, paper trading)
  { patterns: [/\bcorrelat/i, /\barbitrage\b/i, /\bregime\s*detect/i, /\bsmart\s*money\b/i, /\bmicrostructure\b/i, /\bslippage\b/i, /\bcalibrat/i, /\bstrategy\s*perf/i, /\bpaper\s*trad/i, /\btrade\s*review/i, /\bclosed\s*position/i, /\bportfolio\s*summary/i, /\bunresolved/i],
    sets: ['polymarket_analytics'] },
  // Polymarket — counterintel (specialist, Tier 3)
  { patterns: [/\bmanipulat/i, /\bresolution\s*risk\b/i, /\bcounterparty\b/i, /\bwash\s*trad/i],
    sets: ['polymarket_counterintel'] },
  // Polymarket — portfolio (specialist, Tier 3 — wallet, funding, transfers, setup)
  { patterns: [/\bdrawdown\b/i, /\bpnl\b/i, /\bp&l\b/i, /\battribution\b/i, /\bportfolio\s*optim/i, /\brebalance\b/i, /\bwallet\b/i, /\bdeposit\b/i, /\bwithdraw\b/i, /\btransfer\b/i, /\bswap\b/i, /\ballowance\b/i, /\bsetup\s*wallet\b/i, /\bgas\s*price\b/i, /\bredeem\b/i, /\bcreate\s*account\b/i],
    sets: ['polymarket_portfolio'] },
  // Polymarket — pipeline (specialist, Tier 3)
  { patterns: [/\bfull\s*analysis\b/i, /\bquick\s*analysis\b/i, /\bbatch\s*screen/i, /\bportfolio\s*review\b/i],
    sets: ['polymarket_pipeline'] },
  // Polymarket — execution (Tier 3, on-demand — batch, export, sniper, scale-in, hedge)
  { patterns: [/\bsniper\b/i, /\bscale.in\b/i, /\bhedge\b/i, /\bexit.*strateg\b/i, /\btwap\b/i, /\bvwap\b/i, /\bbracket\b/i, /\bbatch\s*order/i, /\bexport\s*trade/i, /\btrade\s*history\b/i, /\bcancel\s*all\b/i, /\breplace\s*order/i],
    sets: ['polymarket_execution'] },
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
// Map skill names (from agent config) to tool sets
const SKILL_TO_TOOLSET: Record<string, ToolSet[]> = {
  'polymarket': ['polymarket'],
  'polymarket-quant': ['polymarket_quant'],
  'polymarket-onchain': ['polymarket_onchain'],
  'polymarket-social': ['polymarket_social'],
  'polymarket-feeds': ['polymarket_feeds'],
  'polymarket-analytics': ['polymarket_analytics'],
  'polymarket-execution': ['polymarket_execution'],
  'polymarket-counterintel': ['polymarket_counterintel'],
  'polymarket-portfolio': ['polymarket_portfolio'],
  'polymarket-watcher': ['polymarket_watcher'],
  'polymarket-pipeline': ['polymarket_pipeline'],
};

export function filterToolsForContext(
  allTools: AnyAgentTool[],
  context: SessionContext,
  options?: { additionalSets?: ToolSet[]; sessionId?: string; userMessage?: string; agentSkills?: string[] }
): AnyAgentTool[] {
  const activeSets = resolveSetsForContext(context, options?.additionalSets);

  // Auto-promote tool sets based on agent's assigned skills (Tier 1 & 2 only)
  // Tier 3 specialist sets are loaded on-demand via request_tools or signal detection
  if (options?.agentSkills) {
    for (const skill of options.agentSkills) {
      const sets = SKILL_TO_TOOLSET[skill];
      if (sets) {
        for (const s of sets) {
          const tier = TIER_MAP[s];
          if (tier !== undefined && tier <= 2) activeSets.add(s);
        }
      }
    }
  }

  // Auto-promote from user message signals
  // Gate: polymarket signals only apply if agent has polymarket skills assigned
  if (options?.userMessage) {
    const hasPolySkill = options?.agentSkills?.some((s: string) => s.startsWith('polymarket'));
    const signaled = detectSignals(options.userMessage);
    for (const s of signaled) {
      // Skip polymarket tool sets for agents without polymarket skills
      if (!hasPolySkill && (s === 'polymarket' || s.startsWith('polymarket_'))) continue;
      activeSets.add(s);
    }
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
  filtered.push(createRequestToolsTool(allTools, activeSets, context, options?.agentSkills));

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
  remotion_video: 'Create videos programmatically — Remotion React framework (9 tools)',
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
  polymarket: 'Polymarket trading — markets, orders, wallet, orderbook, analysis, config, predictions',
  polymarket_quant: 'Quant engine — Kelly, Black-Scholes, Bayesian, Monte Carlo, signals (14 tools)',
  polymarket_onchain: 'On-chain intelligence — whales, orderbook, flows, liquidity (6 tools)',
  polymarket_social: 'Social intelligence — Twitter, Reddit, Telegram sentiment (5 tools)',
  polymarket_feeds: 'Research — comments, news, leaderboard, top holders (4 tools)',
  polymarket_analytics: 'Analytics — calibration, paper trading, strategy review, portfolio summary (8 tools)',
  polymarket_execution: 'Execution specialist — batch orders, trade export (2 tools)',
  polymarket_counterintel: 'Counter-intelligence — manipulation, resolution risk (3 tools)',
  polymarket_portfolio: 'Portfolio management — optimization, drawdown, P&L attribution, fund transfers (4 tools)',
  polymarket_watcher: 'AI-powered market surveillance — monitors, alerts, signals (4 tools)',
  polymarket_pipeline: 'Unified analysis pipeline — full/quick analysis, batch screening, portfolio review (4 tools)',
  db_access: 'External database access — query, describe, list tables (4 tools)',
  coding: 'Code editing — plan, search, read, edit, build, test, git (10 tools)',
  agent_control: 'Agent lifecycle — stop running sessions (1 tool)',
};

function createRequestToolsTool(
  allTools: AnyAgentTool[],
  activeSets: Set<ToolSet>,
  _context: SessionContext,
  agentSkills?: string[],
): AnyAgentTool {
  const loadedSets = new Set<ToolSet>(activeSets);
  // Only show sets that have actual tools available (e.g., don't show gws_gmail if no OAuth)
  const availableSetsInAllTools = new Set<ToolSet>();
  for (const tool of allTools) {
    const set = TOOL_REGISTRY[tool.name];
    if (set) availableSetsInAllTools.add(set);
  }
  const hasPolySkillForFilter = agentSkills?.some((s: string) => s.startsWith('polymarket'));
  const allSets = (Object.keys(SET_DESCRIPTIONS) as ToolSet[]).filter(s => {
    if (!availableSetsInAllTools.has(s)) return false;
    // Hide polymarket sets from agents without polymarket skills
    if (!hasPolySkillForFilter && (s === 'polymarket' || s.startsWith('polymarket_'))) return false;
    return true;
  });
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
      // Gate: agents without polymarket skills cannot load polymarket tool sets
      const hasPolySkill = agentSkills?.some((s: string) => s.startsWith('polymarket'));
      const newSets = requested.filter(s => {
        if (!loadedSets.has(s) && SET_DESCRIPTIONS[s]) {
          if (!hasPolySkill && (s === 'polymarket' || s.startsWith('polymarket_'))) return false;
          return true;
        }
        return false;
      });

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
  opts?: { additionalSets?: ToolSet[]; sessionId?: string; userMessage?: string; agentSkills?: string[] },
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
    agentSkills: opts?.agentSkills,
  });
}

/**
 * Get tools for a session, using cached state if available.
 * This is the preferred entry point for sendMessage — reuses existing tool state.
 */
export async function getToolsForSession(
  sessionId: string,
  options: AllToolsOptions,
  opts?: { context?: SessionContext; userMessage?: string; agentSkills?: string[] },
): Promise<AnyAgentTool[]> {
  const state = sessionToolStates.get(sessionId);

  if (state?.cachedTools && state.allToolsRef) {
    // Session has existing tool state — check if user message signals new sets
    if (opts?.userMessage) {
      const hasPolySkill = opts?.agentSkills?.some((s: string) => s.startsWith('polymarket'));
      const signaled = detectSignals(opts.userMessage);
      const newSignals = signaled.filter(s => {
        if (state.loadedSets.has(s)) return false;
        // Gate: polymarket signals only for agents with polymarket skills
        if (!hasPolySkill && (s === 'polymarket' || s.startsWith('polymarket_'))) return false;
        return true;
      });

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
        filtered.push(createRequestToolsTool(state.allToolsRef, state.loadedSets, state.context, opts?.agentSkills));
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
    agentSkills: opts?.agentSkills,
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
