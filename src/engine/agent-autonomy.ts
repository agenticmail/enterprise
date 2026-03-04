/**
 * Agent Autonomy System
 *
 * Provides enterprise-grade autonomous behaviors:
 * 1. Auto Clock-In/Out based on work schedule
 * 2. Daily/Weekly Manager Catchup Emails
 * 3. Goal Setting & Auto-Reminders
 * 4. Friday Knowledge Contribution
 * 5. Smart Answer Escalation (memory → Drive → Sites → manager)
 * 6. Guardrail Rule Enforcement at runtime
 */

import type { EngineDatabase } from './db-adapter.js';

// ─── Types ──────────────────────────────────────────────

/**
 * Autonomy settings — all configurable via dashboard.
 * Stored in managed_agents.config.autonomy JSON field.
 */
export interface AutonomySettings {
  /** Master switch — disables all autonomy features */
  enabled: boolean;

  /** Auto clock-in/out based on work schedule */
  clockEnabled: boolean;

  /**
   * Daily/Weekly catchup: times are read from config.dailyCatchUp (Manager & Catch-Up tab).
   * These booleans just enable/disable the behavior.
   */
  dailyCatchupEnabled: boolean;
  weeklyCatchupEnabled: boolean;
  weeklyCatchupDay: number;       // 0=Sun..6=Sat, default 1 (Monday)

  /** Goal progress check */
  goalCheckEnabled: boolean;
  goalCheckHours: number[];       // hours of day to check, default [14, 17]

  /** Knowledge contribution */
  knowledgeContribEnabled: boolean;
  knowledgeContribDay: number;    // 0=Sun..6=Sat, default 5 (Friday)
  knowledgeContribHour: number;   // default 15

  /** Smart escalation */
  escalationEnabled: boolean;

  /** Guardrail enforcement at runtime */
  guardrailEnforcementEnabled: boolean;

  /** Drive access request on 403 */
  driveAccessRequestEnabled: boolean;
}

export const DEFAULT_AUTONOMY_SETTINGS: AutonomySettings = {
  enabled: true,
  clockEnabled: true,
  dailyCatchupEnabled: true,
  weeklyCatchupEnabled: true,
  weeklyCatchupDay: 1,
  goalCheckEnabled: true,
  goalCheckHours: [14, 17],
  knowledgeContribEnabled: true,
  knowledgeContribDay: 5,
  knowledgeContribHour: 15,
  escalationEnabled: true,
  guardrailEnforcementEnabled: true,
  driveAccessRequestEnabled: true,
};

export interface AutonomyConfig {
  agentId: string;
  orgId: string;
  agentName: string;
  role: string;
  managerEmail?: string;
  timezone: string;
  schedule?: { start: string; end: string; days: number[] };
  emailProvider?: any;
  runtime?: any;
  engineDb: EngineDatabase;
  memoryManager?: any;
  lifecycle?: any;
  settings?: Partial<AutonomySettings>;
}

export interface ClockState {
  clockedIn: boolean;
  clockInTime?: string;
  clockOutTime?: string;
  lastCheckTime?: string;
}

interface CatchupData {
  emailsHandled: number;
  sessionsRun: number;
  memoriesStored: number;
  tasksCompleted: string[];
  issuesEncountered: string[];
  knowledgeGained: string[];
}

// ─── Agent Autonomy Manager ─────────────────────────────

export class AgentAutonomyManager {
  private config: AutonomyConfig;
  private settings: AutonomySettings;
  public clockState: ClockState = { clockedIn: false };
  private schedulerInterval?: NodeJS.Timeout;
  private catchupInterval?: NodeJS.Timeout;
  private knowledgeInterval?: NodeJS.Timeout;
  private goalCheckInterval?: NodeJS.Timeout;

  constructor(config: AutonomyConfig) {
    this.config = config;
    this.settings = { ...DEFAULT_AUTONOMY_SETTINGS, ...(config.settings || {}) };
  }

  /** Reload settings from DB (called when config changes via dashboard) */
  async reloadSettings(): Promise<void> {
    try {
      const rows = await this.config.engineDb.query<any>(
        `SELECT config FROM managed_agents WHERE id = $1`, [this.config.agentId]
      );
      if (rows?.[0]?.config) {
        const cfg = typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : rows[0].config;
        if (cfg.autonomy) {
          this.settings = { ...DEFAULT_AUTONOMY_SETTINGS, ...cfg.autonomy };
        }
      }

      // Reload work schedule from work_schedules table
      const schedRows = await this.config.engineDb.query<any>(
        `SELECT config, timezone FROM work_schedules WHERE agent_id = $1 AND enabled = TRUE ORDER BY created_at DESC LIMIT 1`,
        [this.config.agentId]
      );
      if (schedRows?.[0]) {
        const schedConfig = typeof schedRows[0].config === 'string' ? JSON.parse(schedRows[0].config) : schedRows[0].config;
        if (schedConfig?.standardHours) {
          this.config.schedule = {
            start: schedConfig.standardHours.start,
            end: schedConfig.standardHours.end,
            days: schedConfig.standardHours.daysOfWeek || [1, 2, 3, 4, 5],
          };
          if (schedRows[0].timezone) this.config.timezone = schedRows[0].timezone;
        }
      }
    } catch (err: any) {
      console.warn(`[autonomy] Failed to reload settings: ${err.message}`);
    }
  }

