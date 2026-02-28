/**
 * Real-Time Agent Status Tracker
 *
 * Tracks what each agent is doing RIGHT NOW — not what the database says.
 * In-memory, event-driven. Dashboard subscribes via SSE for live updates.
 *
 * Status flow:
 *   offline → idle → working (with activity detail) → idle → offline
 *
 * Activities tracked:
 *   - Session starts/ends (chat, email, meeting, task)
 *   - Tool calls (gmail, calendar, browser, etc.)
 *   - Clock in/out
 *   - Process heartbeats (proves agent process is alive)
 */

// ─── Types ───────────────────────────────────────────────

export type AgentOnlineStatus = 'online' | 'idle' | 'offline' | 'error';

export interface AgentActivity {
  type: string;        // 'chat' | 'email' | 'meeting' | 'task' | 'tool_call' | 'idle'
  detail?: string;     // e.g. "Reading Gmail inbox", "In meeting with John"
  sessionId?: string;
  startedAt: string;
  tool?: string;       // Current tool being executed
}

export interface AgentStatusSnapshot {
  agentId: string;
  status: AgentOnlineStatus;
  clockedIn: boolean;
  currentActivity: AgentActivity | null;
  activeSessions: number;
  lastHeartbeat: string | null;   // Last time agent process checked in
  lastActivity: string | null;    // Last time agent did anything
  uptimeMs: number | null;        // How long since agent came online
  onlineSince: string | null;
}

type StatusListener = (agentId: string, snapshot: AgentStatusSnapshot) => void;

// ─── Tracker ─────────────────────────────────────────────

export class AgentStatusTracker {
  private statuses = new Map<string, AgentStatusSnapshot>();
  private listeners = new Set<StatusListener>();
  private staleCheckTimer: NodeJS.Timeout | null = null;

  /** How long without a heartbeat before agent is considered offline */
  private staleThresholdMs = 90_000; // 90 seconds

  constructor() {
    // Periodically check for stale agents
    this.staleCheckTimer = setInterval(() => this.checkStale(), 30_000);
    if (this.staleCheckTimer.unref) this.staleCheckTimer.unref();
  }

  // ─── Core State Updates ────────────────────────────────

  /** Agent process sent a heartbeat (proves it's alive) */
  heartbeat(agentId: string): void {
    const snap = this.getOrCreate(agentId);
    snap.lastHeartbeat = new Date().toISOString();
    if (snap.status === 'offline' || snap.status === 'error') {
      snap.status = 'idle';
      snap.onlineSince = new Date().toISOString();
    }
    this.emit(agentId, snap);
  }

  /** Agent started working on something */
  startActivity(agentId: string, activity: Omit<AgentActivity, 'startedAt'>): void {
    const snap = this.getOrCreate(agentId);
    snap.status = 'online';
    snap.currentActivity = { ...activity, startedAt: new Date().toISOString() };
    snap.lastActivity = new Date().toISOString();
    snap.lastHeartbeat = new Date().toISOString();
    if (!snap.onlineSince) snap.onlineSince = new Date().toISOString();
    this.emit(agentId, snap);
  }

  /** Agent finished current activity */
  endActivity(agentId: string): void {
    const snap = this.getOrCreate(agentId);
    snap.currentActivity = null;
    snap.status = snap.activeSessions > 0 ? 'online' : 'idle';
    snap.lastActivity = new Date().toISOString();
    this.emit(agentId, snap);
  }

  /** Agent executing a tool */
  toolStart(agentId: string, toolName: string, detail?: string): void {
    const snap = this.getOrCreate(agentId);
    snap.status = 'online';
    snap.lastActivity = new Date().toISOString();
    snap.lastHeartbeat = new Date().toISOString();
    // Update current activity with tool info
    if (snap.currentActivity) {
      snap.currentActivity.tool = toolName;
      if (detail) snap.currentActivity.detail = detail;
    } else {
      snap.currentActivity = {
        type: 'tool_call',
        detail: detail || toolName,
        tool: toolName,
        startedAt: new Date().toISOString(),
      };
    }
    this.emit(agentId, snap);
  }

  /** Tool execution finished */
  toolEnd(agentId: string): void {
    const snap = this.getOrCreate(agentId);
    if (snap.currentActivity?.tool) {
      snap.currentActivity.tool = undefined;
    }
    // Don't clear activity — session may still be active
    this.emit(agentId, snap);
  }

  /** Session started */
  sessionStart(agentId: string, sessionId: string, kind: string, detail?: string): void {
    const snap = this.getOrCreate(agentId);
    snap.activeSessions++;
    snap.status = 'online';
    snap.lastActivity = new Date().toISOString();
    snap.lastHeartbeat = new Date().toISOString();
    if (!snap.onlineSince) snap.onlineSince = new Date().toISOString();
    snap.currentActivity = {
      type: kind || 'task',
      detail: detail || kind,
      sessionId,
      startedAt: new Date().toISOString(),
    };
    this.emit(agentId, snap);
  }

