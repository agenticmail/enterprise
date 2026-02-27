/**
 * Meeting Monitor — Real-time caption & chat streaming for Google Meet
 * 
 * Instead of the agent manually polling captions, this system:
 * 1. Injects a MutationObserver into the Meet page that captures captions + chat in real-time
 * 2. A server-side interval reads the buffer every N seconds
 * 3. New content is injected as user messages into the agent's session
 * 4. The agent processes them naturally and can respond via chat
 * 
 * This solves the "agent stops looping" problem — captions come TO the agent.
 */

// Use 'any' for Page type — Playwright types may not be available at compile time
type Page = any;

export interface MeetingMonitorConfig {
  /** Playwright page with active Google Meet */
  page: Page;
  /** Agent ID */
  agentId: string;
  /** Session ID to inject messages into */
  sessionId: string;
  /** Callback to send a message to the agent session */
  sendMessage: (sessionId: string, message: string) => Promise<void>;
  /** How often to flush buffered content to agent (ms, default 12000) */
  flushIntervalMs?: number;
  /** Callback when meeting ends */
  onMeetingEnd?: () => void;
  /** Optional: send a quick chat message in Meet (for typing indicators) */
  sendChatIndicator?: (page: Page, text: string) => Promise<void>;
}

interface CaptionEntry {
  speaker: string;
  text: string;
  timestamp: number;
}

interface ChatEntry {
  sender: string;
  text: string;
  timestamp: number;
}

export class MeetingMonitor {
  private page: Page;
  private agentId: string;
  private sessionId: string;
  private sendMessage: (sessionId: string, message: string) => Promise<void>;
  private flushIntervalMs: number;
  private onMeetingEnd?: () => void;
  private sendChatIndicator?: (page: Page, text: string) => Promise<void>;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastCaptionCount = 0;
  private lastChatCount = 0;
  private consecutiveEmpty = 0;
  private consecutiveSendFailures = 0;
  /** Pending captions accumulated across flush cycles (for debouncing) */
  private pendingCaptions: CaptionEntry[] = [];
  /** Pending chat messages (chat is NOT debounced — always flush immediately) */
  private pendingChat: ChatEntry[] = [];
  /** Timestamp of last new caption arrival — used for silence gap detection */
  private lastCaptionArrival = 0;
  /** Minimum silence gap in ms before flushing captions (wait for speaker to finish) */
  private silenceGapMs = 2000;
  /** Minimum total caption text length to flush (skip filler fragments) */
  private minCaptionLength = 20;

  constructor(config: MeetingMonitorConfig) {
    this.page = config.page;
    this.agentId = config.agentId;
    this.sessionId = config.sessionId;
    this.sendMessage = config.sendMessage;
    this.flushIntervalMs = config.flushIntervalMs || 2_000; // Poll every 2s to catch silence gaps quickly
    this.onMeetingEnd = config.onMeetingEnd;
    this.sendChatIndicator = config.sendChatIndicator;
  }

  /**
   * Start monitoring. Injects DOM observers and begins flushing.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Inject the caption/chat observer into the page
    await this.injectObserver();

    // Start the flush loop
    this.flushTimer = setInterval(() => this.flush().catch(err => {
      console.error(`[meeting-monitor:${this.agentId}] Flush error:`, err.message);
    }), this.flushIntervalMs);

    console.log(`[meeting-monitor:${this.agentId}] Started monitoring (flush every ${this.flushIntervalMs}ms)`);
  }

  /**
   * Stop monitoring and clean up.
   */
  stop(): void {
    this.running = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    console.log(`[meeting-monitor:${this.agentId}] Stopped`);
  }

