/**
 * MCP Skill Adapter — DocuSign eSignature
 *
 * Maps DocuSign eSignature REST API v2.1 endpoints to MCP tool handlers.
 * API reference: https://developers.docusign.com/docs/esign-rest-api/reference
 *
 * DocuSign paths are scoped by account: /accounts/{accountId}/...
 * The accountId is read from ctx.skillConfig.accountId.
 *
 * The base URL differs by environment:
 *   - Demo:       https://demo.docusign.net/restapi/v2.1
 *   - Production: https://na1.docusign.net/restapi/v2.1 (or other regions)
 *
 * Tools:
 *   - docusign_list_envelopes  List envelopes with status/date filtering
 *   - docusign_get_envelope    Get detailed envelope information
 *   - docusign_send_envelope   Create and send an envelope for signing
 */

import type {
  SkillAdapter,
  ToolHandler,
  ToolResult,
  ToolExecutionContext,
} from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

/** Resolve the DocuSign base URL, supporting demo vs production. */
function dsBaseUrl(ctx: ToolExecutionContext): string {
  // Allow explicit base URL override, or fall back by environment
  if (ctx.skillConfig.baseUrl) {
    return (ctx.skillConfig.baseUrl as string).replace(/\/$/, '');
  }
  const isDemo = ctx.skillConfig.environment === 'demo' || ctx.skillConfig.sandbox === true;
  return isDemo
    ? 'https://demo.docusign.net/restapi/v2.1'
    : 'https://na1.docusign.net/restapi/v2.1';
}

/** Resolve the accountId from skill config. */
function accountId(ctx: ToolExecutionContext): string {
  const id = ctx.skillConfig.accountId;
  if (!id) throw new Error('DocuSign accountId is not configured. Set skillConfig.accountId.');
  return id;
}

/** Format an ISO date string into a short readable form. */
function shortDate(iso: string | undefined): string {
  if (!iso) return 'unknown';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Build a human-readable error result from a DocuSign API error. */
function dsError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const message = data.message || data.errorCode;
      if (message) {
        const detail = data.message && data.errorCode
          ? `${data.errorCode}: ${data.message}`
          : message;
        return { content: `DocuSign API error: ${detail}`, isError: true };
      }
    }
    return { content: `DocuSign API error: ${err.message}`, isError: true };
  }
  return { content: String(err), isError: true };
}

/** Map an envelope status to a human-readable label with indicator. */
function statusLabel(status: string | undefined): string {
  const labels: Record<string, string> = {
    created: '[Draft] Created',
    sent: '[Sent] Awaiting signatures',
    delivered: '[Delivered] Viewed by recipients',
    completed: '[Completed] All signed',
    declined: '[Declined] Signing refused',
    voided: '[Voided] Cancelled',
  };
  return labels[status ?? ''] ?? `[${status ?? 'unknown'}]`;
}

// ─── Tool: docusign_list_envelopes ──────────────────────

const docusignListEnvelopes: ToolHandler = {
  description:
    'List DocuSign envelopes (documents sent for signing). Filter by status and date range. Returns envelope IDs, subjects, and statuses.',
  inputSchema: {
    type: 'object',
    properties: {
      from_date: {
        type: 'string',
        description: 'Start date in ISO 8601 format, e.g. "2024-01-01T00:00:00Z" (required by DocuSign, defaults to 30 days ago)',
      },
      to_date: {
        type: 'string',
        description: 'End date in ISO 8601 format (optional)',
      },
      status: {
        type: 'string',
        description: 'Filter by envelope status: "created", "sent", "delivered", "completed", "declined", "voided" (optional)',
      },
      search_text: {
        type: 'string',
        description: 'Search envelopes by subject or recipient name (optional)',
      },
      count: {
        type: 'number',
        description: 'Maximum number of envelopes to return (default 25, max 100)',
      },
    },
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const base = dsBaseUrl(ctx);
      const acctId = accountId(ctx);

      // Default from_date to 30 days ago if not provided
      const fromDate =
        params.from_date ??
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const query: Record<string, string> = {
        from_date: fromDate,
        count: String(params.count ?? 25),
      };
      if (params.to_date) query.to_date = params.to_date;
      if (params.status) query.status = params.status;
      if (params.search_text) query.search_text = params.search_text;

      const result = await ctx.apiExecutor.request({
        method: 'GET',
        url: `${base}/accounts/${acctId}/envelopes`,
        query,
      });

      const envelopes: any[] = result.envelopes ?? [];
      const totalCount = parseInt(result.totalSetSize ?? '0', 10) || envelopes.length;

      if (envelopes.length === 0) {
        return {
          content: 'No envelopes found matching the criteria.',
          metadata: { envelopeCount: 0 },
        };
      }

      const lines = envelopes.map((env: any) => {
        const subject = env.emailSubject ?? '(no subject)';
        const status = statusLabel(env.status);
        const sent = shortDate(env.sentDateTime ?? env.createdDateTime);
        return `  - ${subject} (ID: ${env.envelopeId}) -- ${status} -- ${sent}`;
      });

      return {
        content: `Found ${envelopes.length} envelope(s) (total: ${totalCount}):\n\n${lines.join('\n')}`,
        metadata: {
          envelopeCount: envelopes.length,
          totalSetSize: totalCount,
        },
      };
    } catch (err) {
      return dsError(err);
    }
  },
};