  /** Session ended */
  sessionEnd(agentId: string, _sessionId: string): void {
    const snap = this.getOrCreate(agentId);
    snap.activeSessions = Math.max(0, snap.activeSessions - 1);
    if (snap.activeSessions === 0) {
      snap.currentActivity = null;
      snap.status = 'idle';
    }
    snap.lastActivity = new Date().toISOString();
    this.emit(agentId, snap);
  }

  /** Agent clocked in */
  clockIn(agentId: string): void {
    const snap = this.getOrCreate(agentId);
    snap.clockedIn = true;
    snap.status = snap.activeSessions > 0 ? 'online' : 'idle';
    snap.onlineSince = new Date().toISOString();
    this.emit(agentId, snap);
  }

  /** Agent clocked out */
  clockOut(agentId: string): void {
    const snap = this.getOrCreate(agentId);
    snap.clockedIn = false;
    snap.status = 'offline';
    snap.currentActivity = null;
    snap.onlineSince = null;
    this.emit(agentId, snap);
  }

  /** Agent process crashed or went offline */
  markOffline(agentId: string, reason?: string): void {
    const snap = this.getOrCreate(agentId);
    snap.status = reason ? 'error' : 'offline';
    snap.currentActivity = null;
    snap.activeSessions = 0;
    snap.onlineSince = null;
    this.emit(agentId, snap);
  }

  // ─── Queries ───────────────────────────────────────────

  getStatus(agentId: string): AgentStatusSnapshot {
    const snap = this.getOrCreate(agentId);
    // Compute uptime
    if (snap.onlineSince) {
      snap.uptimeMs = Date.now() - new Date(snap.onlineSince).getTime();
    } else {
      snap.uptimeMs = null;
    }
    return { ...snap };
  }

  getAllStatuses(): AgentStatusSnapshot[] {
    return Array.from(this.statuses.values()).map(s => ({
      ...s,
      uptimeMs: s.onlineSince ? Date.now() - new Date(s.onlineSince).getTime() : null,
    }));
  }

  // ─── Subscriptions (for SSE) ───────────────────────────

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ─── Internals ─────────────────────────────────────────

  private getOrCreate(agentId: string): AgentStatusSnapshot {
    let snap = this.statuses.get(agentId);
    if (!snap) {
      snap = {
        agentId,
        status: 'offline',
        clockedIn: false,
        currentActivity: null,
        activeSessions: 0,
        lastHeartbeat: null,
        lastActivity: null,
        uptimeMs: null,
        onlineSince: null,
      };
      this.statuses.set(agentId, snap);
    }
    return snap;
  }

  private emit(agentId: string, snapshot: AgentStatusSnapshot): void {
    for (const listener of this.listeners) {
      try { listener(agentId, snapshot); } catch { /* don't let listener errors break us */ }
    }
  }

  private checkStale(): void {
    const now = Date.now();
    for (const [agentId, snap] of this.statuses) {
      if (snap.status === 'offline' || snap.status === 'error') continue;
      if (snap.lastHeartbeat) {
        const elapsed = now - new Date(snap.lastHeartbeat).getTime();
        if (elapsed > this.staleThresholdMs) {
          // Agent hasn't sent a heartbeat — mark as offline
          snap.status = 'offline';
          snap.currentActivity = null;
          snap.activeSessions = 0;
          snap.onlineSince = null;
          this.emit(agentId, snap);
        }
      }
    }
  }

  destroy(): void {
    if (this.staleCheckTimer) clearInterval(this.staleCheckTimer);
    this.listeners.clear();
    this.statuses.clear();
  }
}

// ─── Tool Name → Friendly Description ───────────────────

export function describeToolActivity(toolName: string): string {
  const MAP: Record<string, string> = {
    gmail_search: 'Searching Gmail',
    gmail_read: 'Reading email',
    gmail_send: 'Sending email',
    gmail_reply: 'Replying to email',
    gmail_forward: 'Forwarding email',
    gmail_drafts: 'Managing email drafts',
    google_calendar_events: 'Checking calendar',
    google_calendar_list: 'Listing calendars',
    google_chat_send_message: 'Sending chat message',
    google_chat_list_messages: 'Reading chat messages',
    google_chat_list_spaces: 'Browsing chat spaces',
    meeting_join: 'Joining a meeting',
    meeting_speak: 'Speaking in meeting',
    meeting_prepare: 'Preparing for meeting',
    browser: 'Browsing the web',
    web_search: 'Searching the web',
    web_fetch: 'Fetching a webpage',
    memory: 'Accessing memory',
    memory_reflect: 'Reflecting on learnings',
    knowledge_base_search: 'Searching knowledge base',
    knowledge_hub_search: 'Searching knowledge hub',
    google_drive_search: 'Searching Drive',
    google_drive_get: 'Reading a Drive file',
    google_docs_create: 'Creating a document',
    google_sheets_read: 'Reading a spreadsheet',
    bash: 'Running a command',
    read: 'Reading a file',
    write: 'Writing a file',
  };
  return MAP[toolName] || toolName.replace(/_/g, ' ');
}
