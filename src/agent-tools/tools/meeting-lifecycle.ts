/**
 * Meeting Lifecycle Tools
 *
 * Manages the full meeting lifecycle:
 * - Pre-meeting: Create Drive folder, prep notes, check calendar
 * - During: Join (if capable), take notes, record
 * - Post-meeting: Upload recording, transcribe, extract action items, organize in Drive
 *
 * Works on ALL deployments:
 * - Container (Fly.io): API-only — prep, notes, Drive organization, NO joining
 * - VM: Full lifecycle including joining, recording, transcription
 * - Local: Full lifecycle
 */

import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { jsonResult, errorResult } from '../common.js';
import type { TokenProvider } from './oauth-token-provider.js';
import { detectCapabilities, getCapabilitySummary, type SystemCapabilities } from '../../runtime/environment.js';

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

async function api(token: string, base: string, path: string, opts?: { method?: string; body?: any; query?: Record<string, string> }): Promise<any> {
  const url = new URL(base + path);
  if (opts?.query) for (const [k, v] of Object.entries(opts.query)) { if (v) url.searchParams.set(k, v); }
  const res = await fetch(url.toString(), {
    method: opts?.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return {};
  return res.json();
}

async function driveUploadText(token: string, name: string, content: string, parentId: string, mimeType = 'text/plain'): Promise<any> {
  const boundary = '===agenticmail===';
  const metadata = JSON.stringify({ name, parents: [parentId], mimeType });
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
  const res = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
  return res.json();
}

async function ensureDriveFolder(token: string, name: string, parentId?: string): Promise<{ id: string; name: string }> {
  // Check if folder exists
  const parts = [`name = '${name.replace(/'/g, "\\'")}'`, "mimeType = 'application/vnd.google-apps.folder'", 'trashed = false'];
  if (parentId) parts.push(`'${parentId}' in parents`);
  const existing = await api(token, DRIVE_BASE, '/files', { query: { q: parts.join(' and '), fields: 'files(id,name)', pageSize: '1' } });
  if (existing.files?.length) return existing.files[0];

  // Create
  const body: any = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) body.parents = [parentId];
  return api(token, DRIVE_BASE, '/files', { method: 'POST', body, query: { fields: 'id,name' } });
}

export interface MeetingLifecycleConfig {
  tokenProvider: TokenProvider;
}

export function createMeetingLifecycleTools(config: MeetingLifecycleConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;
  let caps: SystemCapabilities | null = null;
  function getCaps() { if (!caps) caps = detectCapabilities(); return caps; }

  return [
    // ─── System Capabilities Check ─────────────────────
    {
      name: 'system_capabilities',
      description: 'Check what this deployment can do. Shows browser, display, audio, video meeting, and recording capabilities. Use this first to understand what tools are available on this system.',
      category: 'utility' as const,
      parameters: { type: 'object' as const, properties: {}, required: [] },
      async execute() {
        const c = getCaps();
        const summary = getCapabilitySummary(c);
        return jsonResult({
          ...summary,
          raw: {
            deployment: c.deployment,
            hasBrowser: c.hasBrowser,
            browserPath: c.browserPath,
            hasDisplay: c.hasDisplay,
            hasAudio: c.hasAudio,
            hasVirtualCamera: c.hasVirtualCamera,
            canRunHeadedBrowser: c.canRunHeadedBrowser,
            canJoinMeetings: c.canJoinMeetings,
            canRecordMeetings: c.canRecordMeetings,
            hasFfmpeg: c.hasFfmpeg,
            hasPersistentDisk: c.hasPersistentDisk,
            platform: c.platform,
          },
        });
      },
    },

    // ─── Prepare Meeting (works everywhere) ────────────
    {
      name: 'meeting_prepare',
      description: 'Prepare for a meeting: create a Google Drive folder structure, generate meeting notes template with attendees and agenda, and return everything needed. Works on ALL deployments (container + VM).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          eventId: { type: 'string', description: 'Google Calendar event ID (will auto-fetch details)' },
          title: { type: 'string', description: 'Meeting title (if no eventId)' },
          date: { type: 'string', description: 'Meeting date ISO string (if no eventId)' },
          attendees: { type: 'string', description: 'Comma-separated attendee emails (if no eventId)' },
          agenda: { type: 'string', description: 'Meeting agenda text' },
          driveRootFolderId: { type: 'string', description: 'Root "Meetings" folder ID in Drive (will create if not provided)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();

          // Fetch event details from calendar if eventId provided
          let title = params.title || 'Meeting';
          let date = params.date || new Date().toISOString();
          let attendees: Array<{ email: string; name?: string; status?: string }> = [];
          let organizer = '';
          let meetingLink: string | null = null;
          let platform = '';
          let description = '';

          if (params.eventId) {
            const event = await api(token, CALENDAR_BASE, `/calendars/primary/events/${params.eventId}`);
            title = event.summary || title;
            date = event.start?.dateTime || event.start?.date || date;
            description = event.description || '';
            organizer = event.organizer?.email || '';
            attendees = (event.attendees || []).map((a: any) => ({
              email: a.email, name: a.displayName, status: a.responseStatus,
            }));

            // Extract meeting link
            if (event.conferenceData?.entryPoints) {
              for (const ep of event.conferenceData.entryPoints) {
                if (ep.entryPointType === 'video' && ep.uri) {
                  meetingLink = ep.uri;
                  platform = 'google_meet';
                  break;
                }
              }
            }
            if (!meetingLink && event.hangoutLink) {
              meetingLink = event.hangoutLink;
              platform = 'google_meet';
            }
          }

          if (params.attendees && !attendees.length) {
            attendees = params.attendees.split(',').map((e: string) => ({ email: e.trim() }));
          }

          // Build folder structure: Meetings / YYYY / MM-Month / YYYY-MM-DD - Title - Attendees
          const d = new Date(date);
          const year = String(d.getFullYear());
          const monthNum = String(d.getMonth() + 1).padStart(2, '0');
          const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          const monthName = `${monthNum}-${months[d.getMonth()]}`;
          const dateStr = `${year}-${monthNum}-${String(d.getDate()).padStart(2, '0')}`;
          const attendeeNames = attendees.slice(0, 3).map(a => a.name || a.email.split('@')[0]).join(', ');
          const folderName = `${dateStr} - ${title}${attendeeNames ? ` - ${attendeeNames}` : ''}`;

          // Create folder hierarchy
          const rootFolder = params.driveRootFolderId
            ? { id: params.driveRootFolderId, name: 'Meetings' }
            : await ensureDriveFolder(token, 'Meetings');
          const yearFolder = await ensureDriveFolder(token, year, rootFolder.id);
          const monthFolder = await ensureDriveFolder(token, monthName, yearFolder.id);
          const meetingFolder = await ensureDriveFolder(token, folderName, monthFolder.id);

          // Generate meeting notes template
          const notesContent = [
            `# ${title}`,
            '',
            `**Date:** ${d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
            organizer ? `**Organizer:** ${organizer}` : '',
            meetingLink ? `**Meeting Link:** ${meetingLink} (${platform})` : '',
            '',
            '## Attendees',
            ...attendees.map(a => `- ${a.name || a.email} (${a.email})${a.status ? ` — ${a.status}` : ''}`),
            '',
            '## Agenda',
            params.agenda || description || '_No agenda provided_',
            '',
            '## Notes',
            '_Meeting notes will be added here..._',
            '',
            '## Action Items',
            '- [ ] _Action items from the meeting..._',
            '',
            '## Decisions Made',
            '- _Key decisions..._',
            '',
            '---',
            `_Prepared by AI Agent on ${new Date().toISOString()}_`,
          ].filter(Boolean).join('\n');

          // Upload meeting notes template
          const notesFile = await driveUploadText(token, 'meeting-notes.md', notesContent, meetingFolder.id);

          // Check system capabilities for meeting joining
          const c = getCaps();
          const canJoin = c.canJoinMeetings;

          return jsonResult({
            prepared: true,
            folder: {
              id: meetingFolder.id,
              path: `Meetings/${year}/${monthName}/${folderName}`,
              hierarchy: {
                root: rootFolder.id,
                year: yearFolder.id,
                month: monthFolder.id,
                meeting: meetingFolder.id,
              },
            },
            notesFile: { id: notesFile.id, name: notesFile.name, webViewLink: notesFile.webViewLink },
            meeting: {
              title, date, organizer, attendees,
              meetingLink, platform,
            },
            capabilities: {
              canJoinMeeting: canJoin,
              canRecord: c.canRecordMeetings,
              deployment: c.deployment,
              ...(!canJoin ? {
                limitation: 'This deployment cannot join video meetings. Meeting prep, notes, and post-meeting organization are fully available. To enable meeting joining, deploy on a VM with display + audio.',
              } : {}),
            },
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Post-Meeting: Save & Organize ─────────────────
    {
      name: 'meeting_save',
      description: 'Save meeting artifacts to the meeting\'s Google Drive folder. Upload notes, transcript, recording, action items, and any shared files. Organizes everything neatly. Works on ALL deployments.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          folderId: { type: 'string', description: 'Meeting folder ID in Google Drive (from meeting_prepare)' },
          notes: { type: 'string', description: 'Meeting notes content (markdown)' },
          transcript: { type: 'string', description: 'Meeting transcript text' },
          actionItems: { type: 'string', description: 'Action items as markdown list' },
          summary: { type: 'string', description: 'Meeting summary text' },
          decisions: { type: 'string', description: 'Key decisions made' },
          followUps: { type: 'string', description: 'Follow-up tasks/meetings needed' },
          recordingPath: { type: 'string', description: 'Local file path to recording (VM/local only)' },
        },
        required: ['folderId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const folderId = params.folderId;
          const uploaded: any[] = [];

          if (params.notes) {
            const f = await driveUploadText(token, 'meeting-notes.md', params.notes, folderId);
            uploaded.push({ type: 'notes', id: f.id, name: f.name, webViewLink: f.webViewLink });
          }

          if (params.transcript) {
            const f = await driveUploadText(token, 'transcript.txt', params.transcript, folderId);
            uploaded.push({ type: 'transcript', id: f.id, name: f.name, webViewLink: f.webViewLink });
          }

          if (params.actionItems) {
            const content = `# Action Items\n\n${params.actionItems}\n\n---\n_Extracted by AI Agent on ${new Date().toISOString()}_`;
            const f = await driveUploadText(token, 'action-items.md', content, folderId);
            uploaded.push({ type: 'action_items', id: f.id, name: f.name, webViewLink: f.webViewLink });
          }

          if (params.summary) {
            const content = `# Meeting Summary\n\n${params.summary}${params.decisions ? `\n\n## Decisions\n${params.decisions}` : ''}${params.followUps ? `\n\n## Follow-ups\n${params.followUps}` : ''}\n\n---\n_Generated by AI Agent on ${new Date().toISOString()}_`;
            const f = await driveUploadText(token, 'summary.md', content, folderId);
            uploaded.push({ type: 'summary', id: f.id, name: f.name, webViewLink: f.webViewLink });
          }

          if (params.recordingPath) {
            const c = getCaps();
            if (!c.hasPersistentDisk) {
              uploaded.push({ type: 'recording', error: 'Recording upload skipped — ephemeral filesystem. Recording may have been lost.' });
            } else {
              // For large file upload, we'd use resumable upload. For now, note the path.
              uploaded.push({
                type: 'recording', status: 'pending_upload',
                localPath: params.recordingPath,
                hint: 'Use google_drive_upload_file tool for large file upload, or the agent can use the browser to upload via drive.google.com',
              });
            }
          }

          return jsonResult({ saved: true, folderId, files: uploaded, count: uploaded.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Meeting Record (VM only) ──────────────────────
    {
      name: 'meeting_record',
      description: 'Start or stop recording the current meeting. Captures screen + audio using ffmpeg. REQUIRES: VM deployment with display + audio + ffmpeg. Not available on container deployments.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          action: { type: 'string', description: '"start" or "stop"' },
          outputPath: { type: 'string', description: 'Output file path (default: /tmp/meeting-recording-{timestamp}.mp4)' },
          display: { type: 'string', description: 'X11 display (default: :99)' },
          audioSource: { type: 'string', description: 'PulseAudio source (default: auto-detect virtual monitor)' },
        },
        required: ['action'],
      },
      async execute(_id: string, params: any) {
        const c = getCaps();
        if (!c.canRecordMeetings) {
          const summary = getCapabilitySummary(c);
          return errorResult(
            `Meeting recording is not available on this ${summary.deployment} deployment.\n` +
            `Missing: ${summary.unavailable.join(', ')}\n\n` +
            `${summary.recommendations.join('\n')}`
          );
        }

        if (params.action === 'start') {
          const output = params.outputPath || `/tmp/meeting-recording-${Date.now()}.mp4`;
          const display = params.display || process.env.DISPLAY || ':99';
          const audioSource = params.audioSource || 'default';

          // Return ffmpeg command for the agent to execute via bash tool
          const ffmpegCmd = [
            'ffmpeg', '-y',
            '-f', 'x11grab', '-video_size', '1920x1080', '-framerate', '15', '-i', display,
            '-f', 'pulse', '-i', audioSource,
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart',
            output,
          ].join(' ');

          return jsonResult({
            action: 'start',
            command: ffmpegCmd,
            outputPath: output,
            hint: 'Run this command in the background using the bash tool: `nohup ' + ffmpegCmd + ' &`\nTo stop recording later, use meeting_record with action="stop".',
          });
        }

        if (params.action === 'stop') {
          return jsonResult({
            action: 'stop',
            command: "pkill -INT -f 'ffmpeg.*meeting-recording'",
            hint: 'Run this command via bash tool to gracefully stop ffmpeg recording. Then use meeting_save to upload the recording to Drive.',
          });
        }

        return errorResult('action must be "start" or "stop"');
      },
    },

    // ─── Check Meeting Joinability ─────────────────────
    // NOTE: meeting_join is defined in google/meetings.ts — do NOT duplicate here
    {
      name: 'meeting_can_join',
      description: 'Check if this agent can join a video meeting on the current deployment. Returns capabilities and specific instructions based on what is available.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          platform: { type: 'string', description: 'Meeting platform: google_meet, zoom, teams' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        const c = getCaps();
        const summary = getCapabilitySummary(c);

        if (c.canJoinMeetings) {
          return jsonResult({
            canJoin: true,
            deployment: summary.deployment,
            capabilities: summary.available,
            instructions: [
              'Use the browser tool to navigate to the meeting URL.',
              'Take a snapshot to identify the pre-join screen.',
              'Use act to click mute/camera toggles and the join button.',
              'For Google Meet: use keyboard shortcuts Ctrl+D (mute) and Ctrl+E (camera).',
              params.platform === 'zoom' ? 'For Zoom: click "Join from Your Browser" to avoid the Zoom client.' : null,
              params.platform === 'teams' ? 'For Teams: click "Continue on this browser" to join in-browser.' : null,
            ].filter(Boolean),
            tips: [
              'Join with mic muted and camera off by default.',
              'Use meeting_record to capture the meeting.',
              'Use meeting_prepare first to create Drive folder + notes template.',
            ],
          });
        }

        // Can't join — give helpful alternatives
        return jsonResult({
          canJoin: false,
          deployment: summary.deployment,
          missing: summary.unavailable,
          recommendations: summary.recommendations,
          alternatives: [
            'Use meeting_prepare to create Drive folder with notes template.',
            'Use meetings_upcoming to monitor the calendar for meeting details.',
            'Use meetings_scan_inbox to find meeting links from email invites.',
            'Use meeting_rsvp to accept/decline meetings via Calendar API.',
            'After the meeting, use meeting_save to organize notes/recordings in Drive.',
            'For the agent to actually join meetings, deploy on a VM with: Xvfb + PulseAudio + Chromium + ffmpeg.',
          ],
          whatWorksHere: [
            'Calendar management (create, update, RSVP)',
            'Meeting prep (Drive folder + notes template)',
            'Post-meeting organization (notes, transcript, action items → Drive)',
            'Email/inbox scanning for meeting invites',
            'Scheduling and rescheduling meetings',
          ],
        });
      },
    },
  ];
}
