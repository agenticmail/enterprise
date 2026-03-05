/**
 * Microsoft Planner Tools
 *
 * Project/task management boards via Microsoft Graph API.
 * Planner is Microsoft's Kanban board tool (similar to Trello).
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { MicrosoftToolsConfig } from './index.js';
import { graph } from './graph-api.js';

export function createPlannerTools(config: MicrosoftToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    {
      name: 'planner_list_plans',
      description: 'List all Planner plans the agent has access to (via group membership).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          groupId: { type: 'string', description: 'Microsoft 365 Group/Team ID to list plans for' },
        },
        required: ['groupId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, `/groups/${params.groupId}/planner/plans`);
          const plans = (data.value || []).map((p: any) => ({
            id: p.id, title: p.title, created: p.createdDateTime, owner: p.owner,
          }));
          return jsonResult({ plans, count: plans.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'planner_list_buckets',
      description: 'List buckets (columns) in a Planner plan.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          planId: { type: 'string', description: 'Plan ID' },
        },
        required: ['planId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, `/planner/plans/${params.planId}/buckets`);
          const buckets = (data.value || []).map((b: any) => ({
            id: b.id, name: b.name, orderHint: b.orderHint, planId: b.planId,
          }));
          return jsonResult({ buckets, count: buckets.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'planner_list_tasks',
      description: 'List tasks in a Planner plan or bucket.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          planId: { type: 'string', description: 'Plan ID (lists all tasks in plan)' },
          bucketId: { type: 'string', description: 'Bucket ID (lists tasks in specific bucket)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const path = params.bucketId
            ? `/planner/buckets/${params.bucketId}/tasks`
            : `/planner/plans/${params.planId}/tasks`;
          if (!params.planId && !params.bucketId) throw new Error('Provide planId or bucketId');
          const data = await graph(token, path);
          const tasks = (data.value || []).map((t: any) => ({
            id: t.id, title: t.title, bucketId: t.bucketId,
            percentComplete: t.percentComplete,
            priority: t.priority, // 0-10, lower = higher
            assignees: t.assignments ? Object.keys(t.assignments) : [],
            dueDate: t.dueDateTime,
            created: t.createdDateTime,
            startDate: t.startDateTime,
            hasDescription: t.hasDescription,
          }));
          return jsonResult({ tasks, count: tasks.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'planner_create_task',
      description: 'Create a new task in a Planner plan.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          planId: { type: 'string', description: 'Plan ID' },
          title: { type: 'string', description: 'Task title' },
          bucketId: { type: 'string', description: 'Bucket ID to place the task in' },
          assignees: { type: 'string', description: 'Comma-separated user IDs to assign' },
          dueDate: { type: 'string', description: 'Due date (ISO 8601)' },
          startDate: { type: 'string', description: 'Start date (ISO 8601)' },
          priority: { type: 'number', description: 'Priority: 1 (urgent), 3 (important), 5 (medium), 9 (low)' },
          percentComplete: { type: 'number', description: '0, 50, or 100' },
        },
        required: ['planId', 'title'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const task: any = { planId: params.planId, title: params.title };
          if (params.bucketId) task.bucketId = params.bucketId;
          if (params.dueDate) task.dueDateTime = params.dueDate;
          if (params.startDate) task.startDateTime = params.startDate;
          if (params.priority !== undefined) task.priority = params.priority;
          if (params.percentComplete !== undefined) task.percentComplete = params.percentComplete;
          if (params.assignees) {
            task.assignments = {};
            params.assignees.split(',').forEach((id: string) => {
              task.assignments[id.trim()] = { '@odata.type': '#microsoft.graph.plannerAssignment', orderHint: ' !' };
            });
          }
          const created = await graph(token, '/planner/tasks', { method: 'POST', body: task });
          return jsonResult({ id: created.id, title: created.title, created: true });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'planner_update_task',
      description: 'Update a Planner task (title, progress, bucket, priority, assignments).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          taskId: { type: 'string', description: 'Task ID' },
          title: { type: 'string', description: 'New title' },
          percentComplete: { type: 'number', description: '0 (not started), 50 (in progress), 100 (completed)' },
          bucketId: { type: 'string', description: 'Move to different bucket' },
          priority: { type: 'number', description: '1 (urgent), 3 (important), 5 (medium), 9 (low)' },
          dueDate: { type: 'string', description: 'Due date (ISO 8601)' },
        },
        required: ['taskId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          // Need etag for update
          const existing = await graph(token, `/planner/tasks/${params.taskId}`, {
            query: { '$select': 'id' }
          });
          const etag = existing['@odata.etag'];
          const update: any = {};
          if (params.title) update.title = params.title;
          if (params.percentComplete !== undefined) update.percentComplete = params.percentComplete;
          if (params.bucketId) update.bucketId = params.bucketId;
          if (params.priority !== undefined) update.priority = params.priority;
          if (params.dueDate) update.dueDateTime = params.dueDate;
          await graph(token, `/planner/tasks/${params.taskId}`, {
            method: 'PATCH', body: update,
            headers: { 'If-Match': etag },
          });
          return jsonResult({ updated: true, taskId: params.taskId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'planner_delete_task',
      description: 'Delete a Planner task.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          taskId: { type: 'string', description: 'Task ID to delete' },
        },
        required: ['taskId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const existing = await graph(token, `/planner/tasks/${params.taskId}`, { query: { '$select': 'id' } });
          await graph(token, `/planner/tasks/${params.taskId}`, {
            method: 'DELETE',
            headers: { 'If-Match': existing['@odata.etag'] },
          });
          return jsonResult({ deleted: true, taskId: params.taskId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
