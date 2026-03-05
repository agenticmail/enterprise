/**
 * Microsoft Outlook Calendar Tools
 *
 * CRUD for events, free/busy lookup, and calendar listing via Microsoft Graph API.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { MicrosoftToolsConfig } from './index.js';
import { graph } from './graph-api.js';

export function createOutlookCalendarTools(config: MicrosoftToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    {
      name: 'outlook_calendar_list',
      description: 'List all calendars the agent has access to.',
      category: 'utility' as const,
      parameters: { type: 'object' as const, properties: {}, required: [] },
      async execute(_id: string) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, '/me/calendars');
          const cals = (data.value || []).map((c: any) => ({
            id: c.id, name: c.name, color: c.color,
            isDefaultCalendar: c.isDefaultCalendar, canEdit: c.canEdit,
            owner: c.owner?.address,
          }));
          return jsonResult({ calendars: cals, count: cals.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_calendar_events',
      description: 'List upcoming events from a calendar. Defaults to the primary calendar.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          calendarId: { type: 'string', description: 'Calendar ID (omit for default calendar)' },
          timeMin: { type: 'string', description: 'Start of time range (ISO 8601, default: now)' },
          timeMax: { type: 'string', description: 'End of time range (ISO 8601, default: +7 days)' },
          maxResults: { type: 'number', description: 'Max events (default: 20)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const now = new Date();
          const timeMin = params.timeMin || now.toISOString();
          const weekLater = new Date(now.getTime() + 7 * 86400000);
          const timeMax = params.timeMax || weekLater.toISOString();
          const top = params.maxResults || 20;

          const basePath = params.calendarId
            ? `/me/calendars/${params.calendarId}/calendarView`
            : '/me/calendarView';

          const data = await graph(token, basePath, {
            query: {
              startDateTime: timeMin,
              endDateTime: timeMax,
              '$top': String(top),
              '$orderby': 'start/dateTime',
              '$select': 'id,subject,start,end,location,organizer,attendees,isAllDay,isCancelled,showAs,importance,bodyPreview,onlineMeeting,webLink',
            }
          });

          const events = (data.value || []).map((e: any) => ({
            id: e.id,
            subject: e.subject,
            start: e.start?.dateTime,
            startTimeZone: e.start?.timeZone,
            end: e.end?.dateTime,
            endTimeZone: e.end?.timeZone,
            isAllDay: e.isAllDay,
            location: e.location?.displayName,
            organizer: e.organizer?.emailAddress?.address,
            attendees: e.attendees?.map((a: any) => ({
              email: a.emailAddress?.address,
              name: a.emailAddress?.name,
              status: a.status?.response,
              type: a.type,
            })),
            showAs: e.showAs,
            isCancelled: e.isCancelled,
            preview: e.bodyPreview,
            meetingUrl: e.onlineMeeting?.joinUrl,
            webLink: e.webLink,
          }));
          return jsonResult({ events, count: events.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_calendar_create',
      description: 'Create a new calendar event. Supports attendees, location, online meeting (Teams), and recurrence.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          subject: { type: 'string', description: 'Event subject/title' },
          start: { type: 'string', description: 'Start time (ISO 8601)' },
          end: { type: 'string', description: 'End time (ISO 8601)' },
          timeZone: { type: 'string', description: 'Time zone (default: UTC)' },
          location: { type: 'string', description: 'Location name' },
          body: { type: 'string', description: 'Event body/description' },
          attendees: { type: 'string', description: 'Attendee emails, comma-separated' },
          isOnlineMeeting: { type: 'boolean', description: 'Create a Teams meeting link (default: false)' },
          isAllDay: { type: 'boolean', description: 'All-day event' },
          importance: { type: 'string', description: 'low, normal, or high' },
          reminderMinutes: { type: 'number', description: 'Reminder before event in minutes (default: 15)' },
          calendarId: { type: 'string', description: 'Calendar ID (omit for default)' },
        },
        required: ['subject', 'start', 'end'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const tz = params.timeZone || 'UTC';
          const event: any = {
            subject: params.subject,
            start: { dateTime: params.start, timeZone: tz },
            end: { dateTime: params.end, timeZone: tz },
          };
          if (params.location) event.location = { displayName: params.location };
          if (params.body) event.body = { contentType: 'HTML', content: params.body };
          if (params.attendees) {
            event.attendees = params.attendees.split(',').map((e: string) => ({
              emailAddress: { address: e.trim() },
              type: 'required',
            }));
          }
          if (params.isOnlineMeeting) {
            event.isOnlineMeeting = true;
            event.onlineMeetingProvider = 'teamsForBusiness';
          }
          if (params.isAllDay) event.isAllDay = true;
          if (params.importance) event.importance = params.importance;
          if (params.reminderMinutes !== undefined) {
            event.isReminderOn = true;
            event.reminderMinutesBefore = params.reminderMinutes;
          }

          const basePath = params.calendarId
            ? `/me/calendars/${params.calendarId}/events`
            : '/me/events';

          const created = await graph(token, basePath, { method: 'POST', body: event });
          return jsonResult({
            id: created.id,
            subject: created.subject,
            start: created.start?.dateTime,
            end: created.end?.dateTime,
            meetingUrl: created.onlineMeeting?.joinUrl,
            webLink: created.webLink,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_calendar_update',
      description: 'Update an existing calendar event.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          eventId: { type: 'string', description: 'Event ID to update' },
          subject: { type: 'string', description: 'New subject' },
          start: { type: 'string', description: 'New start time (ISO 8601)' },
          end: { type: 'string', description: 'New end time (ISO 8601)' },
          timeZone: { type: 'string', description: 'Time zone' },
          location: { type: 'string', description: 'New location' },
          body: { type: 'string', description: 'New body content' },
        },
        required: ['eventId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const update: any = {};
          if (params.subject) update.subject = params.subject;
          if (params.start) update.start = { dateTime: params.start, timeZone: params.timeZone || 'UTC' };
          if (params.end) update.end = { dateTime: params.end, timeZone: params.timeZone || 'UTC' };
          if (params.location) update.location = { displayName: params.location };
          if (params.body) update.body = { contentType: 'HTML', content: params.body };

          const updated = await graph(token, `/me/events/${params.eventId}`, { method: 'PATCH', body: update });
          return jsonResult({ id: updated.id, subject: updated.subject, updated: true });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_calendar_delete',
      description: 'Delete a calendar event.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          eventId: { type: 'string', description: 'Event ID to delete' },
        },
        required: ['eventId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          await graph(token, `/me/events/${params.eventId}`, { method: 'DELETE' });
          return jsonResult({ deleted: true, eventId: params.eventId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_calendar_respond',
      description: 'Respond to a calendar event invitation (accept, tentatively accept, or decline).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          eventId: { type: 'string', description: 'Event ID to respond to' },
          response: { type: 'string', description: 'accept, tentativelyAccept, or decline' },
          comment: { type: 'string', description: 'Optional response message' },
          sendResponse: { type: 'boolean', description: 'Send response to organizer (default: true)' },
        },
        required: ['eventId', 'response'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const body: any = { sendResponse: params.sendResponse !== false };
          if (params.comment) body.comment = params.comment;
          await graph(token, `/me/events/${params.eventId}/${params.response}`, { method: 'POST', body });
          return jsonResult({ responded: true, eventId: params.eventId, response: params.response });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_calendar_freebusy',
      description: 'Check free/busy availability for one or more users.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          emails: { type: 'string', description: 'Email addresses to check, comma-separated' },
          start: { type: 'string', description: 'Start of range (ISO 8601)' },
          end: { type: 'string', description: 'End of range (ISO 8601)' },
          timeZone: { type: 'string', description: 'Time zone (default: UTC)' },
        },
        required: ['emails', 'start', 'end'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const schedules = params.emails.split(',').map((e: string) => e.trim());
          const data = await graph(token, '/me/calendar/getSchedule', {
            method: 'POST',
            body: {
              schedules,
              startTime: { dateTime: params.start, timeZone: params.timeZone || 'UTC' },
              endTime: { dateTime: params.end, timeZone: params.timeZone || 'UTC' },
              availabilityViewInterval: 30,
            },
          });
          const results = (data.value || []).map((s: any) => ({
            email: s.scheduleId,
            availability: s.availabilityView,
            items: s.scheduleItems?.map((i: any) => ({
              status: i.status,
              subject: i.subject,
              start: i.start?.dateTime,
              end: i.end?.dateTime,
            })),
          }));
          return jsonResult({ schedules: results });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
