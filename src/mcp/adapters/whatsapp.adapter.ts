/**
 * MCP Skill Adapter — WhatsApp Business
 *
 * Maps WhatsApp Business API (Cloud API) endpoints to MCP tool handlers.
 * Uses the Facebook Graph API v18.0 for sending messages, templates,
 * and managing media assets.
 *
 * WhatsApp Business API docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function whatsappError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object' && data.error) {
      const code = data.error.code ? ` (code ${data.error.code})` : '';
      return { content: `WhatsApp API error: ${data.error.message || err.message}${code}`, isError: true };
    }
    return { content: `WhatsApp API error: ${err.message}`, isError: true };
  }
  return { content: `WhatsApp API error: ${String(err)}`, isError: true };
}

// ─── Tool: whatsapp_send_message ────────────────────────

const sendMessage: ToolHandler = {
  description:
    'Send a text message via WhatsApp Business API. Requires the recipient phone number in international format and the message text.',
  inputSchema: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Recipient phone number in international format (e.g. "15551234567")',
      },
      text: {
        type: 'string',
        description: 'The message text to send',
      },
      preview_url: {
        type: 'boolean',
        description: 'Whether to show URL previews in the message (optional)',
      },
    },
    required: ['to', 'text'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const phoneNumberId = ctx.skillConfig.phoneNumberId;
      if (!phoneNumberId) {
        return { content: 'Missing phoneNumberId in skill configuration.', isError: true };
      }

      const body: Record<string, any> = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: params.to,
        type: 'text',
        text: {
          preview_url: params.preview_url ?? false,
          body: params.text,
        },
      };

      const result = await ctx.apiExecutor.post(
        `/${phoneNumberId}/messages`,
        body,
      );

      const messageId = result.messages?.[0]?.id || 'unknown';
      return {
        content: `WhatsApp message sent to ${params.to} (message ID: ${messageId})`,
        metadata: { messageId, to: params.to },
      };
    } catch (err) {
      return whatsappError(err);
    }
  },
};

// ─── Tool: whatsapp_send_template ───────────────────────

const sendTemplate: ToolHandler = {
  description:
    'Send a pre-approved message template via WhatsApp Business API. Templates are required for initiating conversations.',
  inputSchema: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Recipient phone number in international format',
      },
      template_name: {
        type: 'string',
        description: 'Name of the approved message template',
      },
      language_code: {
        type: 'string',
        description: 'Template language code (e.g. "en_US", "es")',
      },
      components: {
        type: 'array',
        description: 'Template components with parameters (optional)',
        items: { type: 'object' },
      },
    },
    required: ['to', 'template_name', 'language_code'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const phoneNumberId = ctx.skillConfig.phoneNumberId;
      if (!phoneNumberId) {
        return { content: 'Missing phoneNumberId in skill configuration.', isError: true };
      }

      const body: Record<string, any> = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: params.to,
        type: 'template',
        template: {
          name: params.template_name,
          language: { code: params.language_code },
        },
      };
      if (params.components?.length) {
        body.template.components = params.components;
      }

      const result = await ctx.apiExecutor.post(
        `/${phoneNumberId}/messages`,
        body,
      );

      const messageId = result.messages?.[0]?.id || 'unknown';
      return {
        content: `Template "${params.template_name}" sent to ${params.to} (message ID: ${messageId})`,
        metadata: { messageId, to: params.to, template: params.template_name },
      };
    } catch (err) {
      return whatsappError(err);
    }
  },
};

// ─── Tool: whatsapp_get_media ───────────────────────────

const getMedia: ToolHandler = {
  description:
    'Retrieve media metadata (URL, MIME type, size) for a WhatsApp media ID. The URL can then be used to download the media.',
  inputSchema: {
    type: 'object',
    properties: {
      media_id: {
        type: 'string',
        description: 'The WhatsApp media ID to retrieve',
      },
    },
    required: ['media_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await ctx.apiExecutor.get(`/${params.media_id}`);

      const size = result.file_size
        ? `${(result.file_size / 1024).toFixed(1)} KB`
        : 'unknown size';

      return {
        content: [
          `Media ID: ${result.id}`,
          `MIME Type: ${result.mime_type || 'unknown'}`,
          `Size: ${size}`,
          `URL: ${result.url || 'N/A'}`,
        ].join('\n'),
        metadata: {
          mediaId: result.id,
          mimeType: result.mime_type,
          fileSize: result.file_size,
          url: result.url,
        },
      };
    } catch (err) {
      return whatsappError(err);
    }
  },
};

// ─── Tool: whatsapp_list_templates ──────────────────────

const listTemplates: ToolHandler = {
  description:
    'List approved message templates for the WhatsApp Business account. Templates are required for initiating conversations with users.',
  inputSchema: {
    type: 'object',
    properties: {
      business_id: {
        type: 'string',
        description: 'The WhatsApp Business Account ID',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of templates to return (default 20)',
      },
    },
    required: ['business_id'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
      };

      const result = await ctx.apiExecutor.get(
        `/${params.business_id}/message_templates`,
        query,
      );

      const templates: any[] = result.data || [];
      if (templates.length === 0) {
        return { content: 'No message templates found.' };
      }

      const lines = templates.map((t: any) => {
        const status = t.status || 'unknown';
        const lang = t.language || 'N/A';
        const category = t.category || 'N/A';
        return `${t.name} (${status}) — ${lang} — ${category}`;
      });

      return {
        content: `Found ${templates.length} templates:\n${lines.join('\n')}`,
        metadata: { count: templates.length },
      };
    } catch (err) {
      return whatsappError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const whatsappAdapter: SkillAdapter = {
  skillId: 'whatsapp-business',
  name: 'WhatsApp Business',
  baseUrl: 'https://graph.facebook.com/v18.0',
  auth: {
    type: 'token',
    headerPrefix: 'Bearer',
  },
  tools: {
    whatsapp_send_message: sendMessage,
    whatsapp_send_template: sendTemplate,
    whatsapp_get_media: getMedia,
    whatsapp_list_templates: listTemplates,
  },
  configSchema: {
    phoneNumberId: {
      type: 'string',
      label: 'Phone Number ID',
      description: 'Your WhatsApp Business Phone Number ID from the Meta Developer Dashboard',
      required: true,
    },
  },
  rateLimits: { requestsPerSecond: 80, burstLimit: 150 },
};
