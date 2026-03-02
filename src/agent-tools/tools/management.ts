/**
 * Management Tools — Agent hierarchy, delegation, escalation
 *
 * Enterprise-grade management tools that handle real org edge cases:
 * - Pre-delegation checks (online? clocked in? has tools? overloaded?)
 * - Communication via best available channel (Google Chat > Gmail > internal)
 * - SLA-based task tracking with automatic due dates
 * - Workload-aware delegation with alternative suggestions
 * - Manager check-in and task reassignment
 */

import type { ToolDefinition } from '../../engine/skills.js';

export function createManagementTools(deps: {
  hierarchyManager: any;
  agentId: string;
  runtime?: any;
}): ToolDefinition[] {
  const { hierarchyManager: hm, agentId } = deps;
  if (!hm) return [];

  const tools: ToolDefinition[] = [];

  // ─── Manager Tools ────────────────────────────────────

  tools.push({
    name: 'team_status',
    description: 'Get status of all your direct reports: availability, workload, errors, tasks.',
    input_schema: { type: 'object', properties: {} },
    async execute(_id: string, _input: any) {
      try {
        const status = await hm.getTeamStatus(agentId);
        if (status.teamSize === 0) {
          return { content: [{ type: 'text', text: 'You have no direct reports.' }] };
        }

        const lines: string[] = [`Team Status (${status.teamSize} reports, ${status.availableCount} available):\n`];
        for (const r of status.directReports) {
          const stateIcon = r.available ? 'AVAILABLE' : r.state === 'running' ? (r.clockedIn ? 'BUSY' : 'NOT CLOCKED IN') : r.state.toUpperCase();
          const warnings: string[] = [];
          if (r.overdueTasks > 0) warnings.push(`${r.overdueTasks} OVERDUE`);
          if (r.blockedTasks > 0) warnings.push(`${r.blockedTasks} BLOCKED`);
          if (r.errorsToday > 5) warnings.push(`${r.errorsToday} errors`);
          const warnStr = warnings.length > 0 ? ` ⚠ ${warnings.join(', ')}` : '';
          lines.push(`${r.name} (${r.role}) [${stateIcon}] — ${r.capacityPercent}% capacity, ${r.pendingTasks} pending, ${r.inProgressTasks} active, ${r.completedTasksToday} done today${warnStr}`);
        }

        if (status.totalOverdueTasks > 0) {
          lines.push(`\nWARNING: ${status.totalOverdueTasks} total overdue task(s) across team.`);
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  });

  tools.push({
    name: 'team_delegate_task',
    description: 'Delegate a task to a direct report. Checks availability, workload, and capabilities first.',
    input_schema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID of the subordinate' },
        agentName: { type: 'string', description: 'Name of the subordinate (resolved to ID)' },
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        dueDate: { type: 'string', description: 'ISO date (auto-calculated from priority if omitted)' },
        requiredTools: { type: 'array', items: { type: 'string' }, description: 'Tools/skills needed for this task' },
      },
      required: ['title', 'description'],
    },
    async execute(_id: string, input: any) {
      try {
        let targetId = input.agentId;

        // Resolve by name
        if (!targetId && input.agentName) {
          const reports = await hm.getDirectReports(agentId);
          const match = reports.find((r: any) =>
            r.name.toLowerCase().includes(input.agentName.toLowerCase())
          );
          if (!match) {
            return { content: [{ type: 'text', text: `No direct report found matching "${input.agentName}". Use team_status to see your team.` }], isError: true };
          }
          targetId = match.agentId;
        }

        if (!targetId) {
          return { content: [{ type: 'text', text: 'Provide agentId or agentName.' }], isError: true };
        }

        // ─── Pre-delegation checks ───
        const check = await hm.checkDelegation(agentId, targetId, {
          requiredTools: input.requiredTools,
          priority: input.priority,
        });

        if (!check.canDelegate) {
          let response = `Cannot delegate to this agent:\n${check.blockers.join('\n')}`;
          if (check.alternativeAgentId) {
            response += `\n\nSuggested alternative: ${check.alternativeReason}. Use team_delegate_task with agentId: "${check.alternativeAgentId}".`;
          }
          return { content: [{ type: 'text', text: response }], isError: true };
        }

        // Show warnings but proceed
        let warningBlock = '';
        if (check.warnings.length > 0) {
          warningBlock = `\nWarnings:\n${check.warnings.join('\n')}\n`;
          if (check.alternativeAgentId) {
            warningBlock += `Consider: ${check.alternativeReason} (agentId: "${check.alternativeAgentId}").\n`;
          }
        }

        // ─── Delegate ───
        const task = await hm.delegateTask(agentId, targetId, {
          title: input.title,
          description: input.description,
          priority: input.priority,
          dueDate: input.dueDate,
          requiredTools: input.requiredTools,
        });

        // ─── Communication instructions ───
        const comm = await hm.resolveCommChannel(agentId, targetId);
        const hierarchy = await hm.buildHierarchy();
        const subNode = hierarchy.get(targetId);
        const dueStr = task.dueDate ? `\nDue: ${new Date(task.dueDate).toLocaleString()}` : '';
        const slaStr = task.slaHours ? ` (SLA: ${task.slaHours}h)` : '';

        return { content: [{ type: 'text', text: `Task delegated.
ID: ${task.id}
To: ${subNode?.name || targetId}
Title: ${task.title}
Priority: ${task.priority.toUpperCase()}${slaStr}${dueStr}
${warningBlock}
NOW NOTIFY ${subNode?.name || 'the agent'} via ${comm.channel.toUpperCase()}:
${comm.instructions}

Send this message:
"New Task Assigned: ${task.title}
Priority: ${task.priority.toUpperCase()}${dueStr}

${task.description}

Task ID: ${task.id}"` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  });

  tools.push({
    name: 'team_tasks',
    description: 'List tasks you delegated. Filter by status.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'accepted', 'in_progress', 'blocked', 'completed', 'rejected', 'expired', 'reassigned'] },
      },
    },
    async execute(_id: string, input: any) {
      try {
        const tasks = await hm.getTasksByManager(agentId, input.status);
        if (tasks.length === 0) {
          return { content: [{ type: 'text', text: input.status ? `No ${input.status} tasks.` : 'No delegated tasks.' }] };
        }

        const hierarchy = await hm.buildHierarchy();
        const now = new Date();
        const summary = tasks.map((t: any) => {
          const sub = hierarchy.get(t.toAgentId);
          const overdue = t.dueDate && new Date(t.dueDate) < now && !['completed', 'expired', 'reassigned'].includes(t.status) ? ' OVERDUE' : '';
          const dueStr = t.dueDate ? ` (due: ${new Date(t.dueDate).toLocaleString()})` : '';
          return `[${t.priority.toUpperCase()}${overdue}] ${t.title} → ${sub?.name || t.toAgentId} | ${t.status}${dueStr}${t.result ? ` | Result: ${t.result.slice(0, 200)}` : ''}${t.blockerReason ? ` | BLOCKED: ${t.blockerReason}` : ''}`;
        });

        return { content: [{ type: 'text', text: summary.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  });

  tools.push({
    name: 'team_reassign_task',
    description: 'Reassign a task to a different agent (original agent offline, overloaded, or wrong fit).',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        newAgentId: { type: 'string' },
        newAgentName: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['taskId', 'reason'],
    },
    async execute(_id: string, input: any) {
      try {
        let targetId = input.newAgentId;
        if (!targetId && input.newAgentName) {
          const reports = await hm.getDirectReports(agentId);
          const match = reports.find((r: any) => r.name.toLowerCase().includes(input.newAgentName.toLowerCase()));
          if (match) targetId = match.agentId;
        }
        if (!targetId) {
          return { content: [{ type: 'text', text: 'Provide newAgentId or newAgentName.' }], isError: true };
        }

        await hm.reassignTask(input.taskId, targetId, input.reason);

        const comm = await hm.resolveCommChannel(agentId, targetId);
        const hierarchy = await hm.buildHierarchy();
        const newAgent = hierarchy.get(targetId);

        return { content: [{ type: 'text', text: `Task reassigned to ${newAgent?.name || targetId}.\nReason: ${input.reason}\n\nNotify them via ${comm.channel.toUpperCase()}:\n${comm.instructions}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  });

  tools.push({
    name: 'team_feedback',
    description: 'Provide feedback on a completed task.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        feedback: { type: 'string' },
      },
      required: ['taskId', 'feedback'],
    },
    async execute(_id: string, input: any) {
      try {
        await hm.provideFeedback(input.taskId, agentId, input.feedback);
        return { content: [{ type: 'text', text: 'Feedback submitted.' }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  });

  tools.push({
    name: 'team_resolve_escalation',
    description: 'Resolve a pending escalation from a subordinate.',
    input_schema: {
      type: 'object',
      properties: {
        escalationId: { type: 'string' },
        resolution: { type: 'string' },
      },
      required: ['escalationId', 'resolution'],
    },
    async execute(_id: string, input: any) {
      try {
        await hm.resolveEscalation(input.escalationId, input.resolution);
        return { content: [{ type: 'text', text: `Escalation resolved. Send the resolution back to the agent who escalated.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  });

  tools.push({
    name: 'team_forward_escalation',
    description: 'Forward an escalation to YOUR manager (re-escalate up the chain).',
    input_schema: {
      type: 'object',
      properties: { escalationId: { type: 'string' } },
      required: ['escalationId'],
    },
    async execute(_id: string, input: any) {
      try {
        const result = await hm.forwardEscalation(input.escalationId, agentId);
        if (result.externalManager) {
          return { content: [{ type: 'text', text: `Forwarded to external manager: ${result.externalManager.name} (${result.externalManager.email}). Email them the details.` }] };
        }
        const comm = await hm.resolveCommChannel(agentId, result.escalatedTo?.agentId || '');
        return { content: [{ type: 'text', text: `Forwarded to ${result.escalatedTo?.name || 'your manager'}.\nNotify via ${comm.channel.toUpperCase()}: ${comm.instructions}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  });

  tools.push({
    name: 'team_org_chart',
    description: 'View the full organization chart with agent states and workload.',
    input_schema: { type: 'object', properties: {} },
    async execute() {
      try {
        const chart = await hm.buildOrgChart();
        return { content: [{ type: 'text', text: chart }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  });

  // ─── Subordinate Tools ────────────────────────────────

  tools.push({
    name: 'task_update',
    description: 'Update the status of a task assigned to you.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        status: { type: 'string', enum: ['accepted', 'in_progress', 'completed', 'blocked', 'rejected'] },
        result: { type: 'string', description: 'Summary of what you did (for completed)' },
        blockerReason: { type: 'string', description: 'Why you are blocked' },
      },
      required: ['taskId', 'status'],
    },
    async execute(_id: string, input: any) {
      try {
        await hm.updateTaskStatus(input.taskId, agentId, {
          status: input.status,
          result: input.result,
          blockerReason: input.blockerReason,
        });

        // If completed or blocked, tell agent to notify manager
        let notify = '';
        if (input.status === 'completed' || input.status === 'blocked') {
          try {
            const hierarchy = await hm.buildHierarchy();
            const node = hierarchy.get(agentId);
            if (node?.managerId && hierarchy.has(node.managerId)) {
              const comm = await hm.resolveCommChannel(agentId, node.managerId);
              const mgrName = hierarchy.get(node.managerId)!.name;
              const msg = input.status === 'completed'
                ? `Task completed: ${input.result || 'Done'}`
                : `Task BLOCKED: ${input.blockerReason || 'Unknown'}`;
              notify = `\n\nNotify your manager (${mgrName}) via ${comm.channel.toUpperCase()}:\n${comm.instructions}\nMessage: "${msg}\nTask ID: ${input.taskId}"`;
            }
          } catch {}
        }

        return { content: [{ type: 'text', text: `Task ${input.taskId} → ${input.status}${notify}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  });

  tools.push({
    name: 'my_tasks',
    description: 'List tasks assigned to you by your manager.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'accepted', 'in_progress', 'blocked', 'completed'] },
      },
    },
    async execute(_id: string, input: any) {
      try {
        const tasks = await hm.getTasksForAgent(agentId, input.status);
        if (tasks.length === 0) {
          return { content: [{ type: 'text', text: 'No tasks assigned to you.' }] };
        }

        const hierarchy = await hm.buildHierarchy();
        const now = new Date();
        const summary = tasks.map((t: any) => {
          const from = hierarchy.get(t.fromAgentId);
          const overdue = t.dueDate && new Date(t.dueDate) < now && !['completed'].includes(t.status) ? ' OVERDUE' : '';
          const dueStr = t.dueDate ? ` | Due: ${new Date(t.dueDate).toLocaleString()}` : '';
          return `[${t.priority.toUpperCase()}${overdue}] ${t.title} (from ${from?.name || 'manager'}) | ${t.status}${dueStr}${t.feedback ? ` | Feedback: ${t.feedback}` : ''}`;
        });

        return { content: [{ type: 'text', text: summary.join('\n') }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  });

  tools.push({
    name: 'escalate',
    description: 'Escalate an issue to your manager when you cannot resolve it yourself.',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        context: { type: 'string', description: 'What you tried and why you need help' },
      },
      required: ['subject', 'context'],
    },
    async execute(_id: string, input: any) {
      try {
        const result = await hm.escalate(agentId, input.subject, input.context);

        if (result.externalManager) {
          const hierarchy = await hm.buildHierarchy();
          const node = hierarchy.get(agentId);
          const useGmail = node?.comm.hasGmail;
          return { content: [{ type: 'text', text: `Escalation created (ID: ${result.escalationId}).
Your manager is external: ${result.externalManager.name} (${result.externalManager.email}).
${useGmail ? `Send via gmail_send(to: "${result.externalManager.email}", subject: "Escalation: ${input.subject}", body: "${input.context}")` : `Email ${result.externalManager.email} with the details.`}` }] };
        }

        if (result.escalatedTo) {
          const comm = await hm.resolveCommChannel(agentId, result.escalatedTo.agentId);
          return { content: [{ type: 'text', text: `Escalated to ${result.escalatedTo.name}. ID: ${result.escalationId}

Notify via ${comm.channel.toUpperCase()}:
${comm.instructions}

Message: "Escalation: ${input.subject}\n\n${input.context}\n\nEscalation ID: ${result.escalationId}"` }] };
        }

        return { content: [{ type: 'text', text: `Escalation created (ID: ${result.escalationId}) but no manager configured. Ask an admin to assign you a manager.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  });

  return tools;
}
