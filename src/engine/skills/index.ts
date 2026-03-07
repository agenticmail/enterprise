/**
 * Skills Barrel — Individual M365 & Google Workspace skill files
 *
 * Each app has its own file exporting SKILL_DEF + TOOLS.
 * This barrel collects them into combined arrays for the main skills.ts and tool-catalog.ts.
 */

// ─── Microsoft 365 ──────────────────────────────────────

import * as M365Outlook from './m365-outlook.js';
import * as M365Teams from './m365-teams.js';
import * as M365SharePoint from './m365-sharepoint.js';
import * as M365OneDrive from './m365-onedrive.js';
import * as M365Word from './m365-word.js';
import * as M365Excel from './m365-excel.js';
import * as M365PowerPoint from './m365-powerpoint.js';
import * as M365OneNote from './m365-onenote.js';
import * as M365Planner from './m365-planner.js';
import * as M365PowerBI from './m365-power-bi.js';
import * as M365PowerAutomate from './m365-power-automate.js';
import * as M365Forms from './m365-forms.js';
import * as M365ToDo from './m365-todo.js';
import * as M365Bookings from './m365-bookings.js';
import * as M365Whiteboard from './m365-whiteboard.js';
import * as M365Admin from './m365-admin.js';
import * as M365Copilot from './m365-copilot.js';

// ─── Google Workspace ───────────────────────────────────

import * as GwsGmail from './gws-gmail.js';
import * as GwsCalendar from './gws-calendar.js';
import * as GwsDrive from './gws-drive.js';
import * as GwsDocs from './gws-docs.js';
import * as GwsSheets from './gws-sheets.js';
import * as GwsSlides from './gws-slides.js';
import * as GwsMeet from './gws-meet.js';
import * as GwsChat from './gws-chat.js';
import * as GwsForms from './gws-forms.js';
import * as GwsSites from './gws-sites.js';
import * as GwsKeep from './gws-keep.js';
import * as GwsAdmin from './gws-admin.js';
import * as GwsVault from './gws-vault.js';
import * as GwsGroups from './gws-groups.js';
import * as GwsMaps from './gws-maps.js';
import * as GwsContacts from './gws-contacts.js';
import * as GwsTasks from './gws-tasks.js';

// ─── Generic SMTP/IMAP Email ────────────────────────────

import * as SmtpEmail from './smtp-email.js';

// ─── Core + System Skills ───────────────────────────────

import * as CoreTools from './core-tools.js';
import * as MeetingLifecycle from './meeting-lifecycle.js';
import * as AgentMemory from './agent-memory.js';
import * as VisualMemory from './visual-memory.js';
import * as KnowledgeSearch from './knowledge-search.js';

// ─── Messaging + Local System Skills ────────────────────

import { MESSAGING_SKILLS } from './messaging.js';
import { LOCAL_SYSTEM_SKILLS } from './local-system.js';
import { MCP_BRIDGE_SKILL } from './mcp-bridge.js';
import { agentManagementSkill } from './agent-management.js';

// ─── All M365 modules ───────────────────────────────────

export const M365_MODULES = [
  M365Outlook, M365Teams, M365SharePoint, M365OneDrive,
  M365Word, M365Excel, M365PowerPoint, M365OneNote,
  M365Planner, M365PowerBI, M365PowerAutomate, M365Forms,
  M365ToDo, M365Bookings, M365Whiteboard, M365Admin, M365Copilot,
] as const;

// ─── All GWS modules ────────────────────────────────────

export const GWS_MODULES = [
  GwsGmail, GwsCalendar, GwsDrive, GwsDocs,
  GwsSheets, GwsSlides, GwsMeet, GwsChat,
  GwsForms, GwsSites, GwsKeep, GwsAdmin,
  GwsVault, GwsGroups, GwsMaps, GwsContacts, GwsTasks,
] as const;

// ─── Combined skill definitions (for BUILTIN_SKILLS) ────

export const M365_SKILL_DEFS = M365_MODULES.map(m => m.SKILL_DEF);
export const GWS_SKILL_DEFS = GWS_MODULES.map(m => m.SKILL_DEF);

// ─── Combined tool definitions (for tool-catalog.ts) ────

import type { ToolDefinition } from '../skills.js';

export const M365_TOOLS: ToolDefinition[] = M365_MODULES.flatMap(m => m.TOOLS);
export const GWS_TOOLS: ToolDefinition[] = GWS_MODULES.flatMap(m => m.TOOLS);

// ─── AgenticMail (Company Core Product) ─────────────────

import * as AgenticMail from './agenticmail.js';

export const AGENTICMAIL_MODULES = [AgenticMail] as const;
export const AGENTICMAIL_SKILL_DEFS = AGENTICMAIL_MODULES.map(m => m.SKILL_DEF);
export const AGENTICMAIL_TOOLS: ToolDefinition[] = AGENTICMAIL_MODULES.flatMap(m => m.TOOLS);