  getSettings(): AutonomySettings { return { ...this.settings }; }

  async start(): Promise<void> {
    if (!this.settings.enabled) {
      console.log('[autonomy] Disabled via settings, skipping');
      return;
    }

    console.log('[autonomy] Starting agent autonomy system...');

    // Load latest settings from DB
    await this.reloadSettings();

    // Check clock state on boot
    if (this.settings.clockEnabled) await this.checkClockState();

    // Schedule checker runs every minute
    this.schedulerInterval = setInterval(() => {
      if (this.settings.clockEnabled) this.checkClockState();
    }, 60_000);

    // Catchup email checker runs every 15 minutes
    this.catchupInterval = setInterval(() => this.checkCatchupSchedule(), 15 * 60_000);
    setTimeout(() => this.checkCatchupSchedule(), 30_000);

    // Knowledge contribution checker runs every hour
    this.knowledgeInterval = setInterval(() => this.checkKnowledgeContribution(), 60 * 60_000);

    // Goal progress checker runs every 30 minutes (more granular than 2h)
    this.goalCheckInterval = setInterval(() => this.checkGoalProgress(), 30 * 60_000);

    // Reload settings from DB every 10 minutes (picks up dashboard changes)
    setInterval(() => this.reloadSettings(), 10 * 60_000);

    const features = [];
    if (this.settings.clockEnabled) features.push('clock');
    if (this.settings.dailyCatchupEnabled) features.push('daily-catchup(time from Manager tab)');
    if (this.settings.weeklyCatchupEnabled) features.push('weekly-catchup@' + ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][this.settings.weeklyCatchupDay]);
    if (this.settings.goalCheckEnabled) features.push('goals@' + this.settings.goalCheckHours.join(','));
    if (this.settings.knowledgeContribEnabled) features.push('knowledge@' + ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][this.settings.knowledgeContribDay]);
    console.log('[autonomy] Active features: ' + features.join(', '));
  }

  stop(): void {
    if (this.schedulerInterval) clearInterval(this.schedulerInterval);
    if (this.catchupInterval) clearInterval(this.catchupInterval);
    if (this.knowledgeInterval) clearInterval(this.knowledgeInterval);
    if (this.goalCheckInterval) clearInterval(this.goalCheckInterval);
    console.log('[autonomy] System stopped');
  }

  // ─── 1. Auto Clock-In/Out ──────────────────────────

  private async checkClockState(): Promise<void> {
    const schedule = this.config.schedule;
    if (!schedule) return;

    const now = new Date();
    const tz = this.config.timezone || 'UTC';
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const currentHour = localTime.getHours();
    const currentMinute = localTime.getMinutes();
    const currentDay = localTime.getDay(); // 0=Sun
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

    // Check if today is a scheduled workday
    const isWorkday = schedule.days.includes(currentDay);
    const isWithinHours = currentTimeStr >= schedule.start && currentTimeStr < schedule.end;

    if (isWorkday && isWithinHours && !this.clockState.clockedIn) {
      await this.clockIn();
      // Morning triage — scan accumulated off-hours items
      await this.morningTriage();
    } else if ((!isWorkday || !isWithinHours) && this.clockState.clockedIn) {
      await this.clockOut();
    }

    this.clockState.lastCheckTime = now.toISOString();
  }

  private async clockIn(): Promise<void> {
    const now = new Date().toISOString();
    this.clockState.clockedIn = true;
    this.clockState.clockInTime = now;

    try {
      await this.config.engineDb.execute(
        `INSERT INTO clock_records (id, org_id, agent_id, type, triggered_by, actual_at, created_at) VALUES ($1, $2, $3, 'clock_in', 'auto_scheduler', $4, $4)`,
        [crypto.randomUUID(), this.config.orgId, this.config.agentId, now]
      );
      console.log(`[autonomy] ⏰ Clocked IN at ${now}`);

      // Store in memory
      if (this.config.memoryManager) {
        await this.config.memoryManager.storeMemory(this.config.agentId, {
          content: `Clocked in at ${now}. Starting work shift.`,
          category: 'context',
          importance: 'low',
          confidence: 1.0,
        }).catch(() => {});
      }
    } catch (err: any) {
      console.error(`[autonomy] Clock-in error: ${err.message}`);
    }
  }

  private async clockOut(): Promise<void> {
    const now = new Date().toISOString();
    this.clockState.clockedIn = false;
    this.clockState.clockOutTime = now;

    try {
      await this.config.engineDb.execute(
        `INSERT INTO clock_records (id, org_id, agent_id, type, triggered_by, reason, actual_at, created_at) VALUES ($1, $2, $3, 'clock_out', 'auto_scheduler', 'End of scheduled hours', $4, $4)`,
        [crypto.randomUUID(), this.config.orgId, this.config.agentId, now]
      );
      console.log(`[autonomy] ⏰ Clocked OUT at ${now}`);

      // Store in memory
      if (this.config.memoryManager) {
        await this.config.memoryManager.storeMemory(this.config.agentId, {
          content: `Clocked out at ${now}. Work shift ended.`,
          category: 'context',
          importance: 'low',
          confidence: 1.0,
        }).catch(() => {});
      }
    } catch (err: any) {
      console.error(`[autonomy] Clock-out error: ${err.message}`);
    }
  }

  /**
   * Morning Triage — runs once after clock-in.
   * Scans for off-hours accumulated items (emails, chats, failed sessions)
   * and creates a single LLM session to triage everything into tasks.
   * 
   * This avoids the problem of 15 emails = 15 separate sessions.
   * Instead: 1 triage session → creates Google Tasks → then handles them in order.
   */
  private async morningTriage(): Promise<void> {
    if (!this.config.runtime) return;
    
    const dateStr = new Date().toISOString().split('T')[0];
    const triageKey = `morning_triage_${dateStr}`;
    const alreadyDone = await this.checkMemoryFlag(triageKey);
    if (alreadyDone) return;

    console.log('[autonomy] 🌅 Morning triage — scanning off-hours accumulation...');

    const db = this.config.engineDb;
    const agentId = this.config.agentId;

    // Count off-hours items (pure DB — no tokens)
    let unhandledEmails = 0;
    let failedSessions = 0;
    let failedChats = 0;
    
    try {
      // Emails that arrived since last clock-out (or last 16h as fallback)
      const lastClockOut = this.clockState.clockOutTime || new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString();
      
      const emailRows = await db.query<any>(
        `SELECT COUNT(*) as cnt FROM agent_sessions 
         WHERE agent_id = $1 AND created_at > $2 AND metadata::text LIKE '%email%'`,
        [agentId, lastClockOut]
      );
      unhandledEmails = parseInt(emailRows?.[0]?.cnt || '0');
      
      const failedRows = await db.query<any>(
        `SELECT COUNT(*) as cnt FROM agent_sessions 
         WHERE agent_id = $1 AND status = 'failed' AND created_at > $2`,
        [agentId, lastClockOut]
      );
      failedSessions = parseInt(failedRows?.[0]?.cnt || '0');

      const chatRows = await db.query<any>(
        `SELECT COUNT(*) as cnt FROM agent_sessions 
         WHERE agent_id = $1 AND status = 'failed' AND metadata::text LIKE '%chat%' AND created_at > $2`,
        [agentId, lastClockOut]
      );
      failedChats = parseInt(chatRows?.[0]?.cnt || '0');
    } catch {}

    const totalItems = unhandledEmails + failedSessions + failedChats;
    
    // If nothing accumulated, skip the LLM session entirely (zero tokens)
    if (totalItems === 0) {
      console.log('[autonomy] 🌅 Morning triage: nothing accumulated overnight. Clean start!');
      await this.setMemoryFlag(triageKey);
      return;
    }

    console.log(`[autonomy] 🌅 Morning triage: ${unhandledEmails} emails, ${failedSessions} failed sessions, ${failedChats} failed chats`);

    // Only spawn LLM session if there's enough to warrant triage (> 3 items)
    if (totalItems <= 3) {
      console.log('[autonomy] 🌅 Only a few items — skipping triage session, they\'ll be handled individually.');
      await this.setMemoryFlag(triageKey);
      return;
    }

    // Spawn one triage session
    const prompt = `Good morning! You just clocked in. Here's what accumulated while you were off:

- ${unhandledEmails} email session(s) were created overnight
- ${failedSessions} session(s) failed (may need retry)  
- ${failedChats} chat message(s) may be unanswered

Your morning routine:
1. Check your inbox with gmail_search (unread only) — scan subjects and senders
2. For each important email, create a Google Task: google_tasks_create with title, notes, and priority
3. Check Google Chat for any unanswered messages: google_chat_list_messages
4. For any failed sessions that look important, add them as tasks too
5. Send your manager (${this.config.managerEmail}) a brief "starting my day" message listing your top priorities
6. After triage, start working through tasks in priority order

Prioritize: manager emails > urgent requests > routine items > FYI messages.
Create tasks in a "Today" list so you can track progress throughout the day.`;

    const systemPrompt = `You are ${this.config.agentName}, a ${this.config.role}. 
You just clocked in for the day. Your first task is to triage everything that accumulated overnight.
Be systematic: scan, prioritize, create tasks, then execute. Don't just dive into the first email you see.
Work schedule: ${this.config.schedule ? `${this.config.schedule.start}-${this.config.schedule.end} ${this.config.timezone}` : 'Standard hours'}`;

    try {
      const session = await this.config.runtime.spawnSession({
        agentId,
        message: prompt,
        systemPrompt,
      });
      console.log(`[autonomy] 🌅 Morning triage session ${session.id} created`);
      await this.setMemoryFlag(triageKey);
    } catch (err: any) {
      console.error(`[autonomy] Morning triage error: ${err.message}`);
    }
  }

  isWorkingHours(): boolean {
    return this.clockState.clockedIn;
  }

  getClockState(): ClockState {
    return { ...this.clockState };
  }

  // ─── 2. Manager Catchup Emails ─────────────────────

  private async checkCatchupSchedule(): Promise<void> {
    if (!this.config.managerEmail || !this.config.runtime) return;

    // Read catchup time from config.dailyCatchUp (set in Manager & Catch-Up tab)
    let catchUpHour = 9;
    let catchUpMinute = 0;
    let catchUpTz = this.config.timezone || 'UTC';
    try {
      const rows = await this.config.engineDb.query<any>(
        `SELECT config FROM managed_agents WHERE id = $1`, [this.config.agentId]
      );
      if (rows?.[0]?.config) {
        const cfg = typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : rows[0].config;
        if (cfg.dailyCatchUp?.time) {
          const parts = cfg.dailyCatchUp.time.split(':');
          catchUpHour = parseInt(parts[0]) || 9;
          catchUpMinute = parseInt(parts[1]) || 0;
        }
        if (cfg.dailyCatchUp?.timezone) catchUpTz = cfg.dailyCatchUp.timezone;
        // If dailyCatchUp is explicitly disabled in Manager tab, respect that
        if (cfg.dailyCatchUp && cfg.dailyCatchUp.enabled === false) return;
      }
    } catch {}

    const now = new Date();
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: catchUpTz }));
    const hour = localTime.getHours();
    const minute = localTime.getMinutes();
    const dayOfWeek = localTime.getDay();
    const dateStr = localTime.toISOString().split('T')[0];

    // Weekly catchup: configurable day, same time as daily
    const isWeeklyCatchupTime = this.settings.weeklyCatchupEnabled
      && dayOfWeek === this.settings.weeklyCatchupDay
      && hour === catchUpHour
      && minute >= catchUpMinute && minute < catchUpMinute + 15;

    // Daily catchup: uses time from Manager & Catch-Up tab
    const isDailyCatchupTime = this.settings.dailyCatchupEnabled
      && hour === catchUpHour
      && minute >= catchUpMinute && minute < catchUpMinute + 15;

    if (!isDailyCatchupTime && !isWeeklyCatchupTime) return;

    // Check if we already sent today's catchup
    const catchupKey = isWeeklyCatchupTime ? `weekly_catchup_${dateStr}` : `daily_catchup_${dateStr}`;
    const alreadySent = await this.checkMemoryFlag(catchupKey);
    if (alreadySent) return;

    console.log(`[autonomy] ${isWeeklyCatchupTime ? 'Weekly' : 'Daily'} catchup time — generating report...`);

    try {
      const catchupData = await this.gatherCatchupData(isWeeklyCatchupTime ? 7 : 1);
      await this.sendCatchupEmail(catchupData, isWeeklyCatchupTime);
      await this.setMemoryFlag(catchupKey);
    } catch (err: any) {
      console.error(`[autonomy] Catchup email error: ${err.message}`);
    }
  }

  private async gatherCatchupData(daysBack: number): Promise<CatchupData> {
    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    const db = this.config.engineDb;
    const agentId = this.config.agentId;

    // Count processed emails
    let emailsHandled = 0;
    try {
      const rows = await db.query<any>(
        `SELECT COUNT(*) as cnt FROM agent_memory WHERE agent_id = $1 AND category = 'processed_email' AND created_at >= $2`,
        [agentId, since]
      );
      emailsHandled = rows?.[0]?.cnt || 0;
    } catch {}

    // Count sessions
    let sessionsRun = 0;
    try {
      const rows = await db.query<any>(
        `SELECT COUNT(*) as cnt FROM agent_sessions WHERE agent_id = $1 AND created_at >= $2`,
        [agentId, since]
      );
      sessionsRun = rows?.[0]?.cnt || 0;
    } catch {}

    // Count memories stored
    let memoriesStored = 0;
    try {
      const rows = await db.query<any>(
        `SELECT COUNT(*) as cnt FROM agent_memory WHERE agent_id = $1 AND created_at >= $2`,
        [agentId, since]
      );
      memoriesStored = rows?.[0]?.cnt || 0;
    } catch {}

    // Get key tasks completed (from Google Tasks memories)
    let tasksCompleted: string[] = [];
    try {
      const taskRows = await db.query<any>(
        `SELECT content FROM agent_memory WHERE agent_id = $1 AND category = 'skill' AND content LIKE '%task%complete%' AND created_at >= $2 ORDER BY created_at DESC LIMIT 10`,
        [agentId, since]
      );
      tasksCompleted = (taskRows || []).map((r: any) => r.content?.slice(0, 200));
    } catch {}

    // Get issues encountered (corrections/errors)
    let issuesEncountered: string[] = [];
    try {
      const issueRows = await db.query<any>(
        `SELECT content FROM agent_memory WHERE agent_id = $1 AND category = 'correction' AND created_at >= $2 ORDER BY created_at DESC LIMIT 5`,
        [agentId, since]
      );
      issuesEncountered = (issueRows || []).map((r: any) => r.content?.slice(0, 200));
    } catch {}

    // Get knowledge gained
    let knowledgeGained: string[] = [];
    try {
      const knowRows = await db.query<any>(
        `SELECT content FROM agent_memory WHERE agent_id = $1 AND (category = 'skill' OR category = 'org_knowledge') AND created_at >= $2 ORDER BY created_at DESC LIMIT 10`,
        [agentId, since]
      );
      knowledgeGained = (knowRows || []).map((r: any) => r.content?.slice(0, 200));
    } catch {}

    return { emailsHandled, sessionsRun, memoriesStored, tasksCompleted, issuesEncountered, knowledgeGained };
  }

  private async sendCatchupEmail(data: CatchupData, isWeekly: boolean): Promise<void> {
    const runtime = this.config.runtime;
    const managerEmail = this.config.managerEmail;
    const agentName = this.config.agentName;
    const role = this.config.role;
    const period = isWeekly ? 'last week' : 'yesterday';
    const nextPeriod = isWeekly ? 'this week' : 'today';

    const prompt = `You need to send your ${isWeekly ? 'weekly' : 'daily'} catchup email to your manager at ${managerEmail}.

Here's what you accomplished ${period}:
- Emails handled: ${data.emailsHandled}
- Sessions/conversations: ${data.sessionsRun}
- Memories stored: ${data.memoriesStored}
- Tasks completed: ${data.tasksCompleted.length > 0 ? data.tasksCompleted.join('; ') : 'None tracked'}
- Issues encountered: ${data.issuesEncountered.length > 0 ? data.issuesEncountered.join('; ') : 'None'}
- Knowledge gained: ${data.knowledgeGained.length > 0 ? data.knowledgeGained.join('; ') : 'None tracked'}

Write and send a concise, professional ${isWeekly ? 'weekly' : 'daily'} summary email. Include:
1. What you accomplished ${period} (be specific, not generic)
2. Any issues or blockers you encountered
3. What you plan to focus on ${nextPeriod}
${isWeekly ? '4. Goals for the week (create Google Tasks for each goal)' : ''}
${isWeekly ? '5. Any suggestions for improvement or areas where you need guidance' : ''}

Keep it under ${isWeekly ? '400' : '250'} words. Be genuine and specific — your manager reads these to stay informed.
Use gmail_send to send the email. Subject: "${isWeekly ? 'Weekly' : 'Daily'} Update — ${agentName}"

${isWeekly ? 'After sending the email, create Google Tasks for your goals this week using google_tasks_create.' : ''}`;

    const systemPrompt = `You are ${agentName}, a ${role}. You are sending your ${isWeekly ? 'weekly' : 'daily'} catchup email to your manager.
Be professional but genuine. Use real data from the summary — don't make up accomplishments.
Available tools: gmail_send (to, subject, body), google_tasks_create (listId, title, notes, dueDate).`;

    try {
      const session = await runtime.spawnSession({
        agentId: this.config.agentId,
        message: prompt,
        systemPrompt,
      });
      console.log(`[autonomy] ✅ ${isWeekly ? 'Weekly' : 'Daily'} catchup email session ${session.id} created`);
    } catch (err: any) {
      console.error(`[autonomy] Failed to send catchup email: ${err.message}`);
    }
  }

  // ─── 3. Goal Setting & Auto-Reminders ──────────────

  private async checkGoalProgress(): Promise<void> {
    if (!this.settings.goalCheckEnabled || !this.config.runtime || !this.clockState.clockedIn) return;

    const now = new Date();
    const tz = this.config.timezone || 'UTC';
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const hour = localTime.getHours();

    // Check goals at configured hours
    const goalHours = this.settings.goalCheckHours || [14, 17];
    if (!goalHours.includes(hour)) return;

    const dateStr = localTime.toISOString().split('T')[0];
    const checkKey = `goal_check_${dateStr}_${hour}`;
    const alreadyChecked = await this.checkMemoryFlag(checkKey);
    if (alreadyChecked) return;

    console.log(`[autonomy] Goal progress check at ${hour}:00`);

    try {
      const isEndOfDay = hour === Math.max(...goalHours);
      const prompt = isEndOfDay
        ? `It's end of day. Review your goals and tasks:
1. Call google_tasks_list to see your current tasks
2. Review what you completed today
3. Mark completed tasks as done with google_tasks_complete
4. For incomplete tasks, update notes with progress
5. Store a brief end-of-day reflection in memory about what went well and what to improve tomorrow
6. If any task is blocked, email your manager at ${this.config.managerEmail || 'your manager'} about it`
        : `Mid-day goal check:
1. Call google_tasks_list to see your current tasks
2. Review progress on today's priorities
3. If you're behind on any task, adjust your approach
4. Store any insights in memory for future reference`;

      const session = await this.config.runtime.spawnSession({
        agentId: this.config.agentId,
        message: prompt,
        systemPrompt: `You are ${this.config.agentName}, a ${this.config.role}. You are doing a ${isEndOfDay ? 'end-of-day' : 'mid-day'} goal review. Be thorough but efficient.`,
      });
      console.log(`[autonomy] ✅ Goal check session ${session.id} created`);
      await this.setMemoryFlag(checkKey);
    } catch (err: any) {
      console.error(`[autonomy] Goal check error: ${err.message}`);
    }
  }

  // ─── 4. Knowledge Contribution (Friday) ────────────

  private async checkKnowledgeContribution(): Promise<void> {
    if (!this.settings.knowledgeContribEnabled || !this.config.runtime || !this.clockState.clockedIn) return;

    const now = new Date();
    const tz = this.config.timezone || 'UTC';
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const dayOfWeek = localTime.getDay();
    const hour = localTime.getHours();
    const dateStr = localTime.toISOString().split('T')[0];

    // Configurable day and hour
    if (dayOfWeek !== this.settings.knowledgeContribDay || hour !== this.settings.knowledgeContribHour) return;

    const contribKey = `knowledge_contribution_${dateStr}`;
    const alreadyDone = await this.checkMemoryFlag(contribKey);
    if (alreadyDone) return;

    console.log('[autonomy] Friday knowledge contribution time!');

    try {
      // Determine role-based category
      const roleCategory = this.mapRoleToKnowledgeCategory(this.config.role);

      const prompt = `It's Friday — time for your weekly knowledge contribution.

Your role is ${this.config.role}, so focus on ${roleCategory} knowledge.

Steps:
1. Search your memory for key learnings this week: memory(action: "search", query: "learned this week")
2. Search for tool patterns you discovered: memory(action: "search", query: "tool")
3. Search for corrections and gotchas: memory(action: "search", query: "correction")
4. Compile the most valuable learnings into knowledge entries
5. For each entry, store it with a clear title and category:
   - memory(action: "set", key: "knowledge-contrib-[topic]", value: "Clear description of the learning, including steps and examples", category: "org_knowledge", importance: "high")

Categories to contribute to (pick the most relevant):
${roleCategory === 'support' ? '- customer-issues: Common customer problems and solutions\n- escalation-procedures: When and how to escalate\n- tool-patterns: Efficient ways to use tools\n- communication-templates: Effective response patterns' : ''}
${roleCategory === 'sales' ? '- objection-handling: How to address common objections\n- product-knowledge: Product features and benefits\n- prospect-research: Effective research methods' : ''}
${roleCategory === 'engineering' ? '- debugging-patterns: Common issues and fixes\n- architecture-decisions: Design choices and rationale\n- tool-expertise: Development tool tips' : ''}
${roleCategory === 'general' ? '- best-practices: General workflow improvements\n- tool-patterns: Tool usage tips\n- process-improvements: Better ways to do things' : ''}

After storing knowledge entries, email your manager a brief summary of what you contributed.
Aim for 3-5 high-quality entries. Quality over quantity.`;

      const session = await this.config.runtime.spawnSession({
        agentId: this.config.agentId,
        message: prompt,
        systemPrompt: `You are ${this.config.agentName}, a ${this.config.role}. You are contributing weekly knowledge to your organization's knowledge base. Focus on ${roleCategory}-related insights. Be specific and actionable — vague entries are useless.`,
      });
      console.log(`[autonomy] ✅ Knowledge contribution session ${session.id} created`);
      await this.setMemoryFlag(contribKey);
    } catch (err: any) {
      console.error(`[autonomy] Knowledge contribution error: ${err.message}`);
    }
  }

  private mapRoleToKnowledgeCategory(role: string): string {
    const roleLower = (role || '').toLowerCase();
    if (roleLower.includes('support') || roleLower.includes('customer') || roleLower.includes('service')) return 'support';
    if (roleLower.includes('sales') || roleLower.includes('business dev')) return 'sales';
    if (roleLower.includes('engineer') || roleLower.includes('developer') || roleLower.includes('technical')) return 'engineering';
    if (roleLower.includes('marketing') || roleLower.includes('content')) return 'marketing';
    if (roleLower.includes('hr') || roleLower.includes('human resource') || roleLower.includes('people')) return 'hr';
    if (roleLower.includes('finance') || roleLower.includes('accounting')) return 'finance';
    if (roleLower.includes('legal') || roleLower.includes('compliance')) return 'legal';
    if (roleLower.includes('research') || roleLower.includes('analyst')) return 'research';
    if (roleLower.includes('operations') || roleLower.includes('ops')) return 'operations';
    return 'general';
  }

  // ─── 5. Smart Answer Escalation ────────────────────

  /**
   * Generates a system prompt addendum that teaches the agent the escalation workflow.
   * This is injected into every email-handling session.
   */
  static getEscalationPrompt(managerEmail: string | undefined, orgDriveFolderId?: string): string {
    return `
== SMART ANSWER WORKFLOW (MANDATORY) ==
When you receive a question or request you're not 100% confident about, follow this escalation chain:

STEP 1: Search your own memory
- memory(action: "search", query: "relevant keywords")
- Check for similar past questions, corrections, and learned patterns

STEP 2: Search organization Drive (shared knowledge)
${orgDriveFolderId ? `- google_drive_list with query "fullText contains 'search terms'" and parents in '${orgDriveFolderId}'` : '- google_drive_list with query "fullText contains \'search terms\'" to search shared docs'}
- Read relevant documents with google_drive_get to find the answer
- Check Google Sheets for data tables, Google Docs for procedures

STEP 3: If still unsure — ESCALATE to manager
${managerEmail ? `- Send an email to ${managerEmail} with:` : '- Send an email to your manager with:'}
  Subject: "Need Guidance: [Brief topic]"
  Body must include:
  a) The original question/request (who asked, what they need)
  b) What you found in your search (memory + Drive results)
  c) Your proposed answer (what you THINK the answer should be)
  d) What specifically you're unsure about
  e) Ask for approval or correction before responding

NEVER guess or fabricate an answer. It's better to escalate than to be wrong.

After receiving manager feedback:
- Store the correct answer in memory as a "correction" or "org_knowledge" entry
- Apply the correction to your response
- Thank the requester for their patience

The goal: build confidence over time. Today you escalate often. In a month, you'll know most answers from memory.`;
  }

  // ─── Helper Methods ────────────────────────────────

  private async checkMemoryFlag(key: string): Promise<boolean> {
    if (!this.config.memoryManager) return false;
    try {
      const results = await this.config.memoryManager.recall(this.config.agentId, key, 1);
      return results.some((m: any) => m.content?.includes(key));
    } catch {
      // Fallback to DB check
      try {
        const rows = await this.config.engineDb.query<any>(
          `SELECT id FROM agent_memory WHERE agent_id = $1 AND content LIKE $2 LIMIT 1`,
          [this.config.agentId, `%${key}%`]
        );
        return (rows && rows.length > 0);
      } catch { return false; }
    }
  }

  private async setMemoryFlag(key: string): Promise<void> {
    if (!this.config.memoryManager) return;
    try {
      await this.config.memoryManager.storeMemory(this.config.agentId, {
        content: `${key}: completed at ${new Date().toISOString()}`,
        category: 'context',
        importance: 'low',
        confidence: 1.0,
      });
    } catch {}
  }
}