// ─── Tool: docusign_get_envelope ────────────────────────

const docusignGetEnvelope: ToolHandler = {
  description:
    'Get detailed information about a specific DocuSign envelope, including recipients and their signing status.',
  inputSchema: {
    type: 'object',
    properties: {
      envelope_id: {
        type: 'string',
        description: 'The DocuSign envelope ID (UUID)',
      },
    },
    required: ['envelope_id'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const base = dsBaseUrl(ctx);
      const acctId = accountId(ctx);
      const envelopeId = params.envelope_id;

      // Fetch envelope details and recipients in parallel
      const [envelope, recipients] = await Promise.all([
        ctx.apiExecutor.request({
          method: 'GET',
          url: `${base}/accounts/${acctId}/envelopes/${envelopeId}`,
        }),
        ctx.apiExecutor.request({
          method: 'GET',
          url: `${base}/accounts/${acctId}/envelopes/${envelopeId}/recipients`,
        }),
      ]);

      const subject = envelope.emailSubject ?? '(no subject)';
      const status = statusLabel(envelope.status);
      const created = shortDate(envelope.createdDateTime);
      const sent = shortDate(envelope.sentDateTime);
      const completed = envelope.completedDateTime ? shortDate(envelope.completedDateTime) : 'N/A';

      // Format recipients (signers)
      const signers: any[] = recipients.signers ?? [];
      const signerLines = signers.map((s: any) => {
        const name = s.name ?? 'Unknown';
        const email = s.email ?? '';
        const signerStatus = s.status ?? 'unknown';
        const signedDate = s.signedDateTime ? ` -- signed ${shortDate(s.signedDateTime)}` : '';
        return `    - ${name} (${email}) -- ${signerStatus}${signedDate}`;
      });

      // Format CC recipients
      const ccRecipients: any[] = recipients.carbonCopies ?? [];
      const ccLines = ccRecipients.map((cc: any) => {
        return `    - ${cc.name ?? 'Unknown'} (${cc.email ?? ''}) -- ${cc.status ?? 'unknown'}`;
      });

      const content = [
        `Envelope: ${subject}`,
        `ID: ${envelopeId}`,
        `Status: ${status}`,
        `Created: ${created}`,
        `Sent: ${sent}`,
        `Completed: ${completed}`,
        '',
        `Signers (${signers.length}):`,
        signerLines.length > 0 ? signerLines.join('\n') : '    (none)',
        ...(ccLines.length > 0
          ? ['', `CC Recipients (${ccRecipients.length}):`, ccLines.join('\n')]
          : []),
      ].join('\n');

      return {
        content,
        metadata: {
          envelopeId,
          status: envelope.status,
          subject,
          signerCount: signers.length,
          ccCount: ccRecipients.length,
        },
      };
    } catch (err) {
      return dsError(err);
    }
  },
};

// ─── Tool: docusign_send_envelope ───────────────────────

