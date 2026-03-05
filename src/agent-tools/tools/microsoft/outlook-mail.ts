/**
 * Microsoft Outlook Mail Tools
 *
 * Comprehensive Outlook/Exchange mail management via Microsoft Graph API.
 * 20 tools covering inbox, send, reply, forward, drafts, folders, attachments,
 * search, threads, rules, auto-reply, signatures, and categories.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { MicrosoftToolsConfig } from './index.js';
import { graph } from './graph-api.js';

function mapMessage(m: any, full = false): any {
  const result: any = {
    id: m.id,
    subject: m.subject,
    from: m.from?.emailAddress?.address,
    fromName: m.from?.emailAddress?.name,
    to: m.toRecipients?.map((r: any) => r.emailAddress?.address),
    date: m.receivedDateTime,
    isRead: m.isRead,
    hasAttachments: m.hasAttachments,
    importance: m.importance,
    conversationId: m.conversationId,
  };
  if (!full) {
    result.preview = m.bodyPreview;
    result.flagged = m.flag?.flagStatus === 'flagged';
    result.cc = m.ccRecipients?.map((r: any) => r.emailAddress?.address);
  } else {
    result.to = m.toRecipients?.map((r: any) => ({ email: r.emailAddress?.address, name: r.emailAddress?.name }));
    result.cc = m.ccRecipients?.map((r: any) => ({ email: r.emailAddress?.address, name: r.emailAddress?.name }));
    result.bcc = m.bccRecipients?.map((r: any) => ({ email: r.emailAddress?.address, name: r.emailAddress?.name }));
    result.replyTo = m.replyTo?.map((r: any) => r.emailAddress?.address);
    result.sentDate = m.sentDateTime;
    result.body = m.body?.content;
    result.bodyType = m.body?.contentType;
    result.internetMessageId = m.internetMessageId;
    result.categories = m.categories;
    result.flagged = m.flag?.flagStatus === 'flagged';
  }
  return result;
}

const LIST_SELECT = 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,hasAttachments,importance,bodyPreview,flag,conversationId,categories';
const FULL_SELECT = 'id,subject,from,toRecipients,ccRecipients,bccRecipients,replyTo,receivedDateTime,sentDateTime,isRead,hasAttachments,importance,body,flag,conversationId,internetMessageId,parentFolderId,categories';

function parseRecipients(str: string) {
  return str.split(',').map((e: string) => ({ emailAddress: { address: e.trim() } }));
}

export function createOutlookMailTools(config: MicrosoftToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    {
      name: 'outlook_mail_list',
      description: 'List messages from Outlook mailbox. Returns recent emails from inbox or specified folder. Supports OData filtering and search.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          folder: { type: 'string', description: 'Folder: inbox, sentitems, drafts, deleteditems, junkemail, archive, or folder ID (default: inbox)' },
          maxResults: { type: 'number', description: 'Max messages to return (default: 20, max: 50)' },
          filter: { type: 'string', description: 'OData $filter (e.g., "isRead eq false", "from/emailAddress/address eq \'user@example.com\'", "hasAttachments eq true", "importance eq \'high\'")' },
          search: { type: 'string', description: 'Search query (searches subject, body, sender — natural language or KQL)' },
          orderBy: { type: 'string', description: 'Sort order (default: "receivedDateTime desc"). Options: receivedDateTime, from/emailAddress/address, subject, importance' },
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
            '$orderby': params.orderBy || 'receivedDateTime desc',
            '$select': LIST_SELECT,
          };
          if (params.filter) query['$filter'] = params.filter;
          if (params.search) query['$search'] = `"${params.search}"`;
          const data = await graph(token, `/me/mailFolders/${folder}/messages`, { query });
          const messages = (data.value || []).map((m: any) => mapMessage(m));
          return jsonResult({ messages, count: messages.length, folder });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_read',
      description: 'Read a specific email message by ID. Returns full body, headers, attachments list, and categories.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageId: { type: 'string', description: 'Message ID to read' },
          markAsRead: { type: 'boolean', description: 'Mark as read when opening (default: true)' },
          preferText: { type: 'boolean', description: 'Request plain text body instead of HTML (default: false)' },
        },
        required: ['messageId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const headers: Record<string, string> = {};
          if (params.preferText) headers['Prefer'] = 'outlook.body-content-type="text"';
          const msg = await graph(token, `/me/messages/${params.messageId}`, {
            query: { '$select': FULL_SELECT },
            headers,
          });
          if (params.markAsRead !== false && !msg.isRead) {
            graph(token, `/me/messages/${params.messageId}`, { method: 'PATCH', body: { isRead: true } }).catch(() => {});
          }
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
          const result = mapMessage(msg, true);
          result.attachments = attachments;
          result.attachmentCount = attachments.length;
          return jsonResult(result);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_thread',
      description: 'Get all messages in a conversation thread. Groups related emails by conversationId for context.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          conversationId: { type: 'string', description: 'Conversation ID (from any message in the thread)' },
          messageId: { type: 'string', description: 'Message ID — will auto-find its conversationId' },
          maxResults: { type: 'number', description: 'Max messages in thread (default: 25)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          let convId = params.conversationId;
          if (!convId && params.messageId) {
            const msg = await graph(token, `/me/messages/${params.messageId}`, { query: { '$select': 'conversationId' } });
            convId = msg.conversationId;
          }
          if (!convId) throw new Error('Provide conversationId or messageId');
          const data = await graph(token, '/me/messages', {
            query: {
              '$filter': `conversationId eq '${convId}'`,
              '$orderby': 'receivedDateTime asc',
              '$top': String(params.maxResults || 25),
              '$select': FULL_SELECT,
            }
          });
          const messages = (data.value || []).map((m: any) => mapMessage(m, true));
          return jsonResult({ conversationId: convId, messages, count: messages.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_send',
      description: 'Send an email via Outlook. Supports to, cc, bcc, HTML body, attachments (base64), importance, and reply-to.',
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
          isHtml: { type: 'boolean', description: 'Whether body is HTML (default: auto-detect)' },
          replyTo: { type: 'string', description: 'Reply-to address' },
          saveToSent: { type: 'boolean', description: 'Save to Sent Items (default: true)' },
          attachments: { type: 'array', description: 'Array of {name, contentType, contentBytes} — contentBytes is base64' },
          categories: { type: 'array', items: { type: 'string' }, description: 'Category labels to apply' },
        },
        required: ['to', 'subject', 'body'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const isHtml = params.isHtml ?? (/<[a-z][\s\S]*>/i.test(params.body));
          const message: any = {
            subject: params.subject,
            body: { contentType: isHtml ? 'HTML' : 'Text', content: params.body },
            toRecipients: parseRecipients(params.to),
          };
          if (params.cc) message.ccRecipients = parseRecipients(params.cc);
          if (params.bcc) message.bccRecipients = parseRecipients(params.bcc);
          if (params.importance) message.importance = params.importance;
          if (params.replyTo) message.replyTo = [{ emailAddress: { address: params.replyTo } }];
          if (params.categories) message.categories = params.categories;
          if (params.attachments?.length) {
            message.attachments = params.attachments.map((a: any) => ({
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: a.name,
              contentType: a.contentType || 'application/octet-stream',
              contentBytes: a.contentBytes,
            }));
          }
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
      description: 'Reply to an email. Can reply to sender only or reply-all. Supports HTML and attachments.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageId: { type: 'string', description: 'Message ID to reply to' },
          body: { type: 'string', description: 'Reply body text' },
          replyAll: { type: 'boolean', description: 'Reply to all recipients (default: false)' },
          isHtml: { type: 'boolean', description: 'Whether body is HTML (default: false)' },
          attachments: { type: 'array', description: 'Array of {name, contentType, contentBytes}' },
        },
        required: ['messageId', 'body'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const action = params.replyAll ? 'replyAll' : 'reply';
          const body: any = { comment: params.body };
          if (params.attachments?.length) {
            // Need to create reply as draft, add attachments, then send
            const draft = await graph(token, `/me/messages/${params.messageId}/createReply`, { method: 'POST' });
            // Update body
            await graph(token, `/me/messages/${draft.id}`, {
              method: 'PATCH',
              body: {
                body: { contentType: params.isHtml ? 'HTML' : 'Text', content: params.body },
              },
            });
            // Add attachments
            for (const a of params.attachments) {
              await graph(token, `/me/messages/${draft.id}/attachments`, {
                method: 'POST',
                body: {
                  '@odata.type': '#microsoft.graph.fileAttachment',
                  name: a.name,
                  contentType: a.contentType || 'application/octet-stream',
                  contentBytes: a.contentBytes,
                },
              });
            }
            await graph(token, `/me/messages/${draft.id}/send`, { method: 'POST' });
            return jsonResult({ replied: true, messageId: params.messageId, replyAll: !!params.replyAll, withAttachments: true });
          }
          await graph(token, `/me/messages/${params.messageId}/${action}`, { method: 'POST', body });
          return jsonResult({ replied: true, messageId: params.messageId, replyAll: !!params.replyAll });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_forward',
      description: 'Forward an email to another recipient with an optional comment.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageId: { type: 'string', description: 'Message ID to forward' },
          to: { type: 'string', description: 'Forward recipient email(s), comma-separated' },
          comment: { type: 'string', description: 'Optional comment above the forwarded message' },
        },
        required: ['messageId', 'to'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          await graph(token, `/me/messages/${params.messageId}/forward`, {
            method: 'POST',
            body: { comment: params.comment || '', toRecipients: parseRecipients(params.to) },
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
          folder: { type: 'string', description: 'Destination: inbox, archive, deleteditems, junkemail, sentitems, drafts, or folder ID' },
        },
        required: ['messageId', 'folder'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const folderMap: Record<string, string> = {
            inbox: 'inbox', archive: 'archive', trash: 'deleteditems',
            deleteditems: 'deleteditems', junk: 'junkemail', junkemail: 'junkemail',
            sent: 'sentitems', sentitems: 'sentitems', drafts: 'drafts',
          };
          const destId = folderMap[params.folder.toLowerCase()] || params.folder;
          const result = await graph(token, `/me/messages/${params.messageId}/move`, {
            method: 'POST', body: { destinationId: destId },
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
      description: 'Update message properties: read/unread, flag, importance, categories.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageId: { type: 'string', description: 'Message ID to update' },
          isRead: { type: 'boolean', description: 'Mark as read or unread' },
          importance: { type: 'string', description: 'low, normal, or high' },
          flag: { type: 'string', description: 'notFlagged, flagged, or complete' },
          categories: { type: 'array', items: { type: 'string' }, description: 'Category labels to set (replaces existing)' },
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
      description: 'Search emails across all folders. Supports natural language and KQL syntax.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query (natural language or KQL: "from:user@example.com subject:report has:attachment")' },
          maxResults: { type: 'number', description: 'Max results (default: 15, max: 25)' },
          folder: { type: 'string', description: 'Limit search to specific folder (default: all folders)' },
        },
        required: ['query'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const top = Math.min(params.maxResults || 15, 25);
          const basePath = params.folder ? `/me/mailFolders/${params.folder}/messages` : '/me/messages';
          const data = await graph(token, basePath, {
            query: {
              '$search': `"${params.query}"`,
              '$top': String(top),
              '$select': LIST_SELECT,
            }
          });
          const messages = (data.value || []).map((m: any) => mapMessage(m));
          return jsonResult({ messages, count: messages.length, query: params.query });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_draft',
      description: 'Create a draft email. Can be edited and sent later with outlook_mail_send_draft.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          to: { type: 'string', description: 'Recipient email(s), comma-separated' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Email body' },
          cc: { type: 'string', description: 'CC recipients' },
          isHtml: { type: 'boolean', description: 'Whether body is HTML' },
          importance: { type: 'string', description: 'low, normal, or high' },
        },
        required: ['to', 'subject', 'body'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const message: any = {
            subject: params.subject,
            body: { contentType: params.isHtml ? 'HTML' : 'Text', content: params.body },
            toRecipients: parseRecipients(params.to),
          };
          if (params.cc) message.ccRecipients = parseRecipients(params.cc);
          if (params.importance) message.importance = params.importance;
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
      description: 'List all mail folders including nested child folders.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          parentFolderId: { type: 'string', description: 'Parent folder ID to list children (omit for top-level)' },
          includeHidden: { type: 'boolean', description: 'Include hidden folders (default: false)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const path = params.parentFolderId
            ? `/me/mailFolders/${params.parentFolderId}/childFolders`
            : '/me/mailFolders';
          const query: Record<string, string> = {
            '$top': '100',
            '$select': 'id,displayName,totalItemCount,unreadItemCount,parentFolderId,isHidden,childFolderCount',
          };
          if (!params.includeHidden) query['$filter'] = 'isHidden eq false';
          const data = await graph(token, path, { query });
          const folders = (data.value || []).map((f: any) => ({
            id: f.id, name: f.displayName,
            totalItems: f.totalItemCount, unreadItems: f.unreadItemCount,
            childFolders: f.childFolderCount, isHidden: f.isHidden,
          }));
          return jsonResult({ folders, count: folders.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_create_folder',
      description: 'Create a new mail folder.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'Folder name' },
          parentFolderId: { type: 'string', description: 'Parent folder ID (omit for top-level)' },
        },
        required: ['name'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const path = params.parentFolderId
            ? `/me/mailFolders/${params.parentFolderId}/childFolders`
            : '/me/mailFolders';
          const folder = await graph(token, path, {
            method: 'POST', body: { displayName: params.name },
          });
          return jsonResult({ id: folder.id, name: folder.displayName });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_attachment_download',
      description: 'Download an attachment from an email. Returns content as base64.',
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
            content: att.contentBytes,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_auto_reply',
      description: 'Configure automatic replies (out-of-office / vacation responder).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          status: { type: 'string', description: 'disabled, alwaysEnabled, or scheduled' },
          internalMessage: { type: 'string', description: 'Auto-reply message for internal senders (HTML)' },
          externalMessage: { type: 'string', description: 'Auto-reply message for external senders (HTML)' },
          externalAudience: { type: 'string', description: 'none, contactsOnly, or all (default: all)' },
          startDate: { type: 'string', description: 'Start date (ISO 8601, required if scheduled)' },
          endDate: { type: 'string', description: 'End date (ISO 8601, required if scheduled)' },
        },
        required: ['status'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          if (params.status === 'disabled') {
            await graph(token, '/me/mailboxSettings', {
              method: 'PATCH',
              body: { automaticRepliesSetting: { status: 'disabled' } },
            });
            return jsonResult({ autoReply: 'disabled' });
          }
          const setting: any = { status: params.status };
          if (params.internalMessage) setting.internalReplyMessage = params.internalMessage;
          if (params.externalMessage) setting.externalReplyMessage = params.externalMessage;
          if (params.externalAudience) setting.externalAudience = params.externalAudience;
          if (params.status === 'scheduled') {
            setting.scheduledStartDateTime = { dateTime: params.startDate, timeZone: 'UTC' };
            setting.scheduledEndDateTime = { dateTime: params.endDate, timeZone: 'UTC' };
          }
          await graph(token, '/me/mailboxSettings', {
            method: 'PATCH',
            body: { automaticRepliesSetting: setting },
          });
          return jsonResult({ autoReply: params.status, configured: true });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_get_auto_reply',
      description: 'Get current automatic reply (out-of-office) settings.',
      category: 'utility' as const,
      parameters: { type: 'object' as const, properties: {}, required: [] },
      async execute(_id: string) {
        try {
          const token = await tp.getAccessToken();
          const settings = await graph(token, '/me/mailboxSettings/automaticRepliesSetting');
          return jsonResult({
            status: settings.status,
            internalMessage: settings.internalReplyMessage,
            externalMessage: settings.externalReplyMessage,
            externalAudience: settings.externalAudience,
            startDate: settings.scheduledStartDateTime?.dateTime,
            endDate: settings.scheduledEndDateTime?.dateTime,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_rules',
      description: 'List, create, or delete inbox rules (message rules). Rules auto-process incoming mail.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          action: { type: 'string', description: 'list, create, or delete' },
          ruleId: { type: 'string', description: 'Rule ID (for delete)' },
          displayName: { type: 'string', description: 'Rule name (for create)' },
          conditions: { type: 'object', description: 'Match conditions object — e.g., {fromAddresses:[{emailAddress:{address:"user@example.com"}}], subjectContains:["invoice"]}' },
          actions: { type: 'object', description: 'Actions when matched — e.g., {moveToFolder:"archive", markAsRead:true, stopProcessingRules:true}' },
          isEnabled: { type: 'boolean', description: 'Enable/disable rule (default: true)' },
        },
        required: ['action'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          if (params.action === 'list') {
            const data = await graph(token, '/me/mailFolders/inbox/messageRules');
            const rules = (data.value || []).map((r: any) => ({
              id: r.id, name: r.displayName, isEnabled: r.isEnabled,
              sequence: r.sequence, conditions: r.conditions, actions: r.actions,
            }));
            return jsonResult({ rules, count: rules.length });
          }
          if (params.action === 'delete') {
            await graph(token, `/me/mailFolders/inbox/messageRules/${params.ruleId}`, { method: 'DELETE' });
            return jsonResult({ deleted: true, ruleId: params.ruleId });
          }
          if (params.action === 'create') {
            const rule = await graph(token, '/me/mailFolders/inbox/messageRules', {
              method: 'POST',
              body: {
                displayName: params.displayName || 'Agent Rule',
                isEnabled: params.isEnabled !== false,
                conditions: params.conditions || {},
                actions: params.actions || {},
              },
            });
            return jsonResult({ id: rule.id, name: rule.displayName, created: true });
          }
          throw new Error('action must be list, create, or delete');
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_categories',
      description: 'Manage Outlook categories (color-coded labels). List, create, or delete.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          action: { type: 'string', description: 'list, create, or delete' },
          name: { type: 'string', description: 'Category name (for create)' },
          color: { type: 'string', description: 'Color preset: None, Red, Orange, Brown, Yellow, Green, Teal, Olive, Blue, Purple, Cranberry, Steel, DarkSteel, Gray, DarkGray, Black (for create)' },
          categoryId: { type: 'string', description: 'Category ID (for delete)' },
        },
        required: ['action'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          if (params.action === 'list') {
            const data = await graph(token, '/me/outlook/masterCategories');
            const cats = (data.value || []).map((c: any) => ({
              id: c.id, name: c.displayName, color: c.color,
            }));
            return jsonResult({ categories: cats, count: cats.length });
          }
          if (params.action === 'create') {
            const cat = await graph(token, '/me/outlook/masterCategories', {
              method: 'POST',
              body: { displayName: params.name, color: params.color || 'None' },
            });
            return jsonResult({ id: cat.id, name: cat.displayName, color: cat.color });
          }
          if (params.action === 'delete') {
            await graph(token, `/me/outlook/masterCategories/${params.categoryId}`, { method: 'DELETE' });
            return jsonResult({ deleted: true });
          }
          throw new Error('action must be list, create, or delete');
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_mail_profile',
      description: 'Get the mailbox user profile — email address, display name, timezone, language, and mailbox settings.',
      category: 'utility' as const,
      parameters: { type: 'object' as const, properties: {}, required: [] },
      async execute(_id: string) {
        try {
          const token = await tp.getAccessToken();
          const [user, settings] = await Promise.all([
            graph(token, '/me', { query: { '$select': 'displayName,mail,userPrincipalName,jobTitle,department,officeLocation' } }),
            graph(token, '/me/mailboxSettings'),
          ]);
          return jsonResult({
            email: user.mail || user.userPrincipalName,
            name: user.displayName,
            jobTitle: user.jobTitle,
            department: user.department,
            office: user.officeLocation,
            timeZone: settings.timeZone,
            language: settings.language?.locale,
            dateFormat: settings.dateFormat,
            timeFormat: settings.timeFormat,
            delegateMeetingRequests: settings.delegateMeetingMessageDeliveryOptions,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