  /**
   * Inject MutationObserver-based caption/chat capture into the page.
   * Uses window.__meetingBuffer as the shared state.
   */
  private async injectObserver(): Promise<void> {
    await this.page.evaluate(() => {
      // Initialize buffer
      (window as any).__meetingBuffer = {
        captions: [] as { speaker: string; text: string; ts: number }[],
        chat: [] as { sender: string; text: string; ts: number }[],
        ended: false,
        lastCaptionText: '',
      };

      const buf = (window as any).__meetingBuffer;

      // ─── Caption Observer ───
      // Google Meet captions appear in region[aria-label="Captions"] or .a4cQT
      // They update in-place (replacing text), so we poll the DOM state
      const captionPoller = setInterval(() => {
        // Check if meeting ended (redirected away from meet.google.com)
        if (!location.href.includes('meet.google.com')) {
          buf.ended = true;
          clearInterval(captionPoller);
          return;
        }

        // Check for "You've left the meeting" or "Call ended" text
        const bodyText = document.body.innerText || '';
        if (bodyText.includes("You've left the meeting") || bodyText.includes('Call ended') || bodyText.includes('Return to home screen')) {
          buf.ended = true;
          clearInterval(captionPoller);
          return;
        }

        // Read current caption state
        const region = document.querySelector('[aria-label="Captions"]');
        if (!region) return;

        const entries: { speaker: string; text: string }[] = [];
        const children = region.querySelectorAll(':scope > div');
        for (const child of children) {
          const divs = child.querySelectorAll(':scope > div');
          if (divs.length >= 2) {
            entries.push({
              speaker: divs[0].textContent?.trim() || '',
              text: divs[1].textContent?.trim() || '',
            });
          } else if (child.textContent?.trim()) {
            entries.push({ speaker: '', text: child.textContent.trim() });
          }
        }

        if (entries.length === 0) return;

        // Build current snapshot text for dedup
        const currentText = entries.map(e => `${e.speaker}: ${e.text}`).join(' | ');
        if (currentText === buf.lastCaptionText) return; // no change
        buf.lastCaptionText = currentText;

        // Add to buffer
        const ts = Date.now();
        for (const e of entries) {
          buf.captions.push({ speaker: e.speaker, text: e.text, ts });
        }
      }, 2000); // poll every 2s

      // ─── Chat Observer ───
      // Watch for new chat messages via MutationObserver on the side panel
      const chatObserver = new MutationObserver(() => {
        const panel = document.querySelector('[aria-label="Side panel"]') ||
                      document.querySelector('[aria-label*="In-call messages"]');
        if (!panel) return;

        // Read all message elements
        const msgEls = panel.querySelectorAll('[data-message-text]');
        const currentCount = msgEls.length;
        const prevCount = (window as any).__lastChatCount || 0;

        if (currentCount > prevCount) {
          // New messages — grab only the new ones
          for (let i = prevCount; i < currentCount; i++) {
            const el = msgEls[i];
            const text = el.getAttribute('data-message-text') || el.textContent?.trim() || '';
            // Try to find sender (usually a sibling or parent element)
            let sender = '';
            const parentMsg = el.closest('[class*="message"]') || el.parentElement?.parentElement;
            if (parentMsg) {
              const nameEl = parentMsg.querySelector('[class*="sender"], [class*="name"], [data-sender-id]');
              if (nameEl) sender = nameEl.textContent?.trim() || '';
            }
            if (text) {
              buf.chat.push({ sender, text, ts: Date.now() });
            }
          }
          (window as any).__lastChatCount = currentCount;
        }
      });

      // Observe the entire body for chat panel changes (Meet adds it dynamically)
      chatObserver.observe(document.body, { childList: true, subtree: true });

      // Also set up a simpler fallback: poll the chat panel text
      let lastChatSnapshot = '';
      setInterval(() => {
        const panel = document.querySelector('[aria-label="Side panel"]') ||
                      document.querySelector('[aria-label*="In-call messages"]');
        if (!panel) return;
        
        const text = (panel as HTMLElement).innerText || '';
        // Filter out static UI elements
        const lines = text.split('\n').filter(l =>
          l.trim().length > 0 &&
          l.trim() !== 'In-call messages' &&
          !l.includes('Continuous chat') &&
          !l.includes("Messages won't be saved") &&
          !l.includes('No chat messages') &&
          !l.includes('Send a message') &&
          !l.includes('pin a message') &&
          l.trim().length < 500
        );
        const snapshot = lines.join('\n');
        if (snapshot !== lastChatSnapshot && snapshot.length > 0) {
          // Just update the snapshot — the MutationObserver handles new message detection
          lastChatSnapshot = snapshot;
        }
      }, 3000);
    });
  }

