/**
 * Session Router — Centralized message routing for enterprise agents.
 * 
 * THE CORE PROBLEM THIS SOLVES:
 * Without a router, every inbound message (chat, email, meeting update) spawns
 * a fresh session with zero context. This means:
 * - Agent in a meeting gets a chat message → new session says "I have no meetings"
 * - Agent processing an email gets another → two sessions fight over the inbox
 * - Meeting monitor pushes captions → but the session already ended (LLM returned end_turn)
 * 
 * THE FIX:
 * One "active session" per agent per channel. Messages route to the existing session
 * via sendMessage() instead of spawning new ones. New sessions only spawn when
 * no compatible active session exists.
 * 
 * SESSION TYPES:
 * - "meeting" — Long-lived. Do NOT interrupt with unrelated messages.
 * - "chat"    — Medium-lived. Can receive follow-up messages in the same space.
 * - "email"   — Short-lived. One email, one session.
 * - "task"    — Short-lived. One task, one session.
 * 
 * ROUTING RULES:
 * 1. Meeting sessions are sacred — chat messages wait or spawn separately (with meeting context)
 * 2. Chat sessions in the same space reuse the session (sendMessage)
 * 3. Email sessions are always fresh (different emails = different contexts)
 * 4. Task sessions are always fresh
 */

export type SessionType = 'meeting' | 'chat' | 'email' | 'task';

export interface TrackedSession {
  sessionId: string;
  type: SessionType;
  agentId: string;
  /** For chat: the space ID. For meeting: the meeting URL. */
  channelKey?: string;
  createdAt: number;
  lastActivityAt: number;
  /** Metadata about the session */
  meta?: Record<string, any>;
}

export interface RouteDecision {
  action: 'reuse' | 'spawn' | 'queue';
  sessionId?: string;
  reason: string;
  /** Context to inject when reusing a session */
  contextPrefix?: string;
}

export class SessionRouter {
  /** Active sessions by agent ID → session type → tracked sessions */
  private sessions = new Map<string, Map<SessionType, TrackedSession[]>>();
  
  /** Stale threshold in ms — sessions older than this without activity are pruned */
  private staleThresholdMs: number;

  constructor(opts?: { staleThresholdMs?: number }) {
    this.staleThresholdMs = opts?.staleThresholdMs || 30 * 60 * 1000; // 30 min default
  }

  /**
   * Register a new session in the router.
   */
  register(session: TrackedSession): void {
    let agentMap = this.sessions.get(session.agentId);
    if (!agentMap) {
      agentMap = new Map();
      this.sessions.set(session.agentId, agentMap);
    }
    let typeSessions = agentMap.get(session.type);
    if (!typeSessions) {
      typeSessions = [];
      agentMap.set(session.type, typeSessions);
    }
    typeSessions.push(session);
  }

  /**
   * Unregister a session (completed, failed, etc.)
   */
  unregister(agentId: string, sessionId: string): void {
    const agentMap = this.sessions.get(agentId);
    if (!agentMap) return;
    for (const [type, sessions] of agentMap) {
      const idx = sessions.findIndex(s => s.sessionId === sessionId);
      if (idx !== -1) {
        sessions.splice(idx, 1);
        if (sessions.length === 0) agentMap.delete(type);
        break;
      }
    }
    if (agentMap.size === 0) this.sessions.delete(agentId);
  }

  /**
   * Touch a session to update its lastActivityAt.
   */
  touch(agentId: string, sessionId: string): void {
    const agentMap = this.sessions.get(agentId);
    if (!agentMap) return;
    for (const sessions of agentMap.values()) {
      const s = sessions.find(s => s.sessionId === sessionId);
      if (s) { s.lastActivityAt = Date.now(); return; }
    }
  }

  /**
   * Route an inbound message. Returns what to do.
   */
  route(agentId: string, inbound: {
    type: SessionType;
    channelKey?: string;
    /** Is this from the agent's manager? */
    isManager?: boolean;
  }): RouteDecision {
    this.pruneStale(agentId);

    const agentMap = this.sessions.get(agentId);
    if (!agentMap) {
      return { action: 'spawn', reason: 'No active sessions for this agent' };
    }

    // ─── Rule 1: Check for active meeting ───
    const meetingSessions = agentMap.get('meeting') || [];
    const activeMeeting = meetingSessions[0]; // At most one meeting at a time

    if (activeMeeting && inbound.type === 'chat') {
      // Agent is in a meeting. Don't spawn a fresh chat session that's oblivious.
      // Route to the meeting session with context about the chat message.
      return {
        action: 'reuse',
        sessionId: activeMeeting.sessionId,
        reason: 'Agent is in a meeting — routing chat to meeting session',
        contextPrefix: `[Google Chat Message — you are currently in a meeting, handle this briefly]`,
      };
    }

    // ─── Rule 2: Chat sessions in same space reuse ───
    if (inbound.type === 'chat' && inbound.channelKey) {
      const chatSessions = agentMap.get('chat') || [];
      const sameSpace = chatSessions.find(s => s.channelKey === inbound.channelKey);
      if (sameSpace) {
        sameSpace.lastActivityAt = Date.now();
        return {
          action: 'reuse',
          sessionId: sameSpace.sessionId,
          reason: `Reusing active chat session in same space: ${inbound.channelKey}`,
        };
      }
    }

    // ─── Rule 3: Email and task sessions are always fresh ───
    if (inbound.type === 'email' || inbound.type === 'task') {
      return { action: 'spawn', reason: `${inbound.type} sessions are always fresh` };
    }

    // ─── Rule 4: No matching session — spawn new ───
    return { action: 'spawn', reason: 'No compatible active session found' };
  }

  /**
   * Get all active sessions for an agent.
   */
  getActiveSessions(agentId: string): TrackedSession[] {
    const agentMap = this.sessions.get(agentId);
    if (!agentMap) return [];
    const result: TrackedSession[] = [];
    for (const sessions of agentMap.values()) {
      result.push(...sessions);
    }
    return result;
  }

  /**
   * Check if agent has an active meeting session.
   */
  hasActiveMeeting(agentId: string): TrackedSession | undefined {
    return this.sessions.get(agentId)?.get('meeting')?.[0];
  }

  /**
   * Prune stale sessions that haven't had activity.
   */
  private pruneStale(agentId: string): void {
    const agentMap = this.sessions.get(agentId);
    if (!agentMap) return;
    const cutoff = Date.now() - this.staleThresholdMs;
    for (const [type, sessions] of agentMap) {
      // Meeting sessions get longer grace period (2 hours)
      const threshold = type === 'meeting' ? cutoff - 90 * 60 * 1000 : cutoff;
      const filtered = sessions.filter(s => s.lastActivityAt > threshold);
      if (filtered.length === 0) agentMap.delete(type);
      else agentMap.set(type, filtered);
    }
    if (agentMap.size === 0) this.sessions.delete(agentId);
  }

  /**
   * Debug: dump all tracked sessions.
   */
  dump(): Record<string, TrackedSession[]> {
    const result: Record<string, TrackedSession[]> = {};
    for (const [agentId, agentMap] of this.sessions) {
      result[agentId] = [];
      for (const sessions of agentMap.values()) {
        result[agentId].push(...sessions);
      }
    }
    return result;
  }
}
