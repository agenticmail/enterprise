/**
 * Skill: Agent Management (Hierarchy, Delegation, Escalation)
 *
 * Enables manager agents to delegate tasks to subordinates,
 * subordinates to update status and escalate, and all agents
 * to see their position in the org chart.
 */

import type { SkillDefinition } from '../skills.js';

export const agentManagementSkill: SkillDefinition = {
  id: 'agent-management',
  name: 'Agent Management',
  description: 'Organizational hierarchy — delegation, escalation, team status, org chart',
  category: 'utility',
  icon: 'building',
  risk: 'medium',
  tools: [
    {
      id: 'team_status',
      name: 'team_status',
      description: 'Get status of direct reports.',
      category: 'utility',
      risk: 'low',
      skillId: 'agent-management',
      sideEffects: [],
    },
    {
      id: 'team_delegate_task',
      name: 'team_delegate_task',
      description: 'Delegate a task to a subordinate.',
      category: 'utility',
      risk: 'medium',
      skillId: 'agent-management',
      sideEffects: ['database_write'],
    },
    {
      id: 'team_tasks',
      name: 'team_tasks',
      description: 'List delegated tasks.',
      category: 'utility',
      risk: 'low',
      skillId: 'agent-management',
      sideEffects: [],
    },
    {
      id: 'team_reassign_task',
      name: 'team_reassign_task',
      description: 'Reassign a task to a different agent.',
      category: 'utility',
      risk: 'medium',
      skillId: 'agent-management',
      sideEffects: ['database_write'],
    },
    {
      id: 'team_feedback',
      name: 'team_feedback',
      description: 'Provide feedback on a completed task.',
      category: 'utility',
      risk: 'low',
      skillId: 'agent-management',
      sideEffects: ['database_write'],
    },
    {
      id: 'team_resolve_escalation',
      name: 'team_resolve_escalation',
      description: 'Resolve a pending escalation.',
      category: 'utility',
      risk: 'medium',
      skillId: 'agent-management',
      sideEffects: ['database_write'],
    },
    {
      id: 'team_forward_escalation',
      name: 'team_forward_escalation',
      description: 'Forward an escalation up the chain.',
      category: 'utility',
      risk: 'medium',
      skillId: 'agent-management',
      sideEffects: ['database_write'],
    },
    {
      id: 'team_org_chart',
      name: 'team_org_chart',
      description: 'View the organization chart.',
      category: 'utility',
      risk: 'low',
      skillId: 'agent-management',
      sideEffects: [],
    },
    {
      id: 'task_update',
      name: 'task_update',
      description: 'Update a task assigned to you.',
      category: 'utility',
      risk: 'low',
      skillId: 'agent-management',
      sideEffects: ['database_write'],
    },
    {
      id: 'my_tasks',
      name: 'my_tasks',
      description: 'List tasks assigned to you.',
      category: 'utility',
      risk: 'low',
      skillId: 'agent-management',
      sideEffects: [],
    },
    {
      id: 'escalate',
      name: 'escalate',
      description: 'Escalate an issue to your manager.',
      category: 'utility',
      risk: 'medium',
      skillId: 'agent-management',
      sideEffects: ['database_write'],
    },
  ],
};
