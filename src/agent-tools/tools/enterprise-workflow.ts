/**
 * AgenticMail Agent Tools — Enterprise Workflow
 *
 * File-based approval workflow system. Stores workflow requests
 * as JSON in {workspaceDir}/.agenticmail/workflows.json with
 * atomic writes and UUID-based identification.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, readStringArrayParam, textResult, jsonResult, errorResult } from '../common.js';

type WorkflowStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

type WorkflowRequest = {
  id: string;
  type: string;
  title: string;
  description: string;
  requestedBy: string;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
  approvers: string[];
  metadata: Record<string, unknown>;
  cancelReason?: string;
  lastRemindedAt?: string;
};

type WorkflowStore = {
  requests: WorkflowRequest[];
};

async function loadWorkflowStore(storePath: string): Promise<WorkflowStore> {
  try {
    var content = await fs.readFile(storePath, 'utf-8');
    return JSON.parse(content) as WorkflowStore;
  } catch {
    return { requests: [] };
  }
}

async function saveWorkflowStore(storePath: string, store: WorkflowStore): Promise<void> {
  var dir = path.dirname(storePath);
  await fs.mkdir(dir, { recursive: true });
  var data = JSON.stringify(store, null, 2);
  var tmpPath = storePath + '.tmp.' + crypto.randomBytes(4).toString('hex');
  try {
    await fs.writeFile(tmpPath, data, 'utf-8');
    await fs.rename(tmpPath, storePath);
  } catch (err) {
    try { await fs.unlink(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

export function createEnterpriseWorkflowTools(options?: ToolCreationOptions): AnyAgentTool[] {
  var storePath = path.join(
    options?.workspaceDir || process.cwd(),
    '.agenticmail',
    'workflows.json',
  );

  return [
    {
      name: 'ent_wf_request_approval',
      label: 'Request Approval',
      description: 'Create a new approval request in the enterprise workflow system. Supports expense, access, change, deploy, and custom request types.',
      category: 'utility',
      risk: 'medium',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Request type.', enum: ['expense', 'access', 'change', 'deploy', 'custom'] },
          title: { type: 'string', description: 'Short title for the approval request.' },
          description: { type: 'string', description: 'Detailed description of what needs approval.' },
          requested_by: { type: 'string', description: 'Name or email of the person requesting approval.' },
          approvers: { type: 'string', description: 'Comma-separated list of approver names or emails.' },
          metadata: { type: 'string', description: 'Optional JSON string with additional metadata.' },
        },
        required: ['type', 'title', 'description', 'requested_by', 'approvers'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var type = readStringParam(params, 'type', { required: true });
          var title = readStringParam(params, 'title', { required: true });
          var description = readStringParam(params, 'description', { required: true });
          var requestedBy = readStringParam(params, 'requested_by', { required: true });
          var approvers = readStringArrayParam(params, 'approvers', { required: true });
          var metadataRaw = readStringParam(params, 'metadata');

          var validTypes = ['expense', 'access', 'change', 'deploy', 'custom'];
          if (validTypes.indexOf(type) === -1) {
            return errorResult('Invalid type "' + type + '". Must be one of: ' + validTypes.join(', '));
          }

          var metadata: Record<string, unknown> = {};
          if (metadataRaw) {
            try {
              metadata = JSON.parse(metadataRaw);
            } catch {
              return errorResult('Invalid metadata JSON.');
            }
          }

          var now = new Date().toISOString();
          var request: WorkflowRequest = {
            id: crypto.randomUUID(),
            type: type,
            title: title,
            description: description,
            requestedBy: requestedBy,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
            approvers: approvers,
            metadata: metadata,
          };

          var store = await loadWorkflowStore(storePath);
          store.requests.push(request);
          await saveWorkflowStore(storePath, store);

          return jsonResult(request);
        } catch (err: any) {
          return errorResult(err.message || 'Failed to create approval request.');
        }
      },
    },
    {
      name: 'ent_wf_check_status',
      label: 'Check Workflow Status',
      description: 'Check the current status of an approval workflow request by its ID.',
      category: 'utility',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          request_id: { type: 'string', description: 'The UUID of the workflow request to check.' },
        },
        required: ['request_id'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var requestId = readStringParam(params, 'request_id', { required: true });
          var store = await loadWorkflowStore(storePath);
          var request = store.requests.find(function(r) { return r.id === requestId; });

          if (!request) {
            return errorResult('Workflow request not found: ' + requestId);
          }

          return jsonResult(request);
        } catch (err: any) {
          return errorResult(err.message || 'Failed to check workflow status.');
        }
      },
    },
    {
      name: 'ent_wf_list_pending',
      label: 'List Pending Approvals',
      description: 'List all pending approval requests, optionally filtered by type or requester.',
      category: 'utility',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Optional filter by request type (expense, access, change, deploy, custom).' },
          requested_by: { type: 'string', description: 'Optional filter by requester name or email.' },
          limit: { type: 'number', description: 'Maximum number of results to return (default 20).', default: 20 },
        },
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var typeFilter = readStringParam(params, 'type');
          var requestedByFilter = readStringParam(params, 'requested_by');
          var limit = readNumberParam(params, 'limit', { integer: true }) ?? 20;

          var store = await loadWorkflowStore(storePath);
          var pending = store.requests.filter(function(r) {
            if (r.status !== 'pending') return false;
            if (typeFilter && r.type !== typeFilter) return false;
            if (requestedByFilter && r.requestedBy !== requestedByFilter) return false;
            return true;
          });

          // Sort by creation date descending (newest first)
          pending.sort(function(a, b) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

          var limited = pending.slice(0, limit);

          return jsonResult({
            total: pending.length,
            showing: limited.length,
            requests: limited,
          });
        } catch (err: any) {
          return errorResult(err.message || 'Failed to list pending requests.');
        }
      },
    },
    {
      name: 'ent_wf_cancel',
      label: 'Cancel Workflow Request',
      description: 'Cancel a pending approval request. Only requests with status "pending" can be cancelled.',
      category: 'utility',
      risk: 'medium',
      parameters: {
        type: 'object',
        properties: {
          request_id: { type: 'string', description: 'The UUID of the workflow request to cancel.' },
          reason: { type: 'string', description: 'Optional reason for cancellation.' },
        },
        required: ['request_id'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var requestId = readStringParam(params, 'request_id', { required: true });
          var reason = readStringParam(params, 'reason');

          var store = await loadWorkflowStore(storePath);
          var idx = store.requests.findIndex(function(r) { return r.id === requestId; });

          if (idx === -1) {
            return errorResult('Workflow request not found: ' + requestId);
          }

          var request = store.requests[idx];
          if (request.status !== 'pending') {
            return errorResult('Cannot cancel request with status "' + request.status + '". Only pending requests can be cancelled.');
          }

          var now = new Date().toISOString();
          store.requests[idx] = Object.assign({}, request, {
            status: 'cancelled' as WorkflowStatus,
            updatedAt: now,
            cancelReason: reason || undefined,
          });

          await saveWorkflowStore(storePath, store);
          return jsonResult(store.requests[idx]);
        } catch (err: any) {
          return errorResult(err.message || 'Failed to cancel workflow request.');
        }
      },
    },
    {
      name: 'ent_wf_remind',
      label: 'Send Workflow Reminder',
      description: 'Send a reminder about a pending approval request. Updates the lastRemindedAt timestamp and returns confirmation with request details.',
      category: 'utility',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          request_id: { type: 'string', description: 'The UUID of the workflow request to remind about.' },
        },
        required: ['request_id'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        try {
          var requestId = readStringParam(params, 'request_id', { required: true });

          var store = await loadWorkflowStore(storePath);
          var idx = store.requests.findIndex(function(r) { return r.id === requestId; });

          if (idx === -1) {
            return errorResult('Workflow request not found: ' + requestId);
          }

          var request = store.requests[idx];
          if (request.status !== 'pending') {
            return errorResult('Cannot remind for request with status "' + request.status + '". Only pending requests can receive reminders.');
          }

          var now = new Date().toISOString();
          store.requests[idx] = Object.assign({}, request, {
            lastRemindedAt: now,
            updatedAt: now,
          });

          await saveWorkflowStore(storePath, store);

          console.log('[AgenticMail] Reminder sent for workflow request "' + request.title + '" (' + requestId + ') to approvers: ' + request.approvers.join(', '));

          return jsonResult({
            reminded: true,
            request_id: requestId,
            title: request.title,
            approvers: request.approvers,
            lastRemindedAt: now,
          });
        } catch (err: any) {
          return errorResult(err.message || 'Failed to send workflow reminder.');
        }
      },
    },
  ];
}
