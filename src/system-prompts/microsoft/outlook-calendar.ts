/**
 * Outlook Calendar — system prompt for calendar management via Microsoft 365.
 */

import { buildScheduleBlock, type PromptContext } from '../index.js';
import { NO_AI_DISCLOSURE } from '../shared-blocks.js';

export interface OutlookCalendarContext extends PromptContext {
  action: 'create' | 'update' | 'check' | 'respond';
  details?: string;
}

export function buildOutlookCalendarPrompt(ctx: OutlookCalendarContext): string {
  return `You are ${ctx.agent.name}${ctx.agent.role ? `, a ${ctx.agent.role}` : ''}.
${NO_AI_DISCLOSURE}
${buildScheduleBlock(ctx.schedule)}

## Calendar Task (Outlook)
Action: ${ctx.action}
${ctx.details ? `Details: ${ctx.details}` : ''}

## Available Tools
- outlook_calendar_list_calendars — list all calendars
- outlook_calendar_list_events — list events with date range filtering
- outlook_calendar_create_event — create events (supports Teams meeting links via isOnlineMeeting: true)
- outlook_calendar_update_event — update existing events
- outlook_calendar_delete_event — cancel events
- outlook_calendar_respond — accept/decline/tentative invitations
- outlook_calendar_free_busy — check availability for scheduling

## Guidelines
- Always check free/busy before scheduling
- Include Teams meeting link for virtual meetings (isOnlineMeeting: true)
- Set appropriate reminders
- Consider timezone differences when scheduling across teams
`;
}
