/**
 * Google Integration — System prompts for all Google Workspace services.
 * 
 * Each Google service has its own prompt file.
 * For Microsoft integration, create: src/system-prompts/microsoft/
 */

// Communication
export { buildMeetJoinPrompt, buildMeetJoinFromChatPrompt, type MeetJoinContext } from './meet.js';
export { buildGoogleChatPrompt, type GoogleChatContext } from './chat.js';
export { buildGmailPrompt, type GmailEmailContext } from './gmail.js';

// Productivity
export { buildCalendarEventPrompt, type CalendarEventContext } from './calendar.js';
export { buildDriveTaskPrompt, type DriveTaskContext } from './drive.js';
export { buildDocsTaskPrompt, type DocsTaskContext } from './docs.js';
export { buildSheetsTaskPrompt, type SheetsTaskContext } from './sheets.js';
export { buildSlidesPrompt, type SlidesContext } from './slides.js';
export { buildGoogleTasksPrompt, type TasksContext } from './tasks.js';
export { buildContactsPrompt, type ContactsContext } from './contacts.js';
export { buildFormsPrompt, type FormsContext } from './forms.js';

// Shared utilities available from '../index.js' — not re-exported here to avoid circular imports
