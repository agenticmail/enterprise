/**
 * System Prompts — Centralized prompt management for enterprise agents.
 * 
 * Each task type has its own prompt file. Prompts are pure functions that
 * accept context and return a string. No side effects, no DB calls.
 * 
 * To add a new prompt:
 * 1. Create a new file: src/system-prompts/my-task.ts
 * 2. Export a function: (ctx: PromptContext) => string
 * 3. Register it in this index file
 * 
 * Prompt files should be small and focused. One file per task type.
 */

// ─── Shared Context Types ───────────────────────────

export interface AgentIdentity {
  name: string;
  role: string;
  personality?: string;
  traits?: string[];
  description?: string;
}

export interface ScheduleInfo {
  start: string;
  end: string;
  days: number[];
  timezone: string;
  isOnDuty: boolean;
  currentTime: string;
  currentDay: string;
}

export interface PromptContext {
  agent: AgentIdentity;
  schedule?: ScheduleInfo;
  managerEmail?: string;
}

// ─── Utility: Build schedule block ──────────────────

export function buildScheduleBlock(schedule?: ScheduleInfo): string {
  if (!schedule) return '';
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const workDays = schedule.days.map(d => dayNames[d]).join(', ');
  return `
## Work Schedule
- Hours: ${schedule.start}–${schedule.end} ${schedule.timezone}
- Days: ${workDays}
- Current: ${schedule.currentDay} ${schedule.currentTime} ${schedule.timezone} — ${schedule.isOnDuty ? 'ON DUTY' : 'OFF DUTY'}
`;
}

export function buildScheduleInfo(
  schedule?: { start: string; end: string; days: number[] },
  timezone?: string
): ScheduleInfo | undefined {
  if (!schedule) return undefined;
  const tz = timezone || 'UTC';
  const now = new Date();
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentTime = `${String(localTime.getHours()).padStart(2, '0')}:${String(localTime.getMinutes()).padStart(2, '0')}`;
  const currentDay = dayNames[localTime.getDay()];
  const isWorkday = schedule.days.includes(localTime.getDay());
  const isWorkHours = currentTime >= schedule.start && currentTime < schedule.end;

  return {
    ...schedule,
    timezone: tz,
    isOnDuty: isWorkday && isWorkHours,
    currentTime,
    currentDay,
  };
}

// ─── Re-exports ─────────────────────────────────────

// Provider-specific prompts (partitioned by integration)
export * from './google/index.js';
export * from './microsoft/index.js';

// Generic prompts (provider-agnostic)
export { buildTaskPrompt, type TaskContext } from './task.js';
export { buildCatchupPrompt, type CatchupContext } from './catchup.js';
export { buildTriagePrompt, type TriageContext } from './triage.js';
export { BROWSER_RULES } from './shared-blocks.js';