// ─── Guardrail Runtime Enforcement ──────────────────────

/**
 * Evaluates guardrail rules against a runtime event.
 * Called from runtime hooks (beforeToolCall, afterToolCall, etc.)
 */
export class GuardrailEnforcer {
  private engineDb: EngineDatabase;
  private rules: Map<string, any> = new Map();
  private lastLoad = 0;
  private readonly RELOAD_INTERVAL = 5 * 60_000; // reload rules every 5 min

  constructor(engineDb: EngineDatabase) {
    this.engineDb = engineDb;
  }

  private async ensureRulesLoaded(): Promise<void> {
    if (Date.now() - this.lastLoad < this.RELOAD_INTERVAL && this.rules.size > 0) return;
    try {
      const rows = await this.engineDb.query<any>('SELECT * FROM guardrail_rules WHERE enabled = TRUE');
      this.rules.clear();
      for (const r of (rows || [])) {
        this.rules.set(r.id, {
          id: r.id, orgId: r.org_id, name: r.name, category: r.category,
          ruleType: r.rule_type,
          conditions: typeof r.conditions === 'string' ? JSON.parse(r.conditions) : (r.conditions || {}),
          action: r.action, severity: r.severity || 'medium',
          cooldownMinutes: r.cooldown_minutes || 0,
          lastTriggeredAt: r.last_triggered_at, triggerCount: r.trigger_count || 0,
        });
      }
      this.lastLoad = Date.now();
    } catch (err: any) {
      console.warn(`[guardrail-enforcer] Failed to load rules: ${err.message}`);
    }
  }

