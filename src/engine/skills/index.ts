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
  GwsVault, GwsGroups,
] as const;

// ─── Combined skill definitions (for BUILTIN_SKILLS) ────

export const M365_SKILL_DEFS = M365_MODULES.map(m => m.SKILL_DEF);
export const GWS_SKILL_DEFS = GWS_MODULES.map(m => m.SKILL_DEF);

// ─── Combined tool definitions (for tool-catalog.ts) ────

import type { ToolDefinition } from '../skills.js';

export const M365_TOOLS: ToolDefinition[] = M365_MODULES.flatMap(m => m.TOOLS);
export const GWS_TOOLS: ToolDefinition[] = GWS_MODULES.flatMap(m => m.TOOLS);

// ─── Enterprise Utility Skills ─────────────────────────

import * as EntDatabase from './enterprise-database.js';
import * as EntSpreadsheet from './enterprise-spreadsheet.js';
import * as EntDocuments from './enterprise-documents.js';
import * as EntCalendar from './enterprise-calendar.js';
import * as EntKnowledgeSearch from './enterprise-knowledge-search.js';
import * as EntWebResearch from './enterprise-web-research.js';
import * as EntTranslation from './enterprise-translation.js';
import * as EntLogs from './enterprise-logs.js';
import * as EntWorkflow from './enterprise-workflow.js';
import * as EntNotifications from './enterprise-notifications.js';
import * as EntFinance from './enterprise-finance.js';
import * as EntHttp from './enterprise-http.js';
import * as EntSecurityScan from './enterprise-security-scan.js';
import * as EntCodeSandbox from './enterprise-code-sandbox.js';
import * as EntDiff from './enterprise-diff.js';
import * as EntVision from './enterprise-vision.js';

export const ENTERPRISE_MODULES = [
  EntDatabase, EntSpreadsheet, EntDocuments, EntCalendar,
  EntKnowledgeSearch, EntWebResearch, EntTranslation, EntLogs,
  EntWorkflow, EntNotifications, EntFinance, EntHttp,
  EntSecurityScan, EntCodeSandbox, EntDiff, EntVision,
] as const;

// ─── Combined enterprise skill definitions ─────────────

export const ENTERPRISE_SKILL_DEFS = ENTERPRISE_MODULES.map(m => m.SKILL_DEF);
export const ENTERPRISE_UTILITY_TOOLS: ToolDefinition[] = ENTERPRISE_MODULES.flatMap(m => m.TOOLS);

// ─── Re-export individual modules for direct access ─────

export {
  M365Outlook, M365Teams, M365SharePoint, M365OneDrive,
  M365Word, M365Excel, M365PowerPoint, M365OneNote,
  M365Planner, M365PowerBI, M365PowerAutomate, M365Forms,
  M365ToDo, M365Bookings, M365Whiteboard, M365Admin, M365Copilot,
  GwsGmail, GwsCalendar, GwsDrive, GwsDocs,
  GwsSheets, GwsSlides, GwsMeet, GwsChat,
  GwsForms, GwsSites, GwsKeep, GwsAdmin,
  GwsVault, GwsGroups,
  EntDatabase, EntSpreadsheet, EntDocuments, EntCalendar,
  EntKnowledgeSearch, EntWebResearch, EntTranslation, EntLogs,
  EntWorkflow, EntNotifications, EntFinance, EntHttp,
  EntSecurityScan, EntCodeSandbox, EntDiff, EntVision,
};
