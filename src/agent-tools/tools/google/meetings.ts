/**
 * Google Meeting Tools
 *
 * Tools for detecting, managing, and joining meetings.
 * Uses Playwright browser automation for Google Meet interaction.
 * 
 * KEY DESIGN:
 * - aria-label selectors (most stable for Google Meet's changing DOM)
 * - MeetingMonitor for real-time caption/chat streaming (no manual polling)
 * - Robust chat sending with multiple fallback strategies
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { GoogleToolsConfig } from './index.js';
import { ensureBrowser } from '../browser.js';
import { MeetingMonitor, registerMonitor, getActiveMonitor, removeMonitor } from '../../../engine/meeting-monitor.js';
import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fs } from 'node:fs';

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

async function calendarApi(token: string, path: string, opts?: { method?: string; body?: any; query?: Record<string, string> }): Promise<any> {
  const url = new URL(CALENDAR_BASE + path);
  if (opts?.query) for (const [k, v] of Object.entries(opts.query)) { if (v) url.searchParams.set(k, v); }
  const res = await fetch(url.toString(), {
    method: opts?.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error(`Calendar API ${res.status}: ${await res.text()}`);
  return res.json();
}

function extractMeetingLink(event: any): { platform: string; url: string } | null {
  if (event.conferenceData?.entryPoints) {
    for (const ep of event.conferenceData.entryPoints) {
      if (ep.entryPointType === 'video' && ep.uri) return { platform: 'google_meet', url: ep.uri };
    }
  }
  if (event.hangoutLink) return { platform: 'google_meet', url: event.hangoutLink };
  const text = [event.description || '', event.location || ''].join(' ');
  const zoomMatch = text.match(/https:\/\/[\w.-]*zoom\.us\/[jw]\/[\d?=&\w]+/i);
  if (zoomMatch) return { platform: 'zoom', url: zoomMatch[0] };
  const teamsMatch = text.match(/https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>]+/i);
  if (teamsMatch) return { platform: 'teams', url: teamsMatch[0] };
  const genericMeet = text.match(/https:\/\/meet\.google\.com\/[a-z-]+/i);
  if (genericMeet) return { platform: 'google_meet', url: genericMeet[0] };
  return null;
}

function parseEventTime(event: any): { start: Date; end: Date } | null {
  const startStr = event.start?.dateTime || event.start?.date;
  const endStr = event.end?.dateTime || event.end?.date;
  if (!startStr) return null;
  return {
    start: new Date(startStr),
    end: endStr ? new Date(endStr) : new Date(new Date(startStr).getTime() + 3600000),
  };
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function saveScreenshot(page: any): Promise<{ path: string; base64: string }> {
  const buf = await page.screenshot({ type: 'png', fullPage: false });
  const dir = path.join(os.tmpdir(), 'agenticmail-screenshots');
  await fs.mkdir(dir, { recursive: true });
  const file = `meeting-${Date.now()}.png`;
  const filePath = path.join(dir, file);
  await fs.writeFile(filePath, buf);
  return { path: filePath, base64: buf.toString('base64') };
}

async function ariaClick(page: any, labels: string[], timeout = 5000): Promise<boolean> {
  for (const label of labels) {
    try { await page.click(`[aria-label*="${label}" i]`, { timeout }); return true; } catch {}
  }
  for (const label of labels) {
    try { await page.getByRole('button', { name: new RegExp(label, 'i') }).click({ timeout: 2000 }); return true; } catch {}
  }
  return false;
}

async function readCaptionsFromDOM(page: any): Promise<{ speaker: string; text: string }[]> {
  return page.evaluate(() => {
    const region = document.querySelector('[aria-label="Captions"]');
    if (region) {
      const entries: { speaker: string; text: string }[] = [];
      const children = region.querySelectorAll(':scope > div');
      for (const child of children) {
        const divs = child.querySelectorAll(':scope > div');
        if (divs.length >= 2) {
          entries.push({ speaker: divs[0].textContent?.trim() || '', text: divs[1].textContent?.trim() || '' });
        } else if (child.textContent?.trim()) {
          entries.push({ speaker: '', text: child.textContent.trim() });
        }
      }
      if (entries.length > 0) return entries;
    }
    const container = document.querySelector('.a4cQT');
    if (container) {
      const allText = (container as HTMLElement).innerText || '';
      const lines = allText.split('\n').filter((l: string) =>
        l.trim().length > 0 && !l.includes('BETA') && !l.includes('caption') &&
        !l.includes('Font size') && !l.includes('Font color') && l.trim().length < 500
      );
      if (lines.length > 0) return [{ speaker: '', text: lines.join(' ') }];
    }
    return [];
  });
}

/**
 * Robust chat message sending for Google Meet.
 * Tries multiple strategies because Meet's chat input is a React-controlled element.
 * For long messages, splits into chunks to avoid garbled text from keyboard.type().
 */