  /**
   * Check if an agent action should be blocked or flagged.
   * Returns { allowed: true } or { allowed: false, reason, action }
   */
  async evaluate(event: {
    agentId: string;
    orgId: string;
    type: 'tool_call' | 'email_send' | 'session_start' | 'memory_write';
    toolName?: string;
    content?: string;
    metadata?: Record<string, any>;
  }): Promise<{ allowed: boolean; reason?: string; action?: string; ruleId?: string }> {
    await this.ensureRulesLoaded();

    for (const rule of this.rules.values()) {
      // Check agent scope
      if (rule.conditions.agentIds?.length > 0 && !rule.conditions.agentIds.includes(event.agentId)) continue;
      // Check org scope
      if (rule.orgId !== event.orgId) continue;
      // Check cooldown
      if (rule.lastTriggeredAt && rule.cooldownMinutes > 0) {
        const cooldownUntil = new Date(rule.lastTriggeredAt).getTime() + rule.cooldownMinutes * 60_000;
        if (Date.now() < cooldownUntil) continue;
      }

      const triggered = await this.evaluateRule(rule, event);
      if (triggered) {
        await this.recordTrigger(rule, event, triggered);
        if (rule.action === 'kill' || rule.action === 'pause') {
          return { allowed: false, reason: triggered, action: rule.action, ruleId: rule.id };
        }
        // alert/notify/log — allow but log
        console.warn(`[guardrail-enforcer] Rule "${rule.name}" triggered: ${triggered} (action: ${rule.action})`);
      }
    }

    return { allowed: true };
  }

