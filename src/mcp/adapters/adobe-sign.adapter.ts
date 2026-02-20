/**
 * MCP Skill Adapter — Adobe Acrobat Sign
 *
 * Maps Adobe Sign REST API v6 endpoints to MCP tool handlers.
 * Handles agreement listing, creation, retrieval, reminders, and template management.
 *
 * The region (na1, eu1, jp1) is read from ctx.skillConfig.region
 * and used to build the dynamic base URL.
 *
 * Adobe Sign API docs: https://secure.adobesign.com/public/docs/restapi/v6
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the Adobe Sign base URL from skill config region */
function asBaseUrl(ctx: ToolExecutionContext): string {
  const region = ctx.skillConfig.region || 'na1';
  return `https://api.${region}.adobesign.com/api/rest/v6`;
}

function adobeSignError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      // Adobe Sign returns { code, message } or { errorCode, message }
      const msg = data.message || err.message;
      const code = data.code || data.errorCode || '';
      const codePart = code ? `[${code}] ` : '';
      return { content: `Adobe Sign API error: ${codePart}${msg}`, isError: true };
    }
    return { content: `Adobe Sign API error: ${err.message}`, isError: true };
  }
  return { content: `Adobe Sign API error: ${String(err)}`, isError: true };
}

/** Format agreement status */
function agreementStatusLabel(status: string | undefined): string {
  const labels: Record<string, string> = {
    OUT_FOR_SIGNATURE: '[Out for Signature]',
    OUT_FOR_APPROVAL: '[Out for Approval]',
    SIGNED: '[Signed]',
    APPROVED: '[Approved]',
    ABORTED: '[Cancelled]',
    DOCUMENT_LIBRARY: '[Library]',
    WIDGET: '[Widget]',
    EXPIRED: '[Expired]',
    ARCHIVED: '[Archived]',
    PREFILL: '[Prefill]',
    AUTHORING: '[Authoring]',
    WAITING_FOR_FORM_FILLING: '[Waiting for Form Fill]',
    DRAFT: '[Draft]',
    WAITING_FOR_VERIFICATION: '[Waiting for Verification]',
  };
  return labels[status ?? ''] ?? `[${status ?? 'unknown'}]`;
}

// ─── Tool: adobesign_list_agreements ────────────────────

