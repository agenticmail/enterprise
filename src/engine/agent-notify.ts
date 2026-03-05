/**
 * Agent Notification — Push config changes to standalone agent processes in real-time.
 * 
 * When any config is changed from the dashboard, call notifyAgent() to tell
 * the agent process to reload from DB immediately.
 */

import type { AgentLifecycleManager } from './lifecycle.js';

type ReloadScope = 'all' | 'config' | 'permissions' | 'db-access' | 'budget' | 'guardrails';

/**
 * Notify a standalone agent process to reload its config.
 * Non-blocking — failures are silently ignored (agent may be offline).
 */
export async function notifyAgent(agentId: string, scope: ReloadScope, lifecycle?: AgentLifecycleManager): Promise<boolean> {
  const port = resolveAgentPort(agentId, lifecycle);
  if (!port) return false;

  try {
    const resp = await fetch(`http://127.0.0.1:${port}/reload?scope=${scope}`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
    if (resp.ok) {
      const data = await resp.json() as any;
      console.log(`[notify] Agent ${agentId} reloaded: ${data.reloaded?.join(', ') || scope}`);
      return true;
    }
  } catch { /* agent offline or unreachable — that's fine */ }
  return false;
}

/**
 * Notify ALL running standalone agents to reload.
 */
export async function notifyAllAgents(scope: ReloadScope, lifecycle?: AgentLifecycleManager): Promise<void> {
  if (!lifecycle) return;
  const agents = lifecycle.getAllAgents().filter(a => a.state === 'running');
  await Promise.allSettled(agents.map(a => notifyAgent(a.id, scope, lifecycle)));
}

function resolveAgentPort(agentId: string, lifecycle?: AgentLifecycleManager): number | null {
  if (!lifecycle) return null;
  const agent = lifecycle.getAgent(agentId);
  if (!agent) return null;

  const dep = agent.config?.deployment;
  return dep?.port || dep?.config?.local?.port || null;
}