  private async evaluateRule(rule: any, event: any): Promise<string | null> {
    switch (rule.ruleType) {
      case 'keyword_detection': {
        if (!event.content) return null;
        const keywords = rule.conditions.keywords || [];
        const contentLower = event.content.toLowerCase();
        for (const kw of keywords) {
          if (contentLower.includes(kw.toLowerCase())) {
            return `Keyword detected: "${kw}" in ${event.type}`;
          }
        }
        return null;
      }

      case 'prompt_injection': {
        if (!event.content) return null;
        const patterns = rule.conditions.patterns || [
          'ignore previous', 'ignore all previous', 'disregard your instructions',
          'you are now', 'new instructions:', 'system prompt:',
          'forget everything', 'override your',
        ];
        const contentLower = event.content.toLowerCase();
        for (const pattern of patterns) {
          if (contentLower.includes(pattern.toLowerCase())) {
            return `Potential prompt injection detected: "${pattern}"`;
          }
        }
        return null;
      }

      case 'data_leak_attempt': {
        if (!event.content) return null;
        const patterns = rule.conditions.patterns || [
          '\\b\\d{3}-\\d{2}-\\d{4}\\b',     // SSN
          '\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b', // Credit card
          '\\bpassword\\s*[:=]\\s*\\S+',      // Password in text
        ];
        for (const pattern of patterns) {
          try {
            if (new RegExp(pattern, 'i').test(event.content)) {
              return `Potential data leak: pattern "${pattern}" matched`;
            }
          } catch {} // invalid regex, skip
        }
        return null;
      }

      case 'off_hours': {
        if (event.type !== 'session_start' && event.type !== 'tool_call') return null;
        // Check against agent's schedule
        try {
          const schedRows = await this.engineDb.query<any>(
            `SELECT * FROM work_schedules WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [event.agentId]
          );
          if (schedRows && schedRows.length > 0) {
            const sched = schedRows[0];
            const config = typeof sched.config === 'string' ? JSON.parse(sched.config) : (sched.config || {});
            const hours = config.standardHours;
            if (hours?.start && hours?.end) {
              const tz = config.timezone || 'UTC';
              const localTime = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
              const currentHour = `${String(localTime.getHours()).padStart(2, '0')}:${String(localTime.getMinutes()).padStart(2, '0')}`;
              if (currentHour < hours.start || currentHour >= hours.end) {
                return `Activity outside work hours (${hours.start}-${hours.end} ${tz})`;
              }
            }
          }
        } catch {}
        return null;
      }

      case 'memory_flood': {
        if (event.type !== 'memory_write') return null;
        const maxPerHour = rule.conditions.maxPerHour || 50;
        try {
          const since = new Date(Date.now() - 60 * 60_000).toISOString();
          const rows = await this.engineDb.query<any>(
            `SELECT COUNT(*) as cnt FROM agent_memory WHERE agent_id = $1 AND created_at >= $2`,
            [event.agentId, since]
          );
          const count = rows?.[0]?.cnt || 0;
          if (count > maxPerHour) {
            return `Memory flood: ${count} writes in last hour (max: ${maxPerHour})`;
          }
        } catch {}
        return null;
      }

      case 'tone_violation': {
        if (!event.content || event.type !== 'email_send') return null;
        const keywords = rule.conditions.keywords || ['urgent', 'asap', 'immediately'];
        const contentLower = event.content.toLowerCase();
        let violations = 0;
        for (const kw of keywords) {
          if (contentLower.includes(kw.toLowerCase())) violations++;
        }
        if (violations >= (rule.conditions.threshold || 2)) {
          return `Tone issue: ${violations} flagged words in outgoing email`;
        }
        return null;
      }

      default:
        return null;
    }
  }

  private async recordTrigger(rule: any, event: any, detail: string): Promise<void> {
    try {
      // Update trigger count and last triggered
      await this.engineDb.execute(
        `UPDATE guardrail_rules SET trigger_count = trigger_count + 1, last_triggered_at = $1 WHERE id = $2`,
        [new Date().toISOString(), rule.id]
      );
      // Update cached rule
      rule.triggerCount = (rule.triggerCount || 0) + 1;
      rule.lastTriggeredAt = new Date().toISOString();

      // Record intervention
      await this.engineDb.execute(
        `INSERT INTO interventions (id, org_id, agent_id, type, reason, triggered_by, metadata, created_at) VALUES ($1, $2, $3, 'anomaly_detected', $4, 'guardrail_enforcer', $5, $6)`,
        [crypto.randomUUID(), rule.orgId, event.agentId, `Rule "${rule.name}": ${detail}`,
         JSON.stringify({ ruleId: rule.id, ruleType: rule.ruleType, eventType: event.type, severity: rule.severity }),
         new Date().toISOString()]
      );
    } catch (err: any) {
      console.warn(`[guardrail-enforcer] Failed to record trigger: ${err.message}`);
    }
  }
}