// ─── Enterprise Utility Skills ─────────────────────────

import * as EntDatabase from './enterprise-database.js';
import * as DatabaseAccess from './database-access.js';
import * as EntSpreadsheet from './enterprise-spreadsheet.js';
import * as EntDocuments from './enterprise-documents.js';
import * as RemotionVideo from './remotion-video.js';
import * as EntHttp from './enterprise-http.js';
import * as EntSecurityScan from './enterprise-security-scan.js';
import * as EntCodeSandbox from './enterprise-code-sandbox.js';
import * as EntDiff from './enterprise-diff.js';
import * as Polymarket from './polymarket.js';
import * as PolymarketQuant from './polymarket-quant.js';
import * as PolymarketOnchain from './polymarket-onchain.js';
import * as PolymarketSocial from './polymarket-social.js';
import * as PolymarketFeeds from './polymarket-feeds.js';
import * as PolymarketAnalytics from './polymarket-analytics.js';
import * as PolymarketExecution from './polymarket-execution.js';
import * as PolymarketCounterintel from './polymarket-counterintel.js';
import * as PolymarketPortfolio from './polymarket-portfolio.js';

export const ENTERPRISE_MODULES = [
  EntDatabase, DatabaseAccess, EntSpreadsheet, EntDocuments, EntHttp,
  EntSecurityScan, EntCodeSandbox, EntDiff, RemotionVideo,
  Polymarket, PolymarketQuant, PolymarketOnchain, PolymarketSocial,
  PolymarketFeeds, PolymarketAnalytics, PolymarketExecution,
  PolymarketCounterintel, PolymarketPortfolio,
] as const;

// ─── Combined enterprise skill definitions ─────────────

export const ENTERPRISE_SKILL_DEFS = ENTERPRISE_MODULES.map(m => m.SKILL_DEF);
export const ENTERPRISE_UTILITY_TOOLS: ToolDefinition[] = ENTERPRISE_MODULES.flatMap(m => m.TOOLS);

// ─── Full SkillDefinitions with tools (for PermissionEngine) ────

import type { SkillDefinition } from '../skills.js';

const SYSTEM_MODULES = [CoreTools, MeetingLifecycle, AgentMemory, VisualMemory, KnowledgeSearch] as const;

export const SYSTEM_SKILL_DEFS = SYSTEM_MODULES.map(m => m.SKILL_DEF);
export const SYSTEM_TOOLS: ToolDefinition[] = SYSTEM_MODULES.flatMap(m => m.TOOLS);

// ─── SMTP/IMAP Email ────────────────────────────────────

export const SMTP_EMAIL_SKILL_DEFS = [SmtpEmail.SKILL_DEF];
export const SMTP_EMAIL_TOOLS: ToolDefinition[] = SmtpEmail.TOOLS;

const ALL_MODULES = [...AGENTICMAIL_MODULES, ...M365_MODULES, ...GWS_MODULES, ...ENTERPRISE_MODULES, ...SYSTEM_MODULES, SmtpEmail];

export const FULL_SKILL_DEFINITIONS: SkillDefinition[] = [
  ...ALL_MODULES.map(m => ({
    ...m.SKILL_DEF,
    tools: m.TOOLS,
  })),
  ...MESSAGING_SKILLS,
  ...LOCAL_SYSTEM_SKILLS,
  MCP_BRIDGE_SKILL,
  agentManagementSkill,
];

// ─── Re-export individual modules for direct access ─────

export {
  AgenticMail,
  M365Outlook, M365Teams, M365SharePoint, M365OneDrive,
  M365Word, M365Excel, M365PowerPoint, M365OneNote,
  M365Planner, M365PowerBI, M365PowerAutomate, M365Forms,
  M365ToDo, M365Bookings, M365Whiteboard, M365Admin, M365Copilot,
  GwsGmail, GwsCalendar, GwsDrive, GwsDocs,
  GwsSheets, GwsSlides, GwsMeet, GwsChat,
  GwsForms, GwsSites, GwsKeep, GwsAdmin,
  GwsVault, GwsGroups, GwsMaps, GwsContacts, GwsTasks,
  EntDatabase, DatabaseAccess, EntSpreadsheet, EntDocuments, EntHttp,
  EntSecurityScan, EntCodeSandbox, EntDiff,
  Polymarket, PolymarketQuant, PolymarketOnchain, PolymarketSocial,
  PolymarketFeeds, PolymarketAnalytics, PolymarketExecution,
  PolymarketCounterintel, PolymarketPortfolio,
  CoreTools, MeetingLifecycle, AgentMemory, VisualMemory, KnowledgeSearch,
  SmtpEmail,
};
