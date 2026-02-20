import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'enterprise-workflow',
  name: 'Approval Workflow',
  description: 'Request human approvals, route decisions to the right approvers based on rules, track approval status, and escalate when deadlines are missed. Integrates with org hierarchy for multi-level approvals.',
  category: 'collaboration',
  risk: 'medium',
  icon: '✅',
  source: 'builtin',
  version: '1.0.0',
  author: 'AgenticMail',
};

export const TOOLS: ToolDefinition[] = [
  {
    id: 'ent_wf_request_approval',
    name: 'Request Approval',
    description: 'Submit a request for human approval. Sends notification to approvers and tracks the response. Supports multiple approvers, approval chains, and deadline-based escalation.',
    category: 'communicate',
    risk: 'medium',
    skillId: 'enterprise-workflow',
    sideEffects: ['sends-email', 'sends-message'],
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Brief title of what needs approval' },
        description: { type: 'string', description: 'Detailed description with context for the approver' },
        approvers: { type: 'array', items: { type: 'string' }, description: 'Email addresses of approvers' },
        approvalType: { type: 'string', enum: ['any', 'all', 'chain'], description: 'any=first approver wins, all=everyone must approve, chain=sequential approval', default: 'any' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
        deadline: { type: 'string', description: 'ISO 8601 deadline for response' },
        escalateTo: { type: 'string', description: 'Email to escalate to if deadline passes' },
        attachments: { type: 'array', items: { type: 'string' }, description: 'File paths to attach as supporting documents' },
        actions: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } } }, description: 'Custom action buttons (default: Approve/Reject)' },
        metadata: { type: 'object', description: 'Custom data stored with the request' },
      },
      required: ['title', 'description', 'approvers'],
    },
  },
  {
    id: 'ent_wf_check_status',
    name: 'Check Approval Status',
    description: 'Check the status of a pending approval request. Returns current state, who has responded, and time remaining.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-workflow',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        requestId: { type: 'string', description: 'Approval request ID' },
      },
      required: ['requestId'],
    },
  },
  {
    id: 'ent_wf_list_pending',
    name: 'List Pending Approvals',
    description: 'List all pending approval requests that are awaiting response, either submitted by this agent or assigned to specific approvers.',
    category: 'read',
    risk: 'low',
    skillId: 'enterprise-workflow',
    sideEffects: [],
    parameters: {
      type: 'object',
      properties: {
        submittedBy: { type: 'string', description: 'Filter by submitter' },
        assignedTo: { type: 'string', description: 'Filter by approver' },
        status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'expired', 'all'], default: 'pending' },
        limit: { type: 'number', default: 20 },
      },
    },
  },
  {
    id: 'ent_wf_cancel',
    name: 'Cancel Approval Request',
    description: 'Cancel a pending approval request. Notifies approvers that the request has been withdrawn.',
    category: 'write',
    risk: 'low',
    skillId: 'enterprise-workflow',
    sideEffects: ['sends-message'],
    parameters: {
      type: 'object',
      properties: {
        requestId: { type: 'string' },
        reason: { type: 'string', description: 'Reason for cancellation' },
      },
      required: ['requestId'],
    },
  },
  {
    id: 'ent_wf_remind',
    name: 'Send Approval Reminder',
    description: 'Send a reminder to approvers who have not yet responded to a pending request.',
    category: 'communicate',
    risk: 'low',
    skillId: 'enterprise-workflow',
    sideEffects: ['sends-email', 'sends-message'],
    parameters: {
      type: 'object',
      properties: {
        requestId: { type: 'string' },
        message: { type: 'string', description: 'Custom reminder message' },
      },
      required: ['requestId'],
    },
  },
];
