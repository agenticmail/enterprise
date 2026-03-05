/**
 * Microsoft Outlook Mail Tools
 *
 * Full Outlook/Exchange mail management via Microsoft Graph API.
 * Covers inbox, send, reply, forward, drafts, folders, attachments, search.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { MicrosoftToolsConfig } from './index.js';
import { graph } from './graph-api.js';

export function createOutlookMailTools(config: MicrosoftToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    {
      name: 'outlook_mail_list',
      description: 'List messages from Outlook mailbox. Returns recent emails from inbox or specified folder.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          folder: { type: 'string', description: 'Folder: inbox, sentitems, drafts, deleteditems, junkemail, or folder ID (default: inbox)' },
          maxResults: { type: 'number', description: 'Max messages to return (default: 20, max: 50)' },
          filter: { type: 'string', description: 'OData $filter expression (e.g., "isRead eq false", "from/emailAddress/address eq \'user@example.com\'")' },
          search: { type: 'string', description: 'Search query (searches subject, body, sender)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const folder = params.folder || 'inbox';
          const top = Math.min(params.maxResults || 20, 50);
          const query: Record<string, string> = {
            '$top': String(top),
            '$orderby': 'receivedDateTime desc',
            '$select': 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,hasAttachments,importance,bodyPreview,flag,conversationId',
          };
          if (params.filter) query['$filter'] = params.filter;
          if (params.search) query['$search'] = `"${params.search}"`;

          const data = await graph(token, `/me/mailFolders/${folder}/messages`, { query });
          const messages = (data.value || []).map((m: any) => ({
            id: m.id,
            subject: m.subject,
            from: m.from?.emailAddress?.address,
            fromName: m.from?.emailAddress?.name,
            to: m.toRecipients?.map((r: any) => r.emailAddress?.address),
            cc: m.ccRecipients?.map((r: any) => r.emailAddress?.address),
            date: m.receivedDateTime,
            isRead: m.isRead,
            hasAttachments: m.hasAttachments,
            importance: m.importance,
            preview: m.bodyPreview,
            flagged: m.flag?.flagStatus === 'flagged',
            conversationId: m.conversationId,
          }));
          return jsonResult({ messages, count: messages.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_read',
      description: 'Read a specific email message by ID. Returns full body, headers, and attachment list.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageId: { type: 'string', description: 'Message ID to read' },
          markAsRead: { type: 'boolean', description: 'Mark as read when opening (default: true)' },
        },
        required: ['messageId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const msg = await graph(token, `/me/messages/${params.messageId}`, {
            query: { '$select': 'id,subject,from,toRecipients,ccRecipients,bccRecipients,replyTo,receivedDateTime,sentDateTime,isRead,hasAttachments,importance,body,flag,conversationId,internetMessageId,parentFolderId' }
          });
          // Mark as read
          if (params.markAsRead !== false && !msg.isRead) {
            graph(token, `/me/messages/${params.messageId}`, { method: 'PATCH', body: { isRead: true } }).catch(() => {});
          }
          // Get attachments if any
          let attachments: any[] = [];
          if (msg.hasAttachments) {
            const att = await graph(token, `/me/messages/${params.messageId}/attachments`, {
              query: { '$select': 'id,name,contentType,size,isInline' }
            });
            attachments = (att.value || []).map((a: any) => ({
              id: a.id, name: a.name, contentType: a.contentType,
              size: a.size, isInline: a.isInline,
            }));
          }
          return jsonResult({
            id: msg.id,
            subject: msg.subject,
            from: msg.from?.emailAddress?.address,
            fromName: msg.from?.emailAddress?.name,
            to: msg.toRecipients?.map((r: any) => ({ email: r.emailAddress?.address, name: r.emailAddress?.name })),
            cc: msg.ccRecipients?.map((r: any) => ({ email: r.emailAddress?.address, name: r.emailAddress?.name })),
            bcc: msg.bccRecipients?.map((r: any) => ({ email: r.emailAddress?.address, name: r.emailAddress?.name })),
            replyTo: msg.replyTo?.map((r: any) => r.emailAddress?.address),
            date: msg.receivedDateTime,
            sentDate: msg.sentDateTime,
            body: msg.body?.content,
            bodyType: msg.body?.contentType,
            isRead: msg.isRead,
            importance: msg.importance,
            attachments,
            conversationId: msg.conversationId,
            internetMessageId: msg.internetMessageId,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_send',
      description: 'Send an email via Outlook. Supports to, cc, bcc, HTML body, importance, and reply-to.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          to: { type: 'string', description: 'Recipient email(s), comma-separated' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Email body (HTML or plain text)' },
          cc: { type: 'string', description: 'CC recipients, comma-separated' },
          bcc: { type: 'string', description: 'BCC recipients, comma-separated' },
          importance: { type: 'string', description: 'low, normal, or high (default: normal)' },
          isHtml: { type: 'boolean', description: 'Whether body is HTML (default: false)' },
          replyTo: { type: 'string', description: 'Reply-to address' },
          saveToSent: { type: 'boolean', description: 'Save to Sent Items (default: true)' },
        },
        required: ['to', 'subject', 'body'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const toRecipients = params.to.split(',').map((e: string) => ({
            emailAddress: { address: e.trim() }
          }));
          const message: any = {
            subject: params.subject,
            body: { contentType: params.isHtml ? 'HTML' : 'Text', content: params.body },
            toRecipients,
          };
          if (params.cc) message.ccRecipients = params.cc.split(',').map((e: string) => ({ emailAddress: { address: e.trim() } }));
          if (params.bcc) message.bccRecipients = params.bcc.split(',').map((e: string) => ({ emailAddress: { address: e.trim() } }));
          if (params.importance) message.importance = params.importance;
          if (params.replyTo) message.replyTo = [{ emailAddress: { address: params.replyTo } }];

          await graph(token, '/me/sendMail', {
            method: 'POST',
            body: { message, saveToSentItems: params.saveToSent !== false },
          });
          return jsonResult({ sent: true, to: params.to, subject: params.subject });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_reply',
      description: 'Reply to an email message. Can reply to sender only or reply-all.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageId: { type: 'string', description: 'Message ID to reply to' },
          body: { type: 'string', description: 'Reply body text' },
          replyAll: { type: 'boolean', description: 'Reply to all recipients (default: false)' },
          isHtml: { type: 'boolean', description: 'Whether body is HTML (default: false)' },
        },
        required: ['messageId', 'body'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const action = params.replyAll ? 'replyAll' : 'reply';
          await graph(token, `/me/messages/${params.messageId}/${action}`, {
            method: 'POST',
            body: { comment: params.body },
          });
          return jsonResult({ replied: true, messageId: params.messageId, replyAll: !!params.replyAll });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_forward',
      description: 'Forward an email message to another recipient.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageId: { type: 'string', description: 'Message ID to forward' },
          to: { type: 'string', description: 'Forward recipient email(s), comma-separated' },
          comment: { type: 'string', description: 'Optional comment to add above the forwarded message' },
        },
        required: ['messageId', 'to'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const toRecipients = params.to.split(',').map((e: string) => ({ emailAddress: { address: e.trim() } }));
          await graph(token, `/me/messages/${params.messageId}/forward`, {
            method: 'POST',
            body: { comment: params.comment || '', toRecipients },
          });
          return jsonResult({ forwarded: true, messageId: params.messageId, to: params.to });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_move',
      description: 'Move a message to another folder.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageId: { type: 'string', description: 'Message ID to move' },
          folder: { type: 'string', description: 'Destination folder: inbox, archive, deleteditems, junkemail, or folder ID' },
        },
        required: ['messageId', 'folder'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          // Resolve well-known folder names
          const folderMap: Record<string, string> = {
            inbox: 'inbox', archive: 'archive', trash: 'deleteditems',
            deleteditems: 'deleteditems', junk: 'junkemail', junkemail: 'junkemail',
            sent: 'sentitems', sentitems: 'sentitems', drafts: 'drafts',
          };
          const destId = folderMap[params.folder.toLowerCase()] || params.folder;
          const result = await graph(token, `/me/messages/${params.messageId}/move`, {
            method: 'POST',
            body: { destinationId: destId },
          });
          return jsonResult({ moved: true, newId: result.id, folder: params.folder });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_delete',
      description: 'Delete an email message (moves to Deleted Items).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageId: { type: 'string', description: 'Message ID to delete' },
        },
        required: ['messageId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          await graph(token, `/me/messages/${params.messageId}`, { method: 'DELETE' });
          return jsonResult({ deleted: true, messageId: params.messageId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_update',
      description: 'Update message properties: mark as read/unread, flag, change importance, add categories.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageId: { type: 'string', description: 'Message ID to update' },
          isRead: { type: 'boolean', description: 'Mark as read or unread' },
          importance: { type: 'string', description: 'low, normal, or high' },
          flag: { type: 'string', description: 'notFlagged, flagged, or complete' },
          categories: { type: 'array', items: { type: 'string' }, description: 'Category labels to apply' },
        },
        required: ['messageId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const body: any = {};
          if (params.isRead !== undefined) body.isRead = params.isRead;
          if (params.importance) body.importance = params.importance;
          if (params.flag) body.flag = { flagStatus: params.flag };
          if (params.categories) body.categories = params.categories;
          await graph(token, `/me/messages/${params.messageId}`, { method: 'PATCH', body });
          return jsonResult({ updated: true, messageId: params.messageId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_search',
      description: 'Search emails across all folders using Microsoft Search. Supports natural language queries.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query (natural language or KQL: "from:user@example.com subject:report")' },
          maxResults: { type: 'number', description: 'Max results (default: 10, max: 25)' },
        },
        required: ['query'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const top = Math.min(params.maxResults || 10, 25);
          // Use $search on messages endpoint
          const data = await graph(token, '/me/messages', {
            query: {
              '$search': `"${params.query}"`,
              '$top': String(top),
              '$select': 'id,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments,importance',
            }
          });
          const messages = (data.value || []).map((m: any) => ({
            id: m.id,
            subject: m.subject,
            from: m.from?.emailAddress?.address,
            fromName: m.from?.emailAddress?.name,
            date: m.receivedDateTime,
            preview: m.bodyPreview,
            isRead: m.isRead,
            hasAttachments: m.hasAttachments,
          }));
          return jsonResult({ messages, count: messages.length, query: params.query });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_draft',
      description: 'Create a draft email in Outlook. Can be edited and sent later.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          to: { type: 'string', description: 'Recipient email(s), comma-separated' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Email body' },
          cc: { type: 'string', description: 'CC recipients' },
          isHtml: { type: 'boolean', description: 'Whether body is HTML' },
        },
        required: ['to', 'subject', 'body'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const message: any = {
            subject: params.subject,
            body: { contentType: params.isHtml ? 'HTML' : 'Text', content: params.body },
            toRecipients: params.to.split(',').map((e: string) => ({ emailAddress: { address: e.trim() } })),
          };
          if (params.cc) message.ccRecipients = params.cc.split(',').map((e: string) => ({ emailAddress: { address: e.trim() } }));
          const draft = await graph(token, '/me/messages', { method: 'POST', body: message });
          return jsonResult({ draftId: draft.id, subject: params.subject, status: 'draft_created' });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_send_draft',
      description: 'Send an existing draft email.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageId: { type: 'string', description: 'Draft message ID to send' },
        },
        required: ['messageId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          await graph(token, `/me/messages/${params.messageId}/send`, { method: 'POST' });
          return jsonResult({ sent: true, messageId: params.messageId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_folders',
      description: 'List mail folders in the mailbox.',
      category: 'utility' as const,
      parameters: { type: 'object' as const, properties: {}, required: [] },
      async execute(_id: string) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, '/me/mailFolders', {
            query: { '$top': '50', '$select': 'id,displayName,totalItemCount,unreadItemCount,parentFolderId' }
          });
          const folders = (data.value || []).map((f: any) => ({
            id: f.id, name: f.displayName,
            totalItems: f.totalItemCount, unreadItems: f.unreadItemCount,
          }));
          return jsonResult({ folders, count: folders.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_attachment_download',
      description: 'Download an attachment from an email. Returns the attachment content as base64.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageId: { type: 'string', description: 'Message ID containing the attachment' },
          attachmentId: { type: 'string', description: 'Attachment ID to download' },
        },
        required: ['messageId', 'attachmentId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const att = await graph(token, `/me/messages/${params.messageId}/attachments/${params.attachmentId}`);
          return jsonResult({
            name: att.name, contentType: att.contentType, size: att.size,
            content: att.contentBytes, // base64 encoded
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
