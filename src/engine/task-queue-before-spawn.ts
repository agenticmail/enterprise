/**
 * Task Queue — Before Spawn Hook
 *
 * Called BEFORE an agent is spawned for a task. Records the task intent
 * with smart metadata extraction from the request context.
 *
 * Usage:
 *   const taskId = await beforeSpawn(taskQueue, { ... });
 *   // ... spawn agent ...
 *   await afterSpawn(taskQueue, taskId, { ... });
 */

import type { TaskQueueManager, TaskPriority } from './task-queue.js';

export interface BeforeSpawnContext {
  orgId: string;
  agentId: string;
  agentName: string;
  createdBy?: string;        // who initiated — agent ID, user ID, or 'system'
  createdByName?: string;
  task: string;              // raw task description
  model?: string;
  fallbackModel?: string;
  sessionId?: string;
  parentTaskId?: string;
  relatedAgentIds?: string[];
  priority?: TaskPriority;
  estimatedDurationMs?: number;
  source?: string;           // 'telegram' | 'whatsapp' | 'email' | 'google_chat' | 'internal' | 'api'
}

/**
 * Extract smart metadata from a task description.
 * Infers category, title, tags, and priority from natural language.
 */
function extractTaskMetadata(task: string): {
  title: string;
  category: string;
  tags: string[];
  priority: TaskPriority;
} {
  const lower = task.toLowerCase();

  // Extract a short title (first sentence or first 80 chars)
  let title = task.split(/[.\n!?]/)[0]?.trim() || task;
  if (title.length > 80) title = title.slice(0, 77) + '...';

  // Infer category
  let category = 'custom';
  if (/\b(email|inbox|reply|forward|send mail|compose)\b/.test(lower)) category = 'email';
  else if (/\b(research|search|find|look up|investigate|analyze)\b/.test(lower)) category = 'research';
  else if (/\b(meeting|calendar|schedule|call|agenda)\b/.test(lower)) category = 'meeting';
  else if (/\b(workflow|pipeline|automat|process|batch)\b/.test(lower)) category = 'workflow';
  else if (/\b(write|draft|document|report|summary|blog|article)\b/.test(lower)) category = 'writing';
  else if (/\b(deploy|build|compile|publish|release|ship)\b/.test(lower)) category = 'deployment';
  else if (/\b(review|approve|check|audit|verify)\b/.test(lower)) category = 'review';
  else if (/\b(monitor|watch|track|alert|notify)\b/.test(lower)) category = 'monitoring';

  // Extract tags from common patterns
  const tags: string[] = [];
  if (/\burgent\b/i.test(task)) tags.push('urgent');
  if (/\basap\b/i.test(task)) tags.push('asap');
  if (/\bfollow[- ]?up\b/i.test(task)) tags.push('follow-up');
  if (/\bbug\b|error\b|fix\b/i.test(task)) tags.push('bug-fix');
  if (/\bcustomer\b|client\b/i.test(task)) tags.push('customer');
  if (/\binternal\b/i.test(task)) tags.push('internal');

  // Infer priority
  let priority: TaskPriority = 'normal';
  if (/\b(urgent|critical|emergency|asap|immediately)\b/i.test(task)) priority = 'urgent';
  else if (/\b(important|high.?priority|priority|rush)\b/i.test(task)) priority = 'high';
  else if (/\b(low.?priority|when.?you.?can|no.?rush|whenever)\b/i.test(task)) priority = 'low';

  return { title, category, tags, priority };
}

/**
 * Record a task BEFORE spawning the agent.
 * Returns the task ID for linking with afterSpawn.
 */
export async function beforeSpawn(
  taskQueue: TaskQueueManager,
  ctx: BeforeSpawnContext
): Promise<string> {
  const meta = extractTaskMetadata(ctx.task);

  const task = await taskQueue.createTask({
    orgId: ctx.orgId,
    assignedTo: ctx.agentId,
    assignedToName: ctx.agentName,
    createdBy: ctx.createdBy || 'system',
    createdByName: ctx.createdByName || 'System',
    title: meta.title,
    description: ctx.task,
    category: meta.category,
    tags: meta.tags,
    priority: ctx.priority || meta.priority,
    parentTaskId: ctx.parentTaskId,
    relatedAgentIds: ctx.relatedAgentIds,
    sessionId: ctx.sessionId,
    model: ctx.model,
    fallbackModel: ctx.fallbackModel,
    estimatedDurationMs: ctx.estimatedDurationMs,
    source: ctx.source,
  });

  // Immediately mark as assigned
  await taskQueue.updateTask(task.id, { status: 'assigned' });

  return task.id;
}