const docusignSendEnvelope: ToolHandler = {
  description:
    'Create and send a DocuSign envelope for e-signature. Provide recipients (signers) and a document (as base64 or template). The envelope will be sent immediately for signing.',
  inputSchema: {
    type: 'object',
    properties: {
      email_subject: {
        type: 'string',
        description: 'Subject line of the signing email',
      },
      email_body: {
        type: 'string',
        description: 'Body text of the signing email (optional)',
      },
      signers: {
        type: 'array',
        description: 'List of signers for the envelope',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Signer full name',
            },
            email: {
              type: 'string',
              description: 'Signer email address',
            },
            routing_order: {
              type: 'string',
              description: 'Signing order (default "1")',
            },
          },
          required: ['name', 'email'],
        },
        minItems: 1,
      },
      template_id: {
        type: 'string',
        description: 'DocuSign template ID to use instead of a raw document (optional)',
      },
      document_base64: {
        type: 'string',
        description: 'Base64-encoded document content (required if template_id is not provided)',
      },
      document_name: {
        type: 'string',
        description: 'File name of the document (e.g. "contract.pdf"). Required if using document_base64.',
      },
      status: {
        type: 'string',
        enum: ['sent', 'created'],
        description: 'Envelope status: "sent" to send immediately, "created" for draft (default: "sent")',
      },
    },
    required: ['email_subject', 'signers'],
    additionalProperties: false,
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const base = dsBaseUrl(ctx);
      const acctId = accountId(ctx);

      // Build recipients
      const signers = params.signers.map((s: any, i: number) => ({
        name: s.name,
        email: s.email,
        recipientId: String(i + 1),
        routingOrder: s.routing_order ?? String(i + 1),
      }));

      const body: Record<string, any> = {
        emailSubject: params.email_subject,
        status: params.status ?? 'sent',
        recipients: {
          signers,
        },
      };

      if (params.email_body) {
        body.emailBlurb = params.email_body;
      }

      // Use template or inline document
      if (params.template_id) {
        body.templateId = params.template_id;
      } else if (params.document_base64) {
        body.documents = [
          {
            documentBase64: params.document_base64,
            name: params.document_name ?? 'document.pdf',
            fileExtension: (params.document_name ?? 'document.pdf').split('.').pop() || 'pdf',
            documentId: '1',
          },
        ];
      }

      const result = await ctx.apiExecutor.request({
        method: 'POST',
        url: `${base}/accounts/${acctId}/envelopes`,
        body,
      });

      const envelopeId = result.envelopeId;
      const envelopeStatus = result.status ?? params.status ?? 'sent';
      const recipientNames = params.signers.map((s: any) => s.name).join(', ');

      return {
        content: `Envelope ${envelopeStatus}: "${params.email_subject}" (ID: ${envelopeId})\nSent to: ${recipientNames}`,
        metadata: {
          envelopeId,
          status: envelopeStatus,
          subject: params.email_subject,
          signerCount: params.signers.length,
          recipientNames,
        },
      };
    } catch (err) {
      return dsError(err);
    }
  },
};

// ─── Adapter ────────────────────────────────────────────

export const docusignAdapter: SkillAdapter = {
  skillId: 'docusign-esign',
  name: 'DocuSign',
  // Base URL is dynamic (demo vs production); tools use ctx.apiExecutor.request() with full URLs
  baseUrl: 'https://demo.docusign.net/restapi/v2.1',
  auth: {
    type: 'oauth2',
    provider: 'docusign',
    headerPrefix: 'Bearer',
  },
  tools: {
    docusign_list_envelopes: docusignListEnvelopes,
    docusign_get_envelope: docusignGetEnvelope,
    docusign_send_envelope: docusignSendEnvelope,
  },
  configSchema: {
    accountId: {
      type: 'string' as const,
      label: 'Account ID',
      description: 'Your DocuSign account ID (GUID)',
      required: true,
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    },
    environment: {
      type: 'select' as const,
      label: 'Environment',
      description: 'DocuSign environment',
      default: 'demo',
      options: [
        { label: 'Demo (Sandbox)', value: 'demo' },
        { label: 'Production', value: 'production' },
      ],
    },
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 15,
  },
};