  /**
   * Read buffered content from the page and decide whether to send to agent.
   * 
   * KEY DESIGN: Captions are DEBOUNCED. We accumulate them and only flush when:
   * 1. There's a silence gap (no new captions for 8+ seconds) — speaker finished talking
   * 2. Accumulated text is substantial enough (30+ chars) — skip "um", "eh" fragments
   * 3. Hard cap of 60 seconds — flush regardless to prevent infinite buffering
   * 
   * Chat messages are NOT debounced — they flush immediately (someone typed a message).
   */
  private async flush(): Promise<void> {
    if (!this.running) return;

    // ─── Step 1: Drain raw buffer from browser page ───
    let bufferData: { captions: CaptionEntry[]; chat: ChatEntry[]; ended: boolean };
    try {
      bufferData = await this.page.evaluate(() => {
        const buf = (window as any).__meetingBuffer;
        if (!buf) return { captions: [], chat: [], ended: false };
        const result = {
          captions: [...buf.captions],
          chat: [...buf.chat],
          ended: buf.ended,
        };
        buf.captions = [];
        buf.chat = [];
        return result;
      });
    } catch (err: any) {
      console.log(`[meeting-monitor:${this.agentId}] Page closed, stopping monitor`);
      this.stop();
      this.onMeetingEnd?.();
      return;
    }

    // ─── Step 2: Check if meeting ended ───
    if (bufferData.ended) {
      // Flush any remaining pending content first
      if (this.pendingCaptions.length > 0) {
        await this.sendUpdate(this.pendingCaptions, []);
        this.pendingCaptions = [];
      }
      console.log(`[meeting-monitor:${this.agentId}] Meeting ended`);
      try {
        await this.sendMessage(this.sessionId,
          `[Meeting Monitor] The meeting has ended. Please save any meeting notes and email a summary to your manager if appropriate.`
        );
      } catch {}
      this.stop();
      this.onMeetingEnd?.();
      return;
    }

    // ─── Step 3: Interruption detection ───
    // If someone starts talking while the agent is speaking, interrupt gracefully
    if (bufferData.captions.length > 0) {
      try {
        const { getActiveVoiceIntelligence } = await import('./meeting-voice-intelligence.js');
        const voiceIntel = getActiveVoiceIntelligence(this.agentId);
        if (voiceIntel?.audioController?.isPlaying) {
          const interrupterText = bufferData.captions.map(c => c.text).join(' ');
          console.log(`[meeting-monitor:${this.agentId}] Interruption detected while agent speaking`);
          await voiceIntel.handleInterruption(interrupterText);
        }
      } catch {} // Voice intelligence not available
    }

    // ─── Step 4: Accumulate new content into pending buffers ───
    if (bufferData.captions.length > 0) {
      this.pendingCaptions.push(...bufferData.captions);
      this.lastCaptionArrival = Date.now();
    }
    if (bufferData.chat.length > 0) {
      this.pendingChat.push(...bufferData.chat);
    }

    // ─── Step 4: Decide whether to flush ───
    const now = Date.now();
    const timeSinceLastCaption = now - this.lastCaptionArrival;
    const hasPendingCaptions = this.pendingCaptions.length > 0;
    const hasPendingChat = this.pendingChat.length > 0;

    // Chat messages: always flush immediately (someone explicitly typed a message)
    if (hasPendingChat && !hasPendingCaptions) {
      const chat = [...this.pendingChat];
      this.pendingChat = [];
      await this.sendUpdate([], chat);
      return;
    }

    if (!hasPendingCaptions && !hasPendingChat) {
      this.consecutiveEmpty++;
      return;
    }

    // Captions: debounce — wait for silence gap or hard cap
    const totalText = this.pendingCaptions.map(c => c.text).join(' ');
    const oldestCaption = this.pendingCaptions[0]?.timestamp || now;
    const pendingAge = now - oldestCaption;

    const silenceGapReached = timeSinceLastCaption >= this.silenceGapMs;
    const hardCapReached = pendingAge >= 30_000; // 30s max accumulation
    const textSubstantial = totalText.length >= this.minCaptionLength;

    if ((silenceGapReached || hardCapReached) && textSubstantial) {
      // Flush! Speaker(s) finished talking or we've waited long enough
      const captions = [...this.pendingCaptions];
      const chat = [...this.pendingChat];
      this.pendingCaptions = [];
      this.pendingChat = [];
      this.consecutiveEmpty = 0;
      await this.sendUpdate(captions, chat);
    } else if (silenceGapReached && !textSubstantial) {
      // Silence gap reached but content is too short (filler words) — discard
      console.log(`[meeting-monitor:${this.agentId}] Discarding short caption fragment: "${totalText.slice(0, 50)}"`);
      this.pendingCaptions = [];
    }
    // else: still accumulating — wait for next flush cycle
  }

