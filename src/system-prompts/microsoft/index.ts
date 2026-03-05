/**
 * Microsoft 365 Integration — System prompts for all Microsoft services.
 *
 * Each service has its own prompt file, mirroring the Google pattern.
 */

// Communication
export { buildOutlookMailPrompt, type OutlookMailContext } from './outlook-mail.js';
export { buildOutlookCalendarPrompt, type OutlookCalendarContext } from './outlook-calendar.js';
export { buildTeamsPrompt, type TeamsContext } from './teams.js';

// Files & Storage
export { buildOneDrivePrompt, type OneDriveContext } from './onedrive.js';
export { buildSharePointPrompt, type SharePointContext } from './sharepoint.js';

// Productivity
export { buildExcelPrompt, type ExcelContext } from './excel.js';
export { buildOneNotePrompt, type OneNoteContext } from './onenote.js';
export { buildPowerPointPrompt, type PowerPointContext } from './powerpoint.js';

// Task Management
export { buildTodoPrompt, type TodoContext } from './todo.js';
export { buildPlannerPrompt, type PlannerContext } from './planner.js';

// Business Intelligence
export { buildPowerBIPrompt, type PowerBIContext } from './powerbi.js';

// Contacts
export { buildMSContactsPrompt, type MSContactsContext } from './contacts.js';

// Shared utilities available from '../index.js' — not re-exported here to avoid circular imports
