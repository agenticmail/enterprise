/**
 * Google Calendar Tools
 *
 * CRUD for events, free/busy lookup, and calendar listing via Google Calendar API v3.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { GoogleToolsConfig } from './index.js';

const BASE = 'https://www.googleapis.com/calendar/v3';

async function gapi(token: string, path: string, opts?: { method?: string; body?: any; query?: Record<string, string> }): Promise<any> {
  const method = opts?.method || 'GET';
  const url = new URL(BASE + path);
  if (opts?.query) for (const [k, v] of Object.entries(opts.query)) { if (v) url.searchParams.set(k, v); }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar API ${res.status}: ${err}`);
  }
  if (res.status === 204) return {};
  return res.json();
}

export function createGoogleCalendarTools(config: GoogleToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;
  return [
    {
      name: 'google_calendar_list',
      description: 'List all calendars the agent has access to.',
      category: 'utility' as const,
      parameters: { type: 'object' as const, properties: {}, required: [] },
      async execute(_id: string) {
        try {
          const token = await tp.getAccessToken();
          const data = await gapi(token, '/users/me/calendarList');
          const cals = (data.items || []).map((c: any) => ({
            id: c.id, summary: c.summary, description: c.description,
            primary: c.primary || false, timeZone: c.timeZone, accessRole: c.accessRole,
          }));
          return jsonResult({ calendars: cals, count: cals.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_calendar_events',
      description: 'List upcoming events from a calendar. Defaults to primary calendar.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          calendarId: { type: 'string', description: 'Calendar ID (default: "primary")' },
          timeMin: { type: 'string', description: 'Start of range (ISO 8601, default: now)' },
          timeMax: { type: 'string', description: 'End of range (ISO 8601)' },
          maxResults: { type: 'number', description: 'Max events to return (default: 25, max: 250)' },
          query: { type: 'string', description: 'Free-text search filter' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const calId = params.calendarId || 'primary';
          const query: Record<string, string> = {
            singleEvents: 'true',
            orderBy: 'startTime',
            maxResults: String(Math.min(params.maxResults || 25, 250)),
            timeMin: params.timeMin || new Date().toISOString(),
          };
          if (params.timeMax) query.timeMax = params.timeMax;
          if (params.query) query.q = params.query;
          const data = await gapi(token, `/calendars/${encodeURIComponent(calId)}/events`, { query });
          const events = (data.items || []).map((e: any) => ({
            id: e.id, summary: e.summary, description: e.description,
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            location: e.location,
            attendees: (e.attendees || []).map((a: any) => ({ email: a.email, name: a.displayName, status: a.responseStatus })),
            status: e.status, htmlLink: e.htmlLink,
            organizer: e.organizer?.email,
            recurring: !!e.recurringEventId,
          }));
          return jsonResult({ events, count: events.length, calendarId: calId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_calendar_create_event',
      description: 'Create a new calendar event. Supports attendees, location, reminders, and recurrence.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          calendarId: { type: 'string', description: 'Calendar ID (default: "primary")' },
          summary: { type: 'string', description: 'Event title (required)' },
          description: { type: 'string', description: 'Event description/body' },
          start: { type: 'string', description: 'Start time (ISO 8601, required)' },
          end: { type: 'string', description: 'End time (ISO 8601, required)' },
          location: { type: 'string', description: 'Event location' },
          attendees: { type: 'string', description: 'Comma-separated email addresses' },
          timeZone: { type: 'string', description: 'Timezone (e.g. "America/New_York")' },
          allDay: { type: 'string', description: 'If "true", creates all-day event (start/end should be YYYY-MM-DD)' },
          recurrence: { type: 'string', description: 'RRULE string (e.g. "RRULE:FREQ=WEEKLY;COUNT=10")' },
          sendUpdates: { type: 'string', description: '"all" to email attendees, "none" to skip (default: "all")' },
        },
        required: ['summary', 'start', 'end'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const calId = params.calendarId || 'primary';
          const isAllDay = params.allDay === 'true';
          const event: any = {
            summary: params.summary,
            description: params.description,
            location: params.location,
            start: isAllDay ? { date: params.start } : { dateTime: params.start, timeZone: params.timeZone },
            end: isAllDay ? { date: params.end } : { dateTime: params.end, timeZone: params.timeZone },
          };
          if (params.attendees) {
            event.attendees = params.attendees.split(',').map((e: string) => ({ email: e.trim() }));
          }
          if (params.recurrence) event.recurrence = [params.recurrence];
          const query: Record<string, string> = {};
          if (params.sendUpdates) query.sendUpdates = params.sendUpdates;
          const result = await gapi(token, `/calendars/${encodeURIComponent(calId)}/events`, { method: 'POST', body: event, query });
          return jsonResult({ created: true, eventId: result.id, htmlLink: result.htmlLink, summary: result.summary, start: result.start?.dateTime || result.start?.date });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_calendar_update_event',
      description: 'Update an existing calendar event.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          calendarId: { type: 'string', description: 'Calendar ID (default: "primary")' },
          eventId: { type: 'string', description: 'Event ID to update (required)' },
          summary: { type: 'string', description: 'New title' },
          description: { type: 'string', description: 'New description' },
          start: { type: 'string', description: 'New start time (ISO 8601)' },
          end: { type: 'string', description: 'New end time (ISO 8601)' },
          location: { type: 'string', description: 'New location' },
          attendees: { type: 'string', description: 'Comma-separated email addresses (replaces existing)' },
          sendUpdates: { type: 'string', description: '"all" to email attendees, "none" to skip' },
        },
        required: ['eventId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const calId = params.calendarId || 'primary';
          const patch: any = {};
          if (params.summary) patch.summary = params.summary;
          if (params.description) patch.description = params.description;
          if (params.location) patch.location = params.location;
          if (params.start) patch.start = { dateTime: params.start };
          if (params.end) patch.end = { dateTime: params.end };
          if (params.attendees) patch.attendees = params.attendees.split(',').map((e: string) => ({ email: e.trim() }));
          const query: Record<string, string> = {};
          if (params.sendUpdates) query.sendUpdates = params.sendUpdates;
          const result = await gapi(token, `/calendars/${encodeURIComponent(calId)}/events/${params.eventId}`, { method: 'PATCH', body: patch, query });
          return jsonResult({ updated: true, eventId: result.id, summary: result.summary });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_calendar_delete_event',
      description: 'Delete a calendar event.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          calendarId: { type: 'string', description: 'Calendar ID (default: "primary")' },
          eventId: { type: 'string', description: 'Event ID to delete (required)' },
          sendUpdates: { type: 'string', description: '"all" to notify attendees, "none" to skip' },
        },
        required: ['eventId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const calId = params.calendarId || 'primary';
          const query: Record<string, string> = {};
          if (params.sendUpdates) query.sendUpdates = params.sendUpdates;
          await gapi(token, `/calendars/${encodeURIComponent(calId)}/events/${params.eventId}`, { method: 'DELETE', query });
          return jsonResult({ deleted: true, eventId: params.eventId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_calendar_freebusy',
      description: 'Check free/busy status for one or more calendars in a time range. Useful for scheduling meetings.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          timeMin: { type: 'string', description: 'Start of range (ISO 8601, required)' },
          timeMax: { type: 'string', description: 'End of range (ISO 8601, required)' },
          calendars: { type: 'string', description: 'Comma-separated calendar IDs (default: "primary")' },
        },
        required: ['timeMin', 'timeMax'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const calIds = (params.calendars || 'primary').split(',').map((c: string) => ({ id: c.trim() }));
          const data = await gapi(token, '/freeBusy', {
            method: 'POST',
            body: { timeMin: params.timeMin, timeMax: params.timeMax, items: calIds },
          });
          const result: Record<string, any> = {};
          for (const [calId, info] of Object.entries(data.calendars || {})) {
            result[calId] = { busy: (info as any).busy || [], errors: (info as any).errors };
          }
          return jsonResult({ freeBusy: result, timeMin: params.timeMin, timeMax: params.timeMax });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
