/**
 * AgenticMail Agent Tools — Enterprise Calendar
 *
 * File-based calendar system for AI agents using a JSON store.
 * Supports event CRUD, availability finding, and timezone conversion.
 * Persists events in {workspaceDir}/.agenticmail/calendar.json.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, jsonResult, textResult, errorResult } from '../common.js';

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: string[];
  location: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

type CalendarStore = {
  events: CalendarEvent[];
};

async function loadCalendarStore(storePath: string): Promise<CalendarStore> {
  try {
    var content = await fs.readFile(storePath, 'utf-8');
    return JSON.parse(content) as CalendarStore;
  } catch {
    return { events: [] };
  }
}

async function saveCalendarStore(storePath: string, store: CalendarStore): Promise<void> {
  var dir = path.dirname(storePath);
  await fs.mkdir(dir, { recursive: true });
  var data = JSON.stringify(store, null, 2);
  var tmpPath = storePath + '.tmp.' + crypto.randomBytes(4).toString('hex');
  try {
    await fs.writeFile(tmpPath, data, 'utf-8');
    await fs.rename(tmpPath, storePath);
  } catch (err) {
    try { await fs.unlink(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

function parseDateTime(str: string): Date | null {
  var d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return d;
}

function formatDateTime(d: Date): string {
  return d.toISOString();
}

function eventsOverlap(event: CalendarEvent, start: Date, end: Date): boolean {
  var eventStart = new Date(event.start);
  var eventEnd = new Date(event.end);
  return eventStart < end && eventEnd > start;
}

export function createCalendarTools(options?: ToolCreationOptions): AnyAgentTool[] {

  var storePath = path.join(
    options?.workspaceDir || process.cwd(),
    '.agenticmail',
    'calendar.json',
  );

  var entCalListEvents: AnyAgentTool = {
    name: 'ent_cal_list_events',
    label: 'List Calendar Events',
    description: 'List calendar events within a date range. Returns events sorted by start time. Defaults to today if no range specified.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Start of date range (ISO 8601 or YYYY-MM-DD). Defaults to start of today.' },
        end_date: { type: 'string', description: 'End of date range (ISO 8601 or YYYY-MM-DD). Defaults to end of today.' },
        limit: { type: 'number', description: 'Maximum number of events to return (default 50).' },
      },
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var startStr = readStringParam(params, 'start_date');
      var endStr = readStringParam(params, 'end_date');
      var limit = readNumberParam(params, 'limit', { integer: true }) ?? 50;

      var now = new Date();
      var startDate: Date;
      var endDate: Date;

      if (startStr) {
        var parsed = parseDateTime(startStr);
        if (!parsed) return errorResult('Invalid start_date format. Use ISO 8601 or YYYY-MM-DD.');
        startDate = parsed;
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      }

      if (endStr) {
        var parsed = parseDateTime(endStr);
        if (!parsed) return errorResult('Invalid end_date format. Use ISO 8601 or YYYY-MM-DD.');
        endDate = parsed;
      } else {
        endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
      }

      try {
        var store = await loadCalendarStore(storePath);
        var filtered = store.events.filter(function(event) {
          var eventStart = new Date(event.start);
          var eventEnd = new Date(event.end);
          return eventStart < endDate && eventEnd > startDate;
        });

        filtered.sort(function(a, b) {
          return new Date(a.start).getTime() - new Date(b.start).getTime();
        });

        var limited = filtered.slice(0, limit);
        return jsonResult({
          events: limited,
          count: limited.length,
          totalInRange: filtered.length,
          range: { start: formatDateTime(startDate), end: formatDateTime(endDate) },
        });
      } catch (err: any) {
        return errorResult('Failed to list events: ' + (err.message || String(err)));
      }
    },
  };

  var entCalCreateEvent: AnyAgentTool = {
    name: 'ent_cal_create_event',
    label: 'Create Calendar Event',
    description: 'Create a new calendar event with title, start/end times, attendees, location, and description.',
    category: 'utility',
    risk: 'medium',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title.' },
        start: { type: 'string', description: 'Start time (ISO 8601 or YYYY-MM-DD HH:MM).' },
        end: { type: 'string', description: 'End time (ISO 8601 or YYYY-MM-DD HH:MM).' },
        attendees: { type: 'string', description: 'Comma-separated list of attendee names or emails.' },
        location: { type: 'string', description: 'Event location.' },
        description: { type: 'string', description: 'Event description or notes.' },
      },
      required: ['title', 'start', 'end'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var title = readStringParam(params, 'title', { required: true });
      var startStr = readStringParam(params, 'start', { required: true });
      var endStr = readStringParam(params, 'end', { required: true });
      var attendeesStr = readStringParam(params, 'attendees') || '';
      var location = readStringParam(params, 'location') || '';
      var description = readStringParam(params, 'description') || '';

      var startDate = parseDateTime(startStr);
      if (!startDate) return errorResult('Invalid start time format. Use ISO 8601 or YYYY-MM-DD HH:MM.');

      var endDate = parseDateTime(endStr);
      if (!endDate) return errorResult('Invalid end time format. Use ISO 8601 or YYYY-MM-DD HH:MM.');

      if (endDate <= startDate) {
        return errorResult('End time must be after start time.');
      }

      var attendees = attendeesStr
        ? attendeesStr.split(',').map(function(a) { return a.trim(); }).filter(Boolean)
        : [];

      var now = new Date().toISOString();
      var event: CalendarEvent = {
        id: crypto.randomUUID(),
        title: title,
        start: formatDateTime(startDate),
        end: formatDateTime(endDate),
        attendees: attendees,
        location: location,
        description: description,
        createdAt: now,
        updatedAt: now,
      };

      try {
        var store = await loadCalendarStore(storePath);

        // Check for conflicts
        var conflicts = store.events.filter(function(existing) {
          return eventsOverlap(existing, startDate!, endDate!);
        });

        store.events.push(event);
        await saveCalendarStore(storePath, store);

        var result: Record<string, any> = { event: event, created: true };
        if (conflicts.length > 0) {
          result.conflicts = conflicts.map(function(c) {
            return { id: c.id, title: c.title, start: c.start, end: c.end };
          });
          result.warning = 'Event created but overlaps with ' + conflicts.length + ' existing event(s).';
        }
        return jsonResult(result);
      } catch (err: any) {
        return errorResult('Failed to create event: ' + (err.message || String(err)));
      }
    },
  };

  var entCalFindAvailability: AnyAgentTool = {
    name: 'ent_cal_find_availability',
    label: 'Find Availability',
    description: 'Find available time slots within a date range for a given duration. Returns free windows not occupied by existing events.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Start of search range (ISO 8601 or YYYY-MM-DD).' },
        end_date: { type: 'string', description: 'End of search range (ISO 8601 or YYYY-MM-DD).' },
        duration_minutes: { type: 'number', description: 'Required duration in minutes (default 60).' },
        working_hours_start: { type: 'number', description: 'Working hours start (0-23, default 9).' },
        working_hours_end: { type: 'number', description: 'Working hours end (0-23, default 17).' },
        max_slots: { type: 'number', description: 'Maximum number of available slots to return (default 10).' },
      },
      required: ['start_date', 'end_date'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var startStr = readStringParam(params, 'start_date', { required: true });
      var endStr = readStringParam(params, 'end_date', { required: true });
      var durationMinutes = readNumberParam(params, 'duration_minutes', { integer: true }) ?? 60;
      var workStart = readNumberParam(params, 'working_hours_start', { integer: true }) ?? 9;
      var workEnd = readNumberParam(params, 'working_hours_end', { integer: true }) ?? 17;
      var maxSlots = readNumberParam(params, 'max_slots', { integer: true }) ?? 10;

      var startDate = parseDateTime(startStr);
      if (!startDate) return errorResult('Invalid start_date format.');

      var endDate = parseDateTime(endStr);
      if (!endDate) return errorResult('Invalid end_date format.');

      if (endDate <= startDate) return errorResult('end_date must be after start_date.');

      var durationMs = durationMinutes * 60 * 1000;

      try {
        var store = await loadCalendarStore(storePath);

        // Get events in the range
        var rangeEvents = store.events.filter(function(event) {
          return eventsOverlap(event, startDate!, endDate!);
        }).sort(function(a, b) {
          return new Date(a.start).getTime() - new Date(b.start).getTime();
        });

        // Build busy intervals
        var busyIntervals: Array<{ start: number; end: number }> = rangeEvents.map(function(e) {
          return { start: new Date(e.start).getTime(), end: new Date(e.end).getTime() };
        });

        // Find free slots day by day within working hours
        var slots: Array<{ start: string; end: string; durationMinutes: number }> = [];
        var currentDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

        while (currentDay < endDate && slots.length < maxSlots) {
          var dayWorkStart = new Date(currentDay);
          dayWorkStart.setHours(workStart, 0, 0, 0);
          var dayWorkEnd = new Date(currentDay);
          dayWorkEnd.setHours(workEnd, 0, 0, 0);

          // Clamp to search range
          if (dayWorkStart < startDate) dayWorkStart = new Date(startDate.getTime());
          if (dayWorkEnd > endDate) dayWorkEnd = new Date(endDate.getTime());

          if (dayWorkStart < dayWorkEnd) {
            // Get busy intervals for this day
            var dayBusy = busyIntervals.filter(function(b) {
              return b.start < dayWorkEnd.getTime() && b.end > dayWorkStart.getTime();
            }).sort(function(a, b) { return a.start - b.start; });

            var cursor = dayWorkStart.getTime();
            for (var bi = 0; bi < dayBusy.length && slots.length < maxSlots; bi++) {
              var busyStart = dayBusy[bi].start;
              var busyEnd = dayBusy[bi].end;

              // Free slot before this busy period
              if (busyStart - cursor >= durationMs) {
                slots.push({
                  start: new Date(cursor).toISOString(),
                  end: new Date(busyStart).toISOString(),
                  durationMinutes: Math.floor((busyStart - cursor) / 60000),
                });
              }
              cursor = Math.max(cursor, busyEnd);
            }

            // Free slot after last busy period
            if (dayWorkEnd.getTime() - cursor >= durationMs && slots.length < maxSlots) {
              slots.push({
                start: new Date(cursor).toISOString(),
                end: dayWorkEnd.toISOString(),
                durationMinutes: Math.floor((dayWorkEnd.getTime() - cursor) / 60000),
              });
            }
          }

          // Move to next day
          currentDay.setDate(currentDay.getDate() + 1);
        }

        return jsonResult({
          availableSlots: slots,
          count: slots.length,
          searchRange: { start: formatDateTime(startDate), end: formatDateTime(endDate) },
          workingHours: { start: workStart, end: workEnd },
          requestedDuration: durationMinutes,
          existingEvents: rangeEvents.length,
        });
      } catch (err: any) {
        return errorResult('Availability search failed: ' + (err.message || String(err)));
      }
    },
  };

  var entCalUpdateEvent: AnyAgentTool = {
    name: 'ent_cal_update_event',
    label: 'Update Calendar Event',
    description: 'Update an existing calendar event by ID. Only the provided fields will be changed.',
    category: 'utility',
    risk: 'medium',
    parameters: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'Event ID to update.' },
        title: { type: 'string', description: 'New event title.' },
        start: { type: 'string', description: 'New start time (ISO 8601).' },
        end: { type: 'string', description: 'New end time (ISO 8601).' },
        attendees: { type: 'string', description: 'New comma-separated list of attendees (replaces existing).' },
        location: { type: 'string', description: 'New event location.' },
        description: { type: 'string', description: 'New event description.' },
      },
      required: ['event_id'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var eventId = readStringParam(params, 'event_id', { required: true });

      try {
        var store = await loadCalendarStore(storePath);
        var eventIndex = -1;
        for (var i = 0; i < store.events.length; i++) {
          if (store.events[i].id === eventId) {
            eventIndex = i;
            break;
          }
        }

        if (eventIndex === -1) {
          return errorResult('Event not found: ' + eventId);
        }

        var event = store.events[eventIndex];
        var changes: string[] = [];

        var newTitle = readStringParam(params, 'title');
        if (newTitle !== undefined) { event.title = newTitle; changes.push('title'); }

        var newStart = readStringParam(params, 'start');
        if (newStart !== undefined) {
          var startDate = parseDateTime(newStart);
          if (!startDate) return errorResult('Invalid start time format.');
          event.start = formatDateTime(startDate);
          changes.push('start');
        }

        var newEnd = readStringParam(params, 'end');
        if (newEnd !== undefined) {
          var endDate = parseDateTime(newEnd);
          if (!endDate) return errorResult('Invalid end time format.');
          event.end = formatDateTime(endDate);
          changes.push('end');
        }

        // Validate start < end after updates
        if (new Date(event.end) <= new Date(event.start)) {
          return errorResult('End time must be after start time.');
        }

        var newAttendees = readStringParam(params, 'attendees');
        if (newAttendees !== undefined) {
          event.attendees = newAttendees.split(',').map(function(a) { return a.trim(); }).filter(Boolean);
          changes.push('attendees');
        }

        var newLocation = readStringParam(params, 'location');
        if (newLocation !== undefined) { event.location = newLocation; changes.push('location'); }

        var newDescription = readStringParam(params, 'description');
        if (newDescription !== undefined) { event.description = newDescription; changes.push('description'); }

        if (changes.length === 0) {
          return textResult('No changes provided for event ' + eventId);
        }

        event.updatedAt = new Date().toISOString();
        store.events[eventIndex] = event;
        await saveCalendarStore(storePath, store);

        return jsonResult({
          event: event,
          updated: true,
          changedFields: changes,
        });
      } catch (err: any) {
        return errorResult('Failed to update event: ' + (err.message || String(err)));
      }
    },
  };

  var entCalCancelEvent: AnyAgentTool = {
    name: 'ent_cal_cancel_event',
    label: 'Cancel Calendar Event',
    description: 'Cancel (delete) a calendar event by ID.',
    category: 'utility',
    risk: 'medium',
    parameters: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'Event ID to cancel.' },
      },
      required: ['event_id'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var eventId = readStringParam(params, 'event_id', { required: true });

      try {
        var store = await loadCalendarStore(storePath);
        var eventIndex = -1;
        for (var i = 0; i < store.events.length; i++) {
          if (store.events[i].id === eventId) {
            eventIndex = i;
            break;
          }
        }

        if (eventIndex === -1) {
          return errorResult('Event not found: ' + eventId);
        }

        var cancelled = store.events[eventIndex];
        store.events.splice(eventIndex, 1);
        await saveCalendarStore(storePath, store);

        return jsonResult({
          cancelled: true,
          event: { id: cancelled.id, title: cancelled.title, start: cancelled.start, end: cancelled.end },
          remainingEvents: store.events.length,
        });
      } catch (err: any) {
        return errorResult('Failed to cancel event: ' + (err.message || String(err)));
      }
    },
  };

  var entCalTimezoneConvert: AnyAgentTool = {
    name: 'ent_cal_timezone_convert',
    label: 'Convert Timezone',
    description: 'Convert a datetime string from one timezone to another using the Intl API. Supports all IANA timezone names.',
    category: 'utility',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        datetime: { type: 'string', description: 'Datetime string to convert (ISO 8601 or common formats).' },
        from_timezone: { type: 'string', description: 'Source timezone (IANA name, e.g., "America/New_York").' },
        to_timezone: { type: 'string', description: 'Target timezone (IANA name, e.g., "Europe/London").' },
      },
      required: ['datetime', 'from_timezone', 'to_timezone'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var datetimeStr = readStringParam(params, 'datetime', { required: true });
      var fromTz = readStringParam(params, 'from_timezone', { required: true });
      var toTz = readStringParam(params, 'to_timezone', { required: true });

      try {
        // Parse the datetime
        var date = new Date(datetimeStr);
        if (isNaN(date.getTime())) {
          return errorResult('Invalid datetime format: ' + datetimeStr + '. Use ISO 8601 or YYYY-MM-DD HH:MM.');
        }

        // Validate timezones by attempting to use them
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: fromTz }).format(date);
        } catch {
          return errorResult('Invalid source timezone: ' + fromTz + '. Use IANA timezone names (e.g., America/New_York).');
        }

        try {
          new Intl.DateTimeFormat('en-US', { timeZone: toTz }).format(date);
        } catch {
          return errorResult('Invalid target timezone: ' + toTz + '. Use IANA timezone names (e.g., Europe/London).');
        }

        // Format in source timezone
        var fromFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: fromTz,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false, timeZoneName: 'short',
        });

        // Format in target timezone
        var toFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: toTz,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false, timeZoneName: 'short',
        });

        // Get ISO-like format for target timezone
        var toParts = toFormatter.formatToParts(date);
        var partMap: Record<string, string> = {};
        for (var part of toParts) {
          partMap[part.type] = part.value;
        }
        var isoLike = partMap.year + '-' + partMap.month + '-' + partMap.day
          + 'T' + partMap.hour + ':' + partMap.minute + ':' + partMap.second;

        return jsonResult({
          input: datetimeStr,
          fromTimezone: fromTz,
          toTimezone: toTz,
          sourceFormatted: fromFormatter.format(date),
          targetFormatted: toFormatter.format(date),
          targetIsoLike: isoLike,
          utcIso: date.toISOString(),
        });
      } catch (err: any) {
        return errorResult('Timezone conversion failed: ' + (err.message || String(err)));
      }
    },
  };

  return [entCalListEvents, entCalCreateEvent, entCalFindAvailability, entCalUpdateEvent, entCalCancelEvent, entCalTimezoneConvert];
}