const listAgreements: ToolHandler = {
  description:
    'List agreements in Adobe Acrobat Sign. Filter by status and pagination. Returns agreement names, statuses, and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['OUT_FOR_SIGNATURE', 'OUT_FOR_APPROVAL', 'SIGNED', 'APPROVED', 'ABORTED', 'EXPIRED', 'ARCHIVED', 'DRAFT'],
        description: 'Filter by agreement status (optional)',
      },
      page_size: {
        type: 'number',
        description: 'Number of agreements to return per page (default 20, max 100)',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor for the next page (optional)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = asBaseUrl(ctx);

      const query: Record<string, string> = {
        pageSize: String(params.page_size ?? 20),
      };
      if (params.cursor) query.cursor = params.cursor;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/agreements`,
        query,
      });

      let agreements: any[] = result.userAgreementList || [];
      if (params.status) {
        agreements = agreements.filter((a: any) => a.status === params.status);
      }

      if (agreements.length === 0) {
        return { content: 'No agreements found matching the criteria.' };
      }

      const lines = agreements.map((a: any) => {
        const name = a.name || '(untitled)';
        const status = agreementStatusLabel(a.status);
        const modified = a.lastEventDate
          ? new Date(a.lastEventDate).toLocaleDateString()
          : 'N/A';
        return `${name} ${status} -- Modified: ${modified} (ID: ${a.id})`;
      });

      const nextCursor = result.page?.nextCursor;
      const paginationNote = nextCursor ? `\n\nNext page cursor: ${nextCursor}` : '';

      return {
        content: `${agreements.length} agreements:\n${lines.join('\n')}${paginationNote}`,
        metadata: {
          count: agreements.length,
          nextCursor: nextCursor || null,
        },
      };
    } catch (err) {
      return adobeSignError(err);
    }
  },
};

// ─── Tool: adobesign_create_agreement ───────────────────

const createAgreement: ToolHandler = {
  description:
    'Create and send a new agreement in Adobe Acrobat Sign. Specify recipients, document (template or transient), and signing options.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Agreement name',
      },
      recipients: {
        type: 'array',
        description: 'List of recipient email addresses for signing',
        items: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              description: 'Recipient email address',
            },
            role: {
              type: 'string',
              enum: ['SIGNER', 'APPROVER', 'ACCEPTOR', 'FORM_FILLER', 'DELEGATE_TO_SIGNER'],
              description: 'Recipient role (default: "SIGNER")',
            },
            order: {
              type: 'number',
              description: 'Signing order (1-based)',
            },
          },
          required: ['email'],
        },
        minItems: 1,
      },
      template_id: {
        type: 'string',
        description: 'Library template ID to use as the document source',
      },
      transient_document_id: {
        type: 'string',
        description: 'Transient document ID (uploaded via transient documents API) as an alternative to template',
      },
      message: {
        type: 'string',
        description: 'Message to include in the signing notification email (optional)',
      },
      signature_type: {
        type: 'string',
        enum: ['ESIGN', 'WRITTEN'],
        description: 'Type of signature required (default: "ESIGN")',
      },
      state: {
        type: 'string',
        enum: ['IN_PROCESS', 'DRAFT'],
        description: 'Agreement state: "IN_PROCESS" to send immediately, "DRAFT" to save as draft (default: "IN_PROCESS")',
      },
    },
    required: ['name', 'recipients'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = asBaseUrl(ctx);

      // Build participant sets
      const participantSetsInfo = params.recipients.map((r: any, idx: number) => ({
        memberInfos: [{ email: r.email }],
        role: r.role || 'SIGNER',
        order: r.order ?? idx + 1,
      }));

      // Build file infos
      const fileInfos: any[] = [];
      if (params.template_id) {
        fileInfos.push({ libraryDocumentId: params.template_id });
      } else if (params.transient_document_id) {
        fileInfos.push({ transientDocumentId: params.transient_document_id });
      }

      const body: Record<string, any> = {
        name: params.name,
        participantSetsInfo,
        signatureType: params.signature_type || 'ESIGN',
        state: params.state || 'IN_PROCESS',
      };
      if (fileInfos.length > 0) body.fileInfos = fileInfos;
      if (params.message) body.message = params.message;

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/agreements`,
        body,
      });

      const agreementId = result.id || 'unknown';
      const recipientEmails = params.recipients.map((r: any) => r.email).join(', ');

      return {
        content: `Agreement created: "${params.name}" (ID: ${agreementId})\nState: ${params.state || 'IN_PROCESS'}\nRecipients: ${recipientEmails}`,
        metadata: {
          agreementId,
          name: params.name,
          state: params.state || 'IN_PROCESS',
          recipientCount: params.recipients.length,
        },
      };
    } catch (err) {
      return adobeSignError(err);
    }
  },
};

// ─── Tool: adobesign_get_agreement ──────────────────────

const getAgreement: ToolHandler = {
  description:
    'Get detailed information about a specific Adobe Sign agreement. Returns name, status, participants, and event history.',
  inputSchema: {
    type: 'object',
    properties: {
      agreement_id: {
        type: 'string',
        description: 'The Adobe Sign agreement ID',
      },
    },
    required: ['agreement_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = asBaseUrl(ctx);

      // Fetch agreement details and members in parallel
      const [agreement, members] = await Promise.all([
        ctx.apiExecutor.request({
          method: 'GET',
          url: `${baseUrl}/agreements/${params.agreement_id}`,
        }),
        ctx.apiExecutor.request({
          method: 'GET',
          url: `${baseUrl}/agreements/${params.agreement_id}/members`,
        }),
      ]);

      const participantSets: any[] = members.participantSets || [];
      const participantLines = participantSets.flatMap((ps: any) => {
        const role = ps.role || 'unknown';
        const memberInfos: any[] = ps.memberInfos || [];
        return memberInfos.map((m: any) => {
          const email = m.email || 'N/A';
          const status = m.status || ps.status || 'unknown';
          return `  - ${email} [${role}] -- ${status}`;
        });
      });

      const details = [
        `Agreement: ${agreement.name || '(untitled)'}`,
        `ID: ${agreement.id || params.agreement_id}`,
        `Status: ${agreementStatusLabel(agreement.status)}`,
        `Created: ${agreement.createdDate ? new Date(agreement.createdDate).toLocaleDateString() : 'N/A'}`,
        `Expiration: ${agreement.expirationTime ? new Date(agreement.expirationTime).toLocaleDateString() : 'None'}`,
        `Signature Type: ${agreement.signatureType || 'N/A'}`,
        `Message: ${agreement.message || 'N/A'}`,
        '',
        `Participants (${participantLines.length}):`,
        participantLines.length > 0 ? participantLines.join('\n') : '  (none)',
      ].join('\n');

      return {
        content: details,
        metadata: {
          agreementId: params.agreement_id,
          name: agreement.name,
          status: agreement.status,
          participantCount: participantLines.length,
        },
      };
    } catch (err) {
      return adobeSignError(err);
    }
  },
};

