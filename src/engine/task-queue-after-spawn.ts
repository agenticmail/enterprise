/**
 * Task Queue — After Spawn Hook
 *
 * Called AFTER an agent finishes a task (success, failure, or cancellation).
 * Records the outcome, model used, tokens, cost, and any result metadata.
 */

import type { TaskQueueManager, TaskStatus } from './task-queue.js';

export interface AfterSpawnContext {
  taskId: string;
  status: 'completed' | 'failed' | 'cancelled';
  result?: Record<string, unknown>;
  error?: string;
  modelUsed?: string;
  tokensUsed?: number;
  costUsd?: number;
  sessionId?: string;
}

/**
 * Record task outcome AFTER the agent finishes.
 */
export async function afterSpawn(
  taskQueue: TaskQueueManager,
  ctx: AfterSpawnContext
): Promise<void> {
  const updates: Record<string, unknown> = {
    status: ctx.status as TaskStatus,
  };

  if (ctx.result) updates.result = ctx.result;
  if (ctx.error) updates.error = ctx.error;
  if (ctx.modelUsed) updates.modelUsed = ctx.modelUsed;
  if (ctx.tokensUsed !== undefined) updates.tokensUsed = ctx.tokensUsed;
  if (ctx.costUsd !== undefined) updates.costUsd = ctx.costUsd;
  if (ctx.sessionId) updates.sessionId = ctx.sessionId;

  await taskQueue.updateTask(ctx.taskId, updates as any);
}

/**
 * Mark a task as in_progress (call when agent session actually starts executing).
 */
export async function markInProgress(
  taskQueue: TaskQueueManager,
  taskId: string,
  opts?: { sessionId?: string; modelUsed?: string }
): Promise<void> {
  await taskQueue.updateTask(taskId, {
    status: 'in_progress',
    ...(opts?.sessionId ? { sessionId: opts.sessionId } : {}),
    ...(opts?.modelUsed ? { modelUsed: opts.modelUsed } : {}),
  });
}

/**
 * Update task progress (0-100) during execution.
 */
export async function updateProgress(
  taskQueue: TaskQueueManager,
  taskId: string,
  progress: number
): Promise<void> {
  await taskQueue.updateTask(taskId, { progress: Math.min(100, Math.max(0, progress)) });
}
