/**
 * Google Workspace Tools — Index
 *
 * All Google Workspace API tools for enterprise agents.
 * Requires agent to have Google OAuth configured with appropriate scopes.
 */

export { createGmailTools } from './gmail.js';
export { createGoogleCalendarTools } from './calendar.js';
export { createGoogleDriveTools } from './drive.js';
export { createGoogleSheetsTools } from './sheets.js';
export { createGoogleDocsTools } from './docs.js';
export { createGoogleContactsTools } from './contacts.js';
export { createMeetingTools } from './meetings.js';
export { createMeetingVoiceTools } from './meeting-voice.js';
export { createGoogleTasksTools } from './tasks.js';
export { createGoogleChatTools } from './chat.js';
export { createGoogleSlidesTools } from './slides.js';
export { createGoogleFormsTools } from './forms.js';
export { createGoogleMapsTools } from './maps.js';

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import type { TokenProvider } from '../oauth-token-provider.js';
export type { TokenProvider };
import { createGmailTools } from './gmail.js';
import { createGoogleCalendarTools } from './calendar.js';
import { createGoogleDriveTools } from './drive.js';
import { createGoogleSheetsTools } from './sheets.js';
import { createGoogleDocsTools } from './docs.js';
import { createGoogleContactsTools } from './contacts.js';
import { createMeetingTools } from './meetings.js';
import { createMeetingVoiceTools } from './meeting-voice.js';
import { createGoogleTasksTools } from './tasks.js';
import { createGoogleChatTools } from './chat.js';
import { createGoogleSlidesTools } from './slides.js';
import { createGoogleFormsTools } from './forms.js';
import { createGoogleMapsTools, type GoogleMapsConfig } from './maps.js';

export interface GoogleToolsConfig {
  tokenProvider: TokenProvider;
}

/**
 * Create all Google Workspace tools for an agent.
 * Returns ~30 tools covering Calendar, Drive, Sheets, Docs, and Contacts.
 */
/**
 * Create all Google Workspace tools for an agent.
 * Returns ~45 tools covering Gmail, Calendar, Drive, Sheets, Docs, Contacts, and Meetings.
 */
export function createAllGoogleTools(config: GoogleToolsConfig, options?: ToolCreationOptions): AnyAgentTool[] {
  // Allow limiting which Google services are loaded via options.enabledGoogleServices
  // If not set, load core services only (gmail, calendar, drive, tasks) to avoid tool count limits on some models
  const enabled = (options as any)?.enabledGoogleServices as string[] | undefined;
  const all = !enabled; // if not specified, use core set
  const has = (s: string) => enabled ? enabled.includes(s) : false;
  const core = !enabled; // default: load core services only
  
  const tools: AnyAgentTool[] = [];
  if (all || core || has('gmail'))    tools.push(...createGmailTools(config, options));
  if (all || core || has('calendar')) tools.push(...createGoogleCalendarTools(config, options));
  if (all || core || has('drive'))    tools.push(...createGoogleDriveTools(config, options));
  if (all || core || has('tasks'))    tools.push(...createGoogleTasksTools(config.tokenProvider));
  if (all || has('sheets'))           tools.push(...createGoogleSheetsTools(config, options));
  if (all || has('docs'))             tools.push(...createGoogleDocsTools(config, options));
  if (all || has('contacts'))         tools.push(...createGoogleContactsTools(config, options));
  if (all || has('meetings'))         tools.push(...createMeetingTools(config, options));
  if (all || has('meetings'))         tools.push(...createMeetingVoiceTools({
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: (options as any)?.voiceConfig?.voiceId,
    voiceName: (options as any)?.voiceConfig?.voiceName,
    audioDevice: (options as any)?.voiceConfig?.audioDevice,
  }, options));
  if (all || has('chat'))             tools.push(...createGoogleChatTools(config, options));
  if (all || has('slides'))           tools.push(...createGoogleSlidesTools(config, options));
  if (all || has('forms'))            tools.push(...createGoogleFormsTools(config, options));
  // Google Maps loads independently — it uses an API key (not OAuth), so always check
  {
    const mapsKeyResolver = (options as any)?.mapsApiKeyResolver as (() => Promise<string> | string) | undefined;
    if (mapsKeyResolver) {
      tools.push(...createGoogleMapsTools({ getApiKey: mapsKeyResolver }));
      console.log('[google-tools] ✅ Google Maps tools loaded (10 tools)');
    }
  }
  return tools;
}
