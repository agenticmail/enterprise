/**
 * Sub-Agent Lifecycle Manager
 *
 * Handles spawning child agents with their own sessions.
 * Sub-agents inherit the parent's org context and can optionally
 * get their own email accounts.
 */

import { nanoid } from 'nanoid';
import type { ModelConfig, SessionState } from './types.js';

// ─── Types ───────────────────────────────────────────────

export interface SubAgentInfo {
  id: string;
  parentSessionId: string;
  childSessionId: string;
  agentId: string;
  task: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  email?: string;
  createdAt: number;
  completedAt?: number;
}

export interface SpawnSubAgentOptions {
  parentSessionId: string;
  task: string;
  agentId?: string;
  name?: string;
  model?: ModelConfig;
}

export interface SpawnSubAgentResult {
  id: string;
  childSessionId: string;
  agentId: string;
  status: 'accepted' | 'error';
  error?: string;
}

// ─── Sub-Agent Manager ───────────────────────────────────

export class SubAgentManager {
  /** Active sub-agent records keyed by parent session ID */
  private subAgents = new Map<string, SubAgentInfo[]>();
  /** Max children per parent session */
  private maxChildrenPerParent: number;
  /** Max spawn depth */
  private maxSpawnDepth: number;

  constructor(opts?: { maxChildrenPerParent?: number; maxSpawnDepth?: number }) {
    this.maxChildrenPerParent = opts?.maxChildrenPerParent ?? 5;
    this.maxSpawnDepth = opts?.maxSpawnDepth ?? 2;
  }

  /**
   * Register a new sub-agent spawn.
   */
  register(info: SubAgentInfo): void {
    var existing = this.subAgents.get(info.parentSessionId) || [];
    existing.push(info);
    this.subAgents.set(info.parentSessionId, existing);
  }

  /**
   * Check if spawning is allowed for this parent session.
   */
  canSpawn(parentSessionId: string): { allowed: boolean; reason?: string } {
    var children = this.subAgents.get(parentSessionId) || [];
    var activeCount = children.filter(function(c) { return c.status === 'active'; }).length;

    if (activeCount >= this.maxChildrenPerParent) {
      return {
        allowed: false,
        reason: `Max active sub-agents reached (${activeCount}/${this.maxChildrenPerParent})`,
      };
    }

    return { allowed: true };
  }

  /**
   * Get depth of a session in the sub-agent tree.
   */
  getDepth(sessionId: string): number {
    var depth = 0;
    // Walk up the tree
    for (var [parentId, children] of this.subAgents) {
      for (var child of children) {
        if (child.childSessionId === sessionId) {
          return 1 + this.getDepth(parentId);
        }
      }
    }
    return depth;
  }

  /**
   * Mark a sub-agent as completed.
   */
  complete(childSessionId: string, status: 'completed' | 'failed'): void {
    for (var [, children] of this.subAgents) {
      for (var child of children) {
        if (child.childSessionId === childSessionId) {
          child.status = status;
          child.completedAt = Date.now();
          return;
        }
      }
    }
  }

  /**
   * List sub-agents for a parent session.
   */
  listForParent(parentSessionId: string): SubAgentInfo[] {
    return this.subAgents.get(parentSessionId) || [];
  }

  /**
   * Cancel all active sub-agents for a parent.
   */
  cancelAll(parentSessionId: string): string[] {
    var children = this.subAgents.get(parentSessionId) || [];
    var cancelled: string[] = [];
    for (var child of children) {
      if (child.status === 'active') {
        child.status = 'cancelled';
        child.completedAt = Date.now();
        cancelled.push(child.childSessionId);
      }
    }
    return cancelled;
  }

  /**
   * Clean up all records for a parent session.
   */
  cleanup(parentSessionId: string): void {
    this.subAgents.delete(parentSessionId);
  }

  /**
   * Get total active sub-agent count across all parents.
   */
  getActiveCount(): number {
    var count = 0;
    for (var [, children] of this.subAgents) {
      count += children.filter(function(c) { return c.status === 'active'; }).length;
    }
    return count;
  }
}