  /**
   * Send accumulated captions and/or chat to the agent session.
   */
  private async sendUpdate(captions: CaptionEntry[], chat: ChatEntry[]): Promise<void> {
    // ─── Voice Intelligence: play fillers while LLM processes ───
    if (captions.length > 0) {
      try {
        const { getActiveVoiceIntelligence } = await import('./meeting-voice-intelligence.js');
        const voiceIntel = getActiveVoiceIntelligence(this.agentId);
        if (voiceIntel?.isReady) {
          const consolidated = this.consolidateCaptions(captions);
          const decision = voiceIntel.decisionEngine.analyze(
            consolidated.map(c => ({ speaker: c.speaker, text: c.text }))
          );
          if (decision.shouldSpeak) {
            // Play fillers in background while LLM processes the captions
            // This covers the gap between "captions flushed" and "meeting_speak called"
            const context = {
              captionText: consolidated.map(c => c.text).join(' '),
              speaker: consolidated[consolidated.length - 1]?.speaker || 'Unknown',
              directedAtAgent: decision.directedAtAgent,
              complexity: decision.complexity,
              participantCount: new Set(consolidated.map(c => c.speaker)).size,
              isQuestion: decision.isQuestion,
            };
            // Fire-and-forget — fillers play while LLM generates response
            voiceIntel.handleCaptions(
              consolidated.map(c => ({ speaker: c.speaker, text: c.text })),
              async () => {
                // This callback will be resolved when meeting_speak is called with the response
                // For now, we just wait — the filler system handles the gap
                return new Promise(() => {}); // Never resolves — fillers interrupted by meeting_speak
              }
            ).catch(() => {});
          }
        }
      } catch {} // Voice intelligence not available
    }

    // Fire-and-forget typing indicator (don't block the flush pipeline)
    if (this.sendChatIndicator && captions.length > 0) {
      this.sendChatIndicator(this.page, '...').catch(() => {});
    }

    const parts: string[] = ['[Meeting Monitor — Live Update]'];

    if (captions.length > 0) {
      parts.push('\n--- CAPTIONS (what people are saying) ---');
      const consolidated = this.consolidateCaptions(captions);
      for (const c of consolidated) {
        parts.push(c.speaker ? `${c.speaker}: ${c.text}` : c.text);
      }
    }

    if (chat.length > 0) {
      parts.push('\n--- CHAT MESSAGES ---');
      for (const m of chat) {
        parts.push(m.sender ? `${m.sender}: ${m.text}` : m.text);
      }
    }

    parts.push('\n--- END UPDATE ---');

    // ─── Voice Intelligence: check if agent should speak vs listen ───
    try {
      const { getActiveVoiceIntelligence } = await import('./meeting-voice-intelligence.js');
      const voiceIntel = getActiveVoiceIntelligence(this.agentId);
      if (voiceIntel?.isReady && captions.length > 0) {
        const decision = voiceIntel.decisionEngine.analyze(
          consolidated.map(c => ({ speaker: c.speaker, text: c.text }))
        );
        if (decision.shouldSpeak) {
          parts.push(`\n[Voice Intelligence] Someone is addressing you or asking a question (${decision.reason}). Respond using meeting_speak — fillers will play automatically while you think.`);
        } else {
          parts.push(`\n[Voice Intelligence] ${decision.reason}. No response needed — taking notes silently.`);
        }
      }
    } catch {} // Voice intelligence not available — fall through

    parts.push('If someone addressed you or asked a question, respond using meeting_speak(text: "your response") to talk out loud, or meeting_action(action: "chat", message: "your response") for text. Otherwise, just note the content silently — do NOT respond to every caption update.');

    try {
      await this.sendMessage(this.sessionId, parts.join('\n'));
      this.consecutiveSendFailures = 0;
      console.log(`[meeting-monitor:${this.agentId}] Flushed ${captions.length} captions, ${chat.length} chat msgs`);
    } catch (err: any) {
      this.consecutiveSendFailures++;
      console.error(`[meeting-monitor:${this.agentId}] Failed to send to session (${this.consecutiveSendFailures}/5): ${err.message}`);
      if (this.consecutiveSendFailures >= 5) {
        console.error(`[meeting-monitor:${this.agentId}] Too many send failures — stopping monitor`);
        this.stop();
        this.onMeetingEnd?.();
      }
    }
  }

  /**
   * Consolidate consecutive captions from the same speaker.
   */
  private consolidateCaptions(captions: CaptionEntry[]): { speaker: string; text: string }[] {
    if (captions.length === 0) return [];

    const result: { speaker: string; text: string }[] = [];
    let current = { speaker: captions[0].speaker, text: captions[0].text };

    for (let i = 1; i < captions.length; i++) {
      const c = captions[i];
      if (c.speaker === current.speaker) {
        // Same speaker — append (but avoid exact duplicates)
        if (!current.text.includes(c.text)) {
          current.text += ' ' + c.text;
        }
      } else {
        result.push(current);
        current = { speaker: c.speaker, text: c.text };
      }
    }
    result.push(current);
    return result;
  }
}

// ─── Global registry of active monitors ───
const activeMonitors = new Map<string, MeetingMonitor>();

export function getActiveMonitor(agentId: string): MeetingMonitor | undefined {
  return activeMonitors.get(agentId);
}

export function registerMonitor(agentId: string, monitor: MeetingMonitor): void {
  // Stop any existing monitor for this agent
  const existing = activeMonitors.get(agentId);
  if (existing) existing.stop();
  activeMonitors.set(agentId, monitor);
}

export function removeMonitor(agentId: string): void {
  const existing = activeMonitors.get(agentId);
  if (existing) {
    existing.stop();
    activeMonitors.delete(agentId);
  }
}
