/**
 * MCP Skill Adapter — PandaDoc
 *
 * Maps PandaDoc API v1 endpoints to MCP tool handlers.
 * Handles document listing, creation, sending, retrieval, and template management.
 *
 * PandaDoc API docs: https://developers.pandadoc.com/reference
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function pandadocError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // PandaDoc returns { type, detail } or { error, error_message }
      const msg = data.detail || data.error_message || data.message || err.message;
      const type = data.type || data.error || '';
      const typePart = type ? `[${type}] ` : '';
      return { content: `PandaDoc API error: ${typePart}${msg}`, isError: true };
    }
    return { content: `PandaDoc API error: ${err.message}`, isError: true };
  }
  return { content: `PandaDoc API error: ${String(err)}`, isError: true };
}

/** Format a PandaDoc document status */
function statusLabel(status: string | undefined): string {
  const labels: Record<string, string> = {
    'document.draft': '[Draft]',
    'document.sent': '[Sent]',
    'document.completed': '[Completed]',
    'document.viewed': '[Viewed]',
    'document.waiting_approval': '[Waiting Approval]',
    'document.approved': '[Approved]',
    'document.rejected': '[Rejected]',
    'document.waiting_pay': '[Waiting Payment]',
    'document.paid': '[Paid]',
    'document.voided': '[Voided]',
    'document.declined': '[Declined]',
  };
  return labels[status ?? ''] ?? `[${status ?? 'unknown'}]`;
}

// ─── Tool: pandadoc_list_documents ──────────────────────

const listDocuments: ToolHandler = {
  description:
    'List documents in PandaDoc. Filter by status, search query, or date range. Returns document names, statuses, and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['document.draft', 'document.sent', 'document.completed', 'document.viewed', 'document.approved', 'document.rejected', 'document.voided'],
        description: 'Filter by document status (optional)',
      },
      q: {
        type: 'string',
        description: 'Search query to filter documents by name (optional)',
      },
      count: {
        type: 'number',
        description: 'Number of documents to return (default 50, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
      order_by: {
        type: 'string',
        enum: ['name', 'date_created', 'date_modified', 'date_status_changed'],
        description: 'Sort field (default: "date_created")',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        count: String(params.count ?? 50),
        page: String(params.page ?? 1),
      };
      if (params.status) query.status = params.status;
      if (params.q) query.q = params.q;
      if (params.order_by) query.order_by = params.order_by;

      const result = await ctx.apiExecutor.get('/documents', query);

      const docs: any[] = result.results || result || [];
      if (!Array.isArray(docs) || docs.length === 0) {
        return { content: 'No documents found matching the criteria.' };
      }

      const lines = docs.map((doc: any) => {
        const name = doc.name || '(untitled)';
        const status = statusLabel(doc.status);
        const created = doc.date_created ? new Date(doc.date_created).toLocaleDateString() : 'N/A';
        return `${name} ${status} -- Created: ${created} (ID: ${doc.id})`;
      });

      return {
        content: `Found ${docs.length} documents:\n${lines.join('\n')}`,
        metadata: { count: docs.length },
      };
    } catch (err) {
      return pandadocError(err);
    }
  },
};

// ─── Tool: pandadoc_create_document ─────────────────────

const createDocument: ToolHandler = {
  description:
    'Create a new document in PandaDoc from a template. Specify recipients, tokens, and metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Document name',
      },
      template_uuid: {
        type: 'string',
        description: 'PandaDoc template UUID to use as the base',
      },
      recipients: {
        type: 'array',
        description: 'List of document recipients',
        items: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              description: 'Recipient email address',
            },
            first_name: {
              type: 'string',
              description: 'Recipient first name',
            },
            last_name: {
              type: 'string',
              description: 'Recipient last name',
            },
            role: {
              type: 'string',
              description: 'Recipient role in the document (e.g. "Signer", "Client")',
            },
          },
          required: ['email'],
        },
        minItems: 1,
      },
      tokens: {
        type: 'array',
        description: 'Template tokens to fill (optional)',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Token name',
            },
            value: {
              type: 'string',
              description: 'Token value',
            },
          },
          required: ['name', 'value'],
        },
      },
      metadata: {
        type: 'object',
        description: 'Custom metadata key-value pairs (optional)',
      },
    },
    required: ['name', 'template_uuid', 'recipients'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        name: params.name,
        template_uuid: params.template_uuid,
        recipients: params.recipients,
      };
      if (params.tokens?.length) body.tokens = params.tokens;
      if (params.metadata) body.metadata = params.metadata;

      const result = await ctx.apiExecutor.post('/documents', body);

      const docId = result.id || result.uuid || 'unknown';
      const status = result.status || 'document.draft';

      return {
        content: `Document created: "${params.name}" (ID: ${docId})\nStatus: ${statusLabel(status)}\nRecipients: ${params.recipients.map((r: any) => r.email).join(', ')}`,
        metadata: {
          documentId: docId,
          name: params.name,
          status,
          templateUuid: params.template_uuid,
        },
      };
    } catch (err) {
      return pandadocError(err);
    }
  },
};

