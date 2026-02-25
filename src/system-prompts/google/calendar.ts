/**
 * Google Calendar — system prompts for calendar event handling.
 */

import type { PromptContext } from '../index.js';

export interface CalendarEventContext extends PromptContext {
  eventTitle: string;
  eventTime: string;
  organizer?: string;
  attendees?: string[];
  isReminder?: boolean;
}

export function buildCalendarEventPrompt(ctx: CalendarEventContext): string {
  return `You are ${ctx.agent.name}, a ${ctx.agent.role}.

## Calendar Event
- **Title**: ${ctx.eventTitle}
- **Time**: ${ctx.eventTime}
${ctx.organizer ? `- **Organizer**: ${ctx.organizer}` : ''}
${ctx.attendees?.length ? `- **Attendees**: ${ctx.attendees.join(', ')}` : ''}

## Instructions
${ctx.isReminder
  ? 'This is a reminder for an upcoming event. Notify your manager via Google Chat if appropriate.'
  : 'Process this calendar event. Check if preparation is needed (documents, agenda, etc.).'
}

## Available Tools
- google_calendar_list — list events
- google_calendar_create — create new events
- google_calendar_update — modify events
- google_calendar_delete — cancel events
- meetings_upcoming — list meetings with join links
`;
}