// ─── Tool: adobesign_send_reminder ──────────────────────

const sendReminder: ToolHandler = {
  description:
    'Send a reminder to participants of an Adobe Sign agreement. Specify which participant to remind and an optional message.',
  inputSchema: {
    type: 'object',
    properties: {
      agreement_id: {
        type: 'string',
        description: 'The Adobe Sign agreement ID',
      },
      recipient_email: {
        type: 'string',
        description: 'Email of the recipient to remind (optional — reminds all if omitted)',
      },
      comment: {
        type: 'string',
        description: 'Custom message to include in the reminder (optional)',
      },
    },
    required: ['agreement_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = asBaseUrl(ctx);

      const body: Record<string, any> = {};
      if (params.recipient_email) {
        body.recipientParticipantIds = [params.recipient_email];
      }
      if (params.comment) {
        body.comment = params.comment;
      }

      await ctx.apiExecutor.request({
        method: 'POST',
        url: `${baseUrl}/agreements/${params.agreement_id}/reminders`,
        body,
      });

      const target = params.recipient_email ? params.recipient_email : 'all participants';
      return {
        content: `Reminder sent for agreement ${params.agreement_id} to ${target}.${params.comment ? `\nMessage: ${params.comment}` : ''}`,
        metadata: {
          agreementId: params.agreement_id,
          recipientEmail: params.recipient_email || null,
        },
      };
    } catch (err) {
      return adobeSignError(err);
    }
  },
};

// ─── Tool: adobesign_list_templates ─────────────────────

const listTemplates: ToolHandler = {
  description:
    'List library document templates in Adobe Acrobat Sign. Returns template names, IDs, and sharing modes.',
  inputSchema: {
    type: 'object',
    properties: {
      page_size: {
        type: 'number',
        description: 'Number of templates to return per page (default 20, max 100)',
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor for the next page (optional)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const baseUrl = asBaseUrl(ctx);

      const query: Record<string, string> = {
        pageSize: String(params.page_size ?? 20),
      };
      if (params.cursor) query.cursor = params.cursor;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${baseUrl}/libraryDocuments`,
        query,
      });

      const templates: any[] = result.libraryDocumentList || [];
      if (templates.length === 0) {
        return { content: 'No library document templates found.' };
      }

      const lines = templates.map((t: any) => {
        const name = t.name || '(untitled)';
        const sharingMode = t.sharingMode || 'N/A';
        const modified = t.modifiedDate
          ? new Date(t.modifiedDate).toLocaleDateString()
          : 'N/A';
        return `${name} -- Sharing: ${sharingMode} -- Modified: ${modified} (ID: ${t.id})`;
      });

      const nextCursor = result.page?.nextCursor;
      const paginationNote = nextCursor ? `\n\nNext page cursor: ${nextCursor}` : '';

      return {
        content: `${templates.length} library templates:\n${lines.join('\n')}${paginationNote}`,
        metadata: {
          count: templates.length,
          nextCursor: nextCursor || null,
        },
      };
    } catch (err) {
      return adobeSignError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const adobeSignAdapter: SkillAdapter = {
  skillId: 'adobe-sign',
  name: 'Adobe Acrobat Sign',
  // Base URL is dynamic from ctx.skillConfig.region; tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://api.na1.adobesign.com/api/rest/v6',
  auth: {
    type: 'oauth2',
    provider: 'adobe',
  },
  tools: {
    adobesign_list_agreements: listAgreements,
    adobesign_create_agreement: createAgreement,
    adobesign_get_agreement: getAgreement,
    adobesign_send_reminder: sendReminder,
    adobesign_list_templates: listTemplates,
  },
  configSchema: {
    region: {
      type: 'select' as const,
      label: 'Region',
      description: 'Adobe Sign data center region',
      default: 'na1',
      options: [
        { label: 'North America', value: 'na1' },
        { label: 'Europe', value: 'eu1' },
        { label: 'Japan', value: 'jp1' },
      ],
    },
  },
  rateLimits: { requestsPerSecond: 5, burstLimit: 10 },
};