async function sendChatMessage(page: any, message: string): Promise<{ sent: boolean; method: string; error?: string }> {
  // Google Meet chat has a character limit (~500 chars). Split long messages into chunks.
  const MAX_CHUNK = 450;
  if (message.length > MAX_CHUNK) {
    const chunks = splitMessageIntoChunks(message, MAX_CHUNK);
    let allSent = true;
    let lastMethod = '';
    for (let i = 0; i < chunks.length; i++) {
      const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length}) ` : '';
      const result = await sendChatMessage(page, prefix + chunks[i]);
      if (!result.sent) {
        return { sent: false, method: result.method, error: `Failed on chunk ${i + 1}/${chunks.length}: ${result.error}` };
      }
      lastMethod = result.method;
      if (i < chunks.length - 1) await delay(800); // pause between chunks
    }
    return { sent: allSent, method: `chunked (${chunks.length}x) via ${lastMethod}` };
  }

  // ─── Open chat panel if needed ───
  try {
    const chatOpen = await page.evaluate(() => {
      const panel = document.querySelector('[aria-label="Side panel"]');
      if (!panel) return false;
      const text = (panel as HTMLElement).innerText || '';
      return text.includes('In-call messages') || text.includes('Send a message');
    });
    if (!chatOpen) {
      const clicked = await ariaClick(page, ['Chat with everyone', 'Open chat'], 3000);
      if (!clicked) {
        await page.keyboard.press('d');
      }
      await delay(1500);
    }
  } catch {}

  // ─── Find chat input ───
  const selectors = [
    'textarea[aria-label*="Send a message" i]',
    'input[aria-label*="Send a message" i]',
    '[aria-label*="Send a message" i][contenteditable]',
    'textarea[placeholder*="Send" i]',
    '[data-is-persistent="true"] textarea',
  ];

  for (const selector of selectors) {
    try {
      const el = page.locator(selector).first();
      const visible = await el.isVisible({ timeout: 2000 }).catch(() => false);
      if (!visible) continue;

      // Click to focus
      await el.click({ timeout: 2000 });
      await delay(200);

      // Clear any existing text
      await page.keyboard.press('Control+a');
      await delay(100);
      await page.keyboard.press('Backspace');
      await delay(100);

      // Strategy A: Clipboard paste (fast + reliable, no garbled text)
      try {
        await page.evaluate((text: string) => {
          navigator.clipboard.writeText(text);
        }, message);
        const isMac = process.platform === 'darwin';
        await page.keyboard.press(isMac ? 'Meta+v' : 'Control+v');
        await delay(300);
      } catch {
        // Clipboard failed — fall back to execCommand insertText (bypasses React, no char-by-char)
        try {
          await page.evaluate((text: string) => {
            const active = document.activeElement as HTMLTextAreaElement | HTMLInputElement;
            if (active && ('value' in active)) {
              // Use native setter for React-controlled inputs
              const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
                || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
              if (setter) {
                setter.call(active, text);
                active.dispatchEvent(new Event('input', { bubbles: true }));
                active.dispatchEvent(new Event('change', { bubbles: true }));
                return;
              }
            }
            // contenteditable fallback
            document.execCommand('insertText', false, text);
          }, message);
          await delay(300);
        } catch {
          // Last resort: keyboard.type — only for short messages
          if (message.length <= 100) {
            await page.keyboard.type(message, { delay: 20 });
            await delay(300);
          } else {
            continue; // skip this selector, try next
          }
        }
      }

      // Send with Enter
      await page.keyboard.press('Enter');
      await delay(500);

      // Verify: check if input is now empty (message was sent)
      const inputEmpty = await el.inputValue().then((v: string) => v.trim() === '').catch(() => true);
      if (inputEmpty) {
        return { sent: true, method: `paste + selector: ${selector}` };
      }
    } catch {}
  }

  return { sent: false, method: 'all strategies failed', error: 'Could not find or interact with the chat input. Try meeting_action(action: "screenshot") to see the current state.' };
}

/**
 * Split a long message into chunks, breaking at sentence/paragraph boundaries where possible.
 */
function splitMessageIntoChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    // Try to break at sentence boundary
    let breakIdx = -1;
    for (const sep of ['\n\n', '\n', '. ', '! ', '? ', ', ']) {
      const idx = remaining.lastIndexOf(sep, maxLen);
      if (idx > maxLen * 0.3) { // don't break too early
        breakIdx = idx + sep.length;
        break;
      }
    }
    if (breakIdx <= 0) breakIdx = maxLen; // hard break
    chunks.push(remaining.slice(0, breakIdx).trim());
    remaining = remaining.slice(breakIdx).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function joinGoogleMeet(page: any, url: string) {
  await page.goto(url, { timeout: 60000, waitUntil: 'domcontentloaded' });
  await delay(2000);

  // Dismiss dialogs
  for (let i = 0; i < 3; i++) {
    const dismissed = await ariaClick(page, ['Close'], 1500);
    if (!dismissed) break;
    await delay(300);
  }

  // Click join
  const joined = await ariaClick(page, ['Ask to join', 'Join now', 'Join'], 10000);
  if (!joined) {
    const screenshot = await saveScreenshot(page);
    return { joined: false, error: 'Could not find Join button.', screenshot: screenshot.path, screenshotBase64: screenshot.base64 };
  }

  await delay(3000);

  const state = await page.evaluate(() => {
    const text = document.body.innerText || '';
    if (text.includes('Please wait until a meeting host')) return 'waiting_room';
    if (text.includes('You have joined the call') || text.includes('Leave call')) return 'in_call';
    if (text.includes('Ask to join')) return 'pre_join';
    return 'unknown';
  });

  const screenshot = await saveScreenshot(page);
  return {
    joined: state === 'in_call' || state === 'waiting_room',
    state,
    url: page.url(),
    screenshot: screenshot.path,
    screenshotBase64: screenshot.base64,
  };
}


export function createMeetingTools(config: GoogleToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;
  const agentId = (_options as any)?.agentId || 'default';
  const runtimeRef = (_options as any)?.runtimeRef;

  return [
    // ─── Upcoming Meetings ─────────────────────────────
    {
      name: 'meetings_upcoming',
      description: 'List upcoming meetings with join links, times, and attendees from Google Calendar.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          hours: { type: 'number', description: 'Look ahead this many hours (default: 24)' },
          calendarId: { type: 'string', description: 'Calendar ID (default: "primary")' },
          includeDeclined: { type: 'string', description: '"true" to include declined meetings' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const hours = params.hours || 24;
          const now = new Date();
          const later = new Date(now.getTime() + hours * 3600000);
          const calendarId = params.calendarId || 'primary';

          const data = await calendarApi(token, `/calendars/${encodeURIComponent(calendarId)}/events`, {
            query: {
              timeMin: now.toISOString(),
              timeMax: later.toISOString(),
              singleEvents: 'true',
              orderBy: 'startTime',
              maxResults: '50',
            },
          });

          const meetings = (data.items || [])
            .map((event: any) => {
              const times = parseEventTime(event);
              const meetingLink = extractMeetingLink(event);
              const myStatus = (event.attendees || []).find((a: any) => a.self)?.responseStatus;
              if (params.includeDeclined !== 'true' && myStatus === 'declined') return null;
              return {
                id: event.id,
                title: event.summary,
                start: times?.start?.toISOString(),
                end: times?.end?.toISOString(),
                startsIn: times ? Math.round((times.start.getTime() - now.getTime()) / 60000) + ' minutes' : null,
                isNow: times ? now >= times.start && now <= times.end : false,
                meetingLink: meetingLink?.url || null,
                platform: meetingLink?.platform || null,
                organizer: event.organizer?.email,
                attendees: (event.attendees || []).map((a: any) => ({
                  email: a.email, name: a.displayName, status: a.responseStatus, self: a.self || false,
                })),
                myStatus,
                description: event.description?.slice(0, 500),
                location: event.location,
              };
            })
            .filter(Boolean);

          return jsonResult({
            meetings,
            total: meetings.length,
            withMeetingLinks: meetings.filter((m: any) => m.meetingLink).length,
            happeningNow: meetings.filter((m: any) => m.isNow).length,
            nextMeeting: meetings[0] || null,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Join Meeting ──────────────────────────────────
    {
      name: 'meeting_join',
      description: `Join a Google Meet video meeting. After joining:
- Captions are auto-enabled
- A MeetingMonitor starts streaming captions and chat to you in real-time
- You will receive "[Meeting Monitor — Live Update]" messages with new captions/chat
- When someone talks to you, respond using meeting_action(action: "chat", message: "...")
- You do NOT need to manually poll for captions — they come to you automatically
- The monitor will tell you when the meeting ends`,
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          url: { type: 'string', description: 'Meeting URL (Google Meet link)' },
          eventId: { type: 'string', description: 'Google Calendar event ID — will auto-extract the meeting link' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          let meetingUrl = params.url;

          if (!meetingUrl && params.eventId) {
            const event = await calendarApi(token, `/calendars/primary/events/${params.eventId}`);
            const link = extractMeetingLink(event);
            if (!link) return errorResult('No meeting link found in calendar event: ' + (event.summary || params.eventId));
            meetingUrl = link.url;
          }

          if (!meetingUrl) return errorResult('No meeting URL provided. Pass url or eventId.');

          // Launch browser
          const { page } = await ensureBrowser(false, agentId, false);
          const result = await joinGoogleMeet(page, meetingUrl);

          if (result.joined) {
            // For in_call: enable captions + open chat + send intro immediately
            // For waiting_room: just start the monitor (it will detect admission)
            if (result.state === 'in_call' || result.state === 'unknown') {
              try {
                await page.keyboard.press('c'); // enable captions
                await delay(1000);
              } catch {}
              try {
                await page.keyboard.press('d'); // open chat panel
                await delay(1500);
                const chatResult = await sendChatMessage(page, `Hi, I'm joining to take notes. I'll communicate via chat.`);
                console.log(`[meeting-join:${agentId}] Intro chat: ${chatResult.sent ? 'sent' : 'failed'} (${chatResult.method})`);
              } catch {}
            }

            // ─── Start MeetingMonitor (only when in-call, NOT in waiting room) ───
            if (runtimeRef?.sendMessage && runtimeRef?.getCurrentSessionId) {
              const sessionId = runtimeRef.getCurrentSessionId();
              if (sessionId) {
                // Mark session as keep-alive BEFORE starting monitor
                if (runtimeRef.setKeepAlive) {
                  runtimeRef.setKeepAlive(sessionId, true);
                }

                // Helper to start the monitor (reused for immediate start and after admission)
                const startMonitor = async () => {
                  const monitor = new MeetingMonitor({
                    page,
                    agentId,
                    sessionId,
                    sendMessage: runtimeRef.sendMessage,
                    flushIntervalMs: 2_500,
                    sendChatIndicator: async (p: any, text: string) => {
                      try { await sendChatMessage(p, text); } catch {}
                    },
                    onMeetingEnd: () => {
                      console.log(`[meeting-join:${agentId}] Monitor detected meeting end`);
                      removeMonitor(agentId);
                      if (runtimeRef.setKeepAlive) {
                        runtimeRef.setKeepAlive(sessionId, false);
                      }
                    },
                  });
                  registerMonitor(agentId, monitor);
                  await monitor.start();
                  console.log(`[meeting-join:${agentId}] ✅ MeetingMonitor started for session ${sessionId}, keep-alive ON`);
                };

                if (result.state === 'in_call' || result.state === 'unknown') {
                  // Already in the call — start monitor immediately
                  await startMonitor();
                }

                // If in waiting room, DON'T start the monitor yet — wait for admission
                if (result.state === 'waiting_room') {
                  console.log(`[meeting-join:${agentId}] In waiting room — monitor will start after admission`);
                  const admissionWatcher = setInterval(async () => {
                    try {
                      const currentState = await page.evaluate(() => {
                        const text = document.body.innerText || '';
                        if (text.includes('Please wait until a meeting host')) return 'waiting_room';
                        if (text.includes('Leave call')) return 'in_call';
                        if (text.includes("You've left the meeting") || text.includes('Call ended')) return 'ended';
                        return 'unknown';
                      });
                      if (currentState === 'in_call' || currentState === 'unknown') {
                        clearInterval(admissionWatcher);
                        console.log(`[meeting-join:${agentId}] ✅ Admitted to meeting!`);
                        // Enable captions
                        try { await page.keyboard.press('c'); await delay(1000); } catch {}
                        // Open chat + send intro
                        try {
                          await page.keyboard.press('d');
                          await delay(1500);
                          await sendChatMessage(page, `Hi, I'm joining to take notes. I'll communicate via chat.`);
                        } catch {}
                        // NOW start the monitor (safe — no concurrent loop issue)
                        try { await startMonitor(); } catch (e: any) {
                          console.error(`[meeting-join:${agentId}] Failed to start monitor after admission: ${e.message}`);
                        }
                        // Notify the agent session
                        try {
                          await runtimeRef.sendMessage(sessionId,
                            `[Meeting Monitor] You have been admitted to the meeting! Captions are now enabled. Chat panel is open. You will start receiving live updates.`
                          );
                        } catch {}
                      } else if (currentState === 'ended') {
                        clearInterval(admissionWatcher);
                        console.log(`[meeting-join:${agentId}] Meeting ended while in waiting room`);
                        if (runtimeRef.setKeepAlive) runtimeRef.setKeepAlive(sessionId, false);
                      }
                    } catch {
                      clearInterval(admissionWatcher);
                    }
                  }, 5000);
                }
              }
            } else {
              console.warn(`[meeting-join:${agentId}] No runtimeRef — MeetingMonitor NOT started`);
            }
          }

          const joinResult = {
            ...result,
            screenshotBase64: undefined,
            monitorActive: !!getActiveMonitor(agentId),
            instructions: result.joined
              ? getActiveMonitor(agentId)
                ? 'You are in the meeting. A MeetingMonitor is streaming captions and chat to you automatically. You will receive "[Meeting Monitor — Live Update]" messages. When someone talks to you, use meeting_action(action: "chat", message: "your response"). You do NOT need to call read_captions — updates come to you.'
                : 'You are in the meeting. Captions are enabled. Call meeting_action(action: "read_captions") periodically to see what people are saying. Use meeting_action(action: "chat", message: "...") to respond.'
              : 'Join failed. Check screenshot.',
          };

          if (result.screenshotBase64) {
            return {
              content: [
                { type: 'text', text: JSON.stringify(joinResult, null, 2) },
                { type: 'image', data: result.screenshotBase64, mimeType: 'image/png' },
              ],
            };
          }
          return jsonResult(joinResult);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Meeting Actions ───────────────────────────────
    {
      name: 'meeting_action',
      description: `Perform actions during an active Google Meet meeting:
- screenshot: Take a screenshot of the current meeting state
- read_captions: Read live captions (Note: if MeetingMonitor is active, captions come to you automatically — use this only for on-demand reads)
- read_chat: Read in-call chat messages
- chat: Send a message in the meeting chat (requires "message" param). Uses robust multi-strategy input.
- participants: List meeting participants
- toggle_captions: Turn captions on/off
- share_screen: Share your entire screen with meeting participants
- share_tab: Share a specific browser tab (optional "url" param to open a URL in a new tab and share it)
- stop_sharing: Stop any active screen/tab sharing
- leave: Leave the meeting and stop the monitor`,
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          action: { type: 'string', description: 'Action to perform' },
          message: { type: 'string', description: 'Chat message to send (for "chat" action)' },
          url: { type: 'string', description: 'URL to open and share (for "share_tab" action)' },
        },
        required: ['action'],
      },
      async execute(_id: string, params: any) {
        try {
          const action = params.action;

          let page: any;
          try {
            const result = await ensureBrowser(false, agentId, false);
            page = result.page;
          } catch (err: any) {
            return errorResult('No active browser session. Join a meeting first with meeting_join.');
          }

          const pageUrl = page.url() || '';
          if (!pageUrl.includes('meet.google.com')) {
            return errorResult(`Not on a Google Meet page (current URL: ${pageUrl}). Join a meeting first.`);
          }

          switch (action) {
            case 'screenshot': {
              const screenshot = await saveScreenshot(page);
              return {
                content: [
                  { type: 'text', text: `Meeting screenshot taken.\nURL: ${pageUrl}\nSaved: ${screenshot.path}` },
                  { type: 'image', data: screenshot.base64, mimeType: 'image/png' },
                ],
              };
            }

            case 'read_captions': {
              const captionsOn = await page.evaluate(() => !!document.querySelector('[aria-label*="Turn off captions"]'));
              if (!captionsOn) {
                await page.keyboard.press('c');
                await delay(1500);
              }
              const captions = await readCaptionsFromDOM(page);
              const monitor = getActiveMonitor(agentId);
              return jsonResult({
                action: 'read_captions',
                captions,
                count: captions.length,
                captionsEnabled: true,
                monitorActive: !!monitor,
                note: monitor
                  ? 'MeetingMonitor is active — captions are being streamed to you automatically. You only need this tool for on-demand reads.'
                  : 'No monitor active. Call this periodically to stay updated.',
              });
            }

            case 'toggle_captions': {
              await page.keyboard.press('c');
              await delay(500);
              const isOn = await page.evaluate(() => !!document.querySelector('[aria-label*="Turn off captions"]'));
              return jsonResult({ action: 'toggle_captions', captionsOn: isOn });
            }

            case 'read_chat': {
              await ariaClick(page, ['Chat with everyone', 'Open chat'], 3000);
              await delay(1000);
              const messages = await page.evaluate(() => {
                const msgs: { sender: string; text: string }[] = [];
                const panel = document.querySelector('[aria-label="Side panel"]') ||
                              document.querySelector('[aria-label*="In-call messages"]');
                if (!panel) return msgs;
                const msgEls = panel.querySelectorAll('[data-message-text]');
                for (const el of msgEls) {
                  const text = el.getAttribute('data-message-text') || el.textContent?.trim() || '';
                  let sender = '';
                  const parent = el.closest('[class*="message"]') || (el as HTMLElement).parentElement?.parentElement;
                  if (parent) {
                    const nameEl = parent.querySelector('[class*="sender"], [class*="name"]');
                    if (nameEl) sender = nameEl.textContent?.trim() || '';
                  }
                  if (text) msgs.push({ sender, text });
                }
                if (msgs.length === 0) {
                  const allText = (panel as HTMLElement).innerText || '';
                  const lines = allText.split('\n').filter((l: string) =>
                    l.trim().length > 0 && l.trim() !== 'In-call messages' &&
                    !l.includes('Continuous chat') && !l.includes("Messages won't be saved") &&
                    !l.includes('No chat messages') && !l.includes('Send a message') &&
                    !l.includes('pin a message') && l.trim().length < 500
                  );
                  for (const line of lines) msgs.push({ sender: '', text: line.trim() });
                }
                return msgs;
              });
              return jsonResult({ action: 'read_chat', messages, count: messages.length });
            }

            case 'chat': {
              const message = params.message;
              if (!message) return errorResult('No message provided. Set the "message" parameter.');
              const result = await sendChatMessage(page, message);
              if (result.sent) {
                return jsonResult({ action: 'chat', status: 'sent', message, method: result.method });
              } else {
                return errorResult(`Failed to send chat message: ${result.error}. Method: ${result.method}`);
              }
            }

            case 'participants': {
              await ariaClick(page, ['People'], 3000);
              await delay(1000);
              const participants = await page.evaluate(() => {
                const names: string[] = [];
                const panel = document.querySelector('[aria-label="Side panel"]');
                if (!panel) return names;
                const items = panel.querySelectorAll('[class*="participant"], [data-participant-id], [role="listitem"]');
                for (const item of items) {
                  const name = item.textContent?.trim();
                  if (name && name.length < 100) names.push(name);
                }
                if (names.length === 0) {
                  const tiles = document.querySelectorAll('[data-self-name], [data-participant-id]');
                  for (const t of tiles) {
                    const n = t.getAttribute('data-self-name') || t.textContent?.trim();
                    if (n && n.length < 100) names.push(n);
                  }
                }
                return [...new Set(names)];
              });
              await ariaClick(page, ['Close'], 1500);
              return jsonResult({ action: 'participants', participants, count: participants.length });
            }

            case 'share_screen': {
              // Share entire screen in Google Meet
              // Requires --auto-select-desktop-capture-source=Entire screen in browser launch args
              try {
                // Click "Present now" button
                const clicked = await ariaClick(page, ['Present now', 'Share screen', 'Present'], 5000);
                if (!clicked) return errorResult('Could not find "Present now" button. Are you in an active meeting?');
                await delay(1500);

                // Select "Your entire screen" option
                const entireScreen = await ariaClick(page, ['Your entire screen', 'Entire screen', 'A window'], 5000);
                if (!entireScreen) {
                  // Try clicking the first presentation option directly
                  const firstOption = await page.evaluate(() => {
                    const options = document.querySelectorAll('[role="menuitem"], [role="option"], [data-is-tooltip-wrapper]');
                    for (const opt of options) {
                      const text = (opt as HTMLElement).textContent?.toLowerCase() || '';
                      if (text.includes('entire screen') || text.includes('your screen') || text.includes('a window')) {
                        (opt as HTMLElement).click();
                        return true;
                      }
                    }
                    return false;
                  });
                  if (!firstOption) return errorResult('Could not select screen sharing option. The sharing menu may have changed.');
                }
                await delay(2000);

                // The --auto-select-desktop-capture-source flag should auto-accept the OS dialog
                // Verify sharing started by checking for "Stop presenting" or "You are presenting" indicators
                const isSharing = await page.evaluate(() => {
                  const indicators = document.querySelectorAll('[aria-label*="Stop presenting"], [aria-label*="stop sharing"], [aria-label*="You are presenting"]');
                  return indicators.length > 0;
                });

                return jsonResult({
                  action: 'share_screen',
                  status: isSharing ? 'sharing' : 'initiated',
                  type: 'entire_screen',
                  note: isSharing
                    ? 'Screen sharing is active. Use meeting_action(action: "stop_sharing") to stop.'
                    : 'Screen sharing was initiated. The OS picker may require manual confirmation if auto-select did not work.',
                });
              } catch (e: any) {
                return errorResult(`Failed to share screen: ${e.message}`);
              }
            }

            case 'share_tab': {
              // Share a specific browser tab in Google Meet
              // This is cleaner than full screen — only shows one tab
              const targetUrl = params.url || params.targetUrl;
              try {
                // If a URL was specified, open it in a new tab first
                if (targetUrl) {
                  const newPage = await page.context().newPage();
                  await newPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                  await delay(1000);
                  // Switch back to Meet tab to initiate sharing
                  await page.bringToFront();
                  await delay(500);
                }

                // Click "Present now"
                const clicked = await ariaClick(page, ['Present now', 'Share screen', 'Present'], 5000);
                if (!clicked) return errorResult('Could not find "Present now" button.');
                await delay(1500);

                // Select "A tab" option
                const tabOption = await ariaClick(page, ['A tab', 'Chrome tab', 'Browser tab'], 5000);
                if (!tabOption) {
                  // Fallback: try to find tab option in menu
                  const found = await page.evaluate(() => {
                    const items = document.querySelectorAll('[role="menuitem"], [role="option"], [data-is-tooltip-wrapper]');
                    for (const item of items) {
                      const text = (item as HTMLElement).textContent?.toLowerCase() || '';
                      if (text.includes('tab')) {
                        (item as HTMLElement).click();
                        return true;
                      }
                    }
                    return false;
                  });
                  if (!found) return errorResult('Could not find "A tab" option in sharing menu.');
                }
                await delay(2000);

                // The tab picker is a browser-native dialog — the auto-capture flag may handle it
                // If a specific tab was opened, it should be the most recent and auto-selected
                const isSharing = await page.evaluate(() => {
                  const indicators = document.querySelectorAll('[aria-label*="Stop presenting"], [aria-label*="stop sharing"], [aria-label*="You are presenting"]');
                  return indicators.length > 0;
                });

                return jsonResult({
                  action: 'share_tab',
                  status: isSharing ? 'sharing' : 'initiated',
                  type: 'browser_tab',
                  targetUrl: targetUrl || null,
                  note: isSharing
                    ? 'Tab sharing is active. Use meeting_action(action: "stop_sharing") to stop.'
                    : 'Tab sharing initiated. You may need to select the tab in the browser picker.',
                });
              } catch (e: any) {
                return errorResult(`Failed to share tab: ${e.message}`);
              }
            }

            case 'stop_sharing': {
              // Stop any active screen/tab sharing
              try {
                // Method 1: Click "Stop presenting" button (most reliable)
                const stopped = await ariaClick(page, ['Stop presenting', 'Stop sharing', 'Stop presentation'], 3000);
                if (stopped) {
                  await delay(500);
                  return jsonResult({ action: 'stop_sharing', status: 'stopped' });
                }

                // Method 2: Look for the stop button in the presenting bar
                const clickedStop = await page.evaluate(() => {
                  // Google Meet shows a "You are presenting" bar with a Stop button
                  const buttons = document.querySelectorAll('button');
                  for (const btn of buttons) {
                    const text = btn.textContent?.toLowerCase() || '';
                    const label = btn.getAttribute('aria-label')?.toLowerCase() || '';
                    if (text.includes('stop') && (text.includes('present') || text.includes('shar')) ||
                        label.includes('stop') && (label.includes('present') || label.includes('shar'))) {
                      btn.click();
                      return true;
                    }
                  }
                  return false;
                });

                if (clickedStop) {
                  await delay(500);
                  return jsonResult({ action: 'stop_sharing', status: 'stopped' });
                }

                return jsonResult({ action: 'stop_sharing', status: 'no_active_share', note: 'No active screen share was detected.' });
              } catch (e: any) {
                return errorResult(`Failed to stop sharing: ${e.message}`);
              }
            }

            case 'leave': {
              // Stop the monitor and release keep-alive
              removeMonitor(agentId);
              if (runtimeRef?.setKeepAlive && runtimeRef?.getCurrentSessionId) {
                const sid = runtimeRef.getCurrentSessionId();
                if (sid) runtimeRef.setKeepAlive(sid, false);
              }
              await ariaClick(page, ['Leave call'], 3000);
              return jsonResult({ action: 'leave', status: 'left_meeting', monitorStopped: true, keepAliveReleased: true });
            }

            default:
              return errorResult(`Unknown action: "${action}". Supported: screenshot, read_captions, read_chat, chat, participants, toggle_captions, share_screen, share_tab, stop_sharing, leave`);
          }
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Detect Meeting Invites in Email ───────────────
    {
      name: 'meetings_scan_inbox',
      description: 'Scan recent emails for meeting invitations and extract meeting links.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          hours: { type: 'number', description: 'Scan emails from last N hours (default: 24)' },
          maxResults: { type: 'number', description: 'Max emails to scan (default: 30)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const hours = params.hours || 24;
          const after = new Date(Date.now() - hours * 3600000);
          const dateStr = `${after.getFullYear()}/${String(after.getMonth() + 1).padStart(2, '0')}/${String(after.getDate()).padStart(2, '0')}`;

          const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
          const query = `after:${dateStr} (meet.google.com OR zoom.us OR teams.microsoft.com OR "meeting invitation" OR filename:ics)`;
          const searchUrl = new URL(`${GMAIL_BASE}/messages`);
          searchUrl.searchParams.set('q', query);
          searchUrl.searchParams.set('maxResults', String(params.maxResults || 30));

          const searchRes = await fetch(searchUrl.toString(), { headers: { Authorization: `Bearer ${token}` } });
          if (!searchRes.ok) throw new Error(`Gmail search failed: ${searchRes.status}`);
          const searchData = await searchRes.json() as any;

          if (!searchData.messages?.length) {
            return jsonResult({ meetings: [], count: 0, message: 'No meeting invites found in the last ' + hours + ' hours' });
          }

          const meetings: any[] = [];
          for (const msg of searchData.messages.slice(0, 20)) {
            try {
              const msgRes = await fetch(`${GMAIL_BASE}/messages/${msg.id}?format=full`, { headers: { Authorization: `Bearer ${token}` } });
              if (!msgRes.ok) continue;
              const msgData = await msgRes.json() as any;
              const headers = msgData.payload?.headers || [];
              const subject = headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value || '';
              const from = headers.find((h: any) => h.name?.toLowerCase() === 'from')?.value || '';
              const date = headers.find((h: any) => h.name?.toLowerCase() === 'date')?.value || '';

              let bodyText = '';
              function walkParts(part: any) {
                if (part.body?.data) bodyText += Buffer.from(part.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8') + ' ';
                if (part.parts) part.parts.forEach(walkParts);
              }
              walkParts(msgData.payload);

              const meetLinks: any[] = [];
              const patterns = [
                { regex: /https:\/\/meet\.google\.com\/[a-z-]+/gi, platform: 'google_meet' },
                { regex: /https:\/\/[\w.-]*zoom\.us\/[jw]\/[\d?=&\w]+/gi, platform: 'zoom' },
                { regex: /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>]+/gi, platform: 'teams' },
              ];
              for (const p of patterns) {
                const matches = bodyText.match(p.regex);
                if (matches) for (const url of [...new Set(matches)]) meetLinks.push({ platform: p.platform, url });
              }
              if (meetLinks.length > 0) meetings.push({ messageId: msg.id, subject, from, date, meetingLinks: meetLinks, snippet: msgData.snippet?.slice(0, 200) });
            } catch {}
          }
          return jsonResult({ meetings, count: meetings.length, scannedEmails: searchData.messages.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── RSVP to Meeting ───────────────────────────────
    {
      name: 'meeting_rsvp',
      description: 'Accept or decline a Google Calendar meeting invitation.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          eventId: { type: 'string', description: 'Calendar event ID (required)' },
          response: { type: 'string', description: '"accepted", "declined", or "tentative" (required)' },
          calendarId: { type: 'string', description: 'Calendar ID (default: "primary")' },
        },
        required: ['eventId', 'response'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const calendarId = params.calendarId || 'primary';
          const email = tp.getEmail();
          const event = await calendarApi(token, `/calendars/${encodeURIComponent(calendarId)}/events/${params.eventId}`);
          const attendees = (event.attendees || []).map((a: any) => {
            if (a.self || a.email === email) return { ...a, responseStatus: params.response };
            return a;
          });
          if (!attendees.find((a: any) => a.self || a.email === email)) {
            attendees.push({ email, responseStatus: params.response });
          }
          const updated = await calendarApi(token, `/calendars/${encodeURIComponent(calendarId)}/events/${params.eventId}`, {
            method: 'PATCH',
            query: { sendUpdates: 'all' },
            body: { attendees },
          });
          const link = extractMeetingLink(updated);
          return jsonResult({
            rsvp: params.response,
            eventId: params.eventId,
            title: updated.summary,
            start: updated.start?.dateTime || updated.start?.date,
            meetingLink: link?.url,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