// ─── Tool: pandadoc_send_document ───────────────────────

const sendDocument: ToolHandler = {
  description:
    'Send a PandaDoc document to its recipients for viewing or signing. The document must be in draft status.',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'The PandaDoc document ID to send',
      },
      message: {
        type: 'string',
        description: 'Optional message to include in the notification email',
      },
      subject: {
        type: 'string',
        description: 'Optional custom email subject line',
      },
      silent: {
        type: 'boolean',
        description: 'If true, send without email notification (default: false)',
      },
    },
    required: ['document_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {};
      if (params.message) body.message = params.message;
      if (params.subject) body.subject = params.subject;
      if (params.silent !== undefined) body.silent = params.silent;

      await ctx.apiExecutor.post(`/documents/${params.document_id}/send`, body);

      return {
        content: `Document ${params.document_id} sent successfully.${params.silent ? ' (silent — no email notification)' : ''}`,
        metadata: {
          documentId: params.document_id,
          silent: params.silent || false,
        },
      };
    } catch (err) {
      return pandadocError(err);
    }
  },
};

// ─── Tool: pandadoc_get_document ────────────────────────

const getDocument: ToolHandler = {
  description:
    'Get detailed information about a PandaDoc document by its ID. Returns name, status, recipients, and field values.',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'The PandaDoc document ID',
      },
    },
    required: ['document_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/documents/${params.document_id}/details`);

      const recipients = (result.recipients || []).map((r: any) => {
        const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email;
        const status = r.has_completed ? 'completed' : r.has_viewed ? 'viewed' : 'pending';
        return `  - ${name} <${r.email}> [${status}]${r.role ? ` (${r.role})` : ''}`;
      });

      const details = [
        `Document: ${result.name || '(untitled)'}`,
        `ID: ${result.id || params.document_id}`,
        `Status: ${statusLabel(result.status)}`,
        `Created: ${result.date_created ? new Date(result.date_created).toLocaleDateString() : 'N/A'}`,
        `Modified: ${result.date_modified ? new Date(result.date_modified).toLocaleDateString() : 'N/A'}`,
        `Expiration: ${result.expiration_date ? new Date(result.expiration_date).toLocaleDateString() : 'None'}`,
        '',
        `Recipients (${recipients.length}):`,
        recipients.length > 0 ? recipients.join('\n') : '  (none)',
      ].join('\n');

      return {
        content: details,
        metadata: {
          documentId: params.document_id,
          name: result.name,
          status: result.status,
          recipientCount: recipients.length,
        },
      };
    } catch (err) {
      return pandadocError(err);
    }
  },
};

// ─── Tool: pandadoc_list_templates ──────────────────────

const listTemplates: ToolHandler = {
  description:
    'List available PandaDoc templates. Returns template names, IDs, and creation dates.',
  inputSchema: {
    type: 'object',
    properties: {
      q: {
        type: 'string',
        description: 'Search query to filter templates by name (optional)',
      },
      count: {
        type: 'number',
        description: 'Number of templates to return (default 50, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number for pagination (default 1)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        count: String(params.count ?? 50),
        page: String(params.page ?? 1),
      };
      if (params.q) query.q = params.q;

      const result = await ctx.apiExecutor.get('/templates', query);

      const templates: any[] = result.results || result || [];
      if (!Array.isArray(templates) || templates.length === 0) {
        return { content: 'No templates found.' };
      }

      const lines = templates.map((t: any) => {
        const name = t.name || '(untitled)';
        const created = t.date_created ? new Date(t.date_created).toLocaleDateString() : 'N/A';
        return `${name} -- Created: ${created} (ID: ${t.id || t.uuid})`;
      });

      return {
        content: `${templates.length} templates:\n${lines.join('\n')}`,
        metadata: { count: templates.length },
      };
    } catch (err) {
      return pandadocError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const pandadocAdapter: SkillAdapter = {
  skillId: 'pandadoc',
  name: 'PandaDoc',
  baseUrl: 'https://api.pandadoc.com/public/v1',
  auth: {
    type: 'api_key',
    headerName: 'Authorization',
    headerPrefix: 'API-Key',
  },
  tools: {
    pandadoc_list_documents: listDocuments,
    pandadoc_create_document: createDocument,
    pandadoc_send_document: sendDocument,
    pandadoc_get_document: getDocument,
    pandadoc_list_templates: listTemplates,
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 10 },
};
