/**
 * Google Gmail Tools
 *
 * Comprehensive Gmail API v1 tools for enterprise agents.
 * Covers inbox management, sending, drafts, labels, search, threads, and attachments.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { GoogleToolsConfig } from './index.js';
import { promises as fsPromises } from 'node:fs';
import * as nodePath from 'node:path';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function gmail(token: string, path: string, opts?: { method?: string; body?: any; query?: Record<string, string>; rawBody?: BodyInit; headers?: Record<string, string> }): Promise<any> {
  const method = opts?.method || 'GET';
  const url = new URL(BASE + path);
  if (opts?.query) for (const [k, v] of Object.entries(opts.query)) { if (v !== undefined && v !== '') url.searchParams.set(k, v); }
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, ...opts?.headers };
  if (!opts?.rawBody && !opts?.headers?.['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(url.toString(), {
    method, headers,
    body: opts?.rawBody || (opts?.body ? JSON.stringify(opts.body) : undefined),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API ${res.status}: ${err}`);
  }
  if (res.status === 204) return {};
  return res.json();
}

function decodeBase64Url(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf-8');
}

function encodeBase64Url(str: string): string {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** RFC 2047 encode a header value if it contains non-ASCII characters (e.g. emoji) */
function mimeEncodeHeader(value: string): string {
  // Check if any non-ASCII characters exist
  if (/^[\x00-\x7F]*$/.test(value)) return value; // pure ASCII — no encoding needed
  return '=?UTF-8?B?' + Buffer.from(value, 'utf-8').toString('base64') + '?=';
}

function extractHeaders(headers: any[], names: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const lower = names.map(n => n.toLowerCase());
  for (const h of headers || []) {
    const idx = lower.indexOf(h.name?.toLowerCase());
    if (idx >= 0) result[names[idx]] = h.value;
  }
  return result;
}

function parseMessage(msg: any, format: string): any {
  const headers = msg.payload?.headers || [];
  const h = extractHeaders(headers, ['From', 'To', 'Cc', 'Bcc', 'Subject', 'Date', 'Reply-To', 'Message-ID', 'In-Reply-To', 'References']);
  const result: any = {
    id: msg.id,
    threadId: msg.threadId,
    labelIds: msg.labelIds,
    snippet: msg.snippet,
    internalDate: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : undefined,
    sizeEstimate: msg.sizeEstimate,
    from: h.From,
    to: h.To,
    cc: h.Cc,
    bcc: h.Bcc,
    subject: h.Subject,
    date: h.Date,
    replyTo: h['Reply-To'],
    messageId: h['Message-ID'],
    inReplyTo: h['In-Reply-To'],
    isUnread: msg.labelIds?.includes('UNREAD'),
    isStarred: msg.labelIds?.includes('STARRED'),
    isImportant: msg.labelIds?.includes('IMPORTANT'),
    isDraft: msg.labelIds?.includes('DRAFT'),
  };

  if (format !== 'metadata') {
    // Extract body
    const body = extractBody(msg.payload);
    result.body = body.text?.slice(0, 80000);
    result.bodyHtml = body.html?.slice(0, 20000);
    result.truncated = (body.text?.length || 0) > 80000;

    // Extract attachments metadata
    const attachments = extractAttachments(msg.payload);
    if (attachments.length) {
      result.attachments = attachments;
      result.attachmentCount = attachments.length;
    }
  }

  return result;
}

function extractBody(payload: any): { text?: string; html?: string } {
  if (!payload) return {};
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return { text: decodeBase64Url(payload.body.data) };
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return { html: decodeBase64Url(payload.body.data) };
  }
  if (payload.parts) {
    let text: string | undefined;
    let html: string | undefined;
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data && !text) {
        text = decodeBase64Url(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body?.data && !html) {
        html = decodeBase64Url(part.body.data);
      } else if (part.mimeType?.startsWith('multipart/') && part.parts) {
        const nested = extractBody(part);
        if (!text && nested.text) text = nested.text;
        if (!html && nested.html) html = nested.html;
      }
    }
    return { text, html };
  }
  return {};
}

function extractAttachments(payload: any): any[] {
  const atts: any[] = [];
  function walk(part: any) {
    if (part.filename && part.body?.attachmentId) {
      atts.push({
        filename: part.filename,
        mimeType: part.mimeType,
        size: part.body.size,
        attachmentId: part.body.attachmentId,
      });
    }
    if (part.parts) part.parts.forEach(walk);
  }
  if (payload) walk(payload);
  return atts;
}

/** Resolve attachment_paths into attachment objects, merging with any explicit attachments */
async function resolveAttachments(params: any): Promise<Array<{ filename: string; base64: string; mimeType: string }> | undefined> {
  // Handle attachments as array or JSON string
  let rawAttachments = params.attachments;
  if (typeof rawAttachments === 'string') { try { rawAttachments = JSON.parse(rawAttachments); } catch { rawAttachments = []; } }
  const attachments: Array<{ filename: string; base64: string; mimeType: string }> = [...(rawAttachments || [])];

  // Handle attachment_paths as array or JSON string
  let paths = params.attachment_paths;
  if (typeof paths === 'string') { try { paths = JSON.parse(paths); } catch { paths = [paths]; } }
  if (paths && Array.isArray(paths)) {
    for (const filePath of paths) {
      try {
        const buf = await fsPromises.readFile(filePath);
        const ext = nodePath.extname(filePath).toLowerCase();
        const mimeMap: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json' };
        attachments.push({
          filename: nodePath.basename(filePath),
          base64: buf.toString('base64'),
          mimeType: mimeMap[ext] || 'application/octet-stream',
        });
      } catch (e: any) {
        console.warn(`[gmail] Failed to read attachment ${filePath}: ${e.message}`);
      }
    }
  }
  return attachments.length > 0 ? attachments : undefined;
}

function buildRawEmail(opts: {
  from?: string; to: string; cc?: string; bcc?: string;
  subject: string; body: string; html?: string;
  replyTo?: string; inReplyTo?: string; references?: string;
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string; base64: string; mimeType: string }>;
}): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lines: string[] = [];
  lines.push(`MIME-Version: 1.0`);
  if (opts.from) lines.push(`From: ${opts.from}`);
  lines.push(`To: ${opts.to}`);
  if (opts.cc) lines.push(`Cc: ${opts.cc}`);
  if (opts.bcc) lines.push(`Bcc: ${opts.bcc}`);
  lines.push(`Subject: ${mimeEncodeHeader(opts.subject)}`);
  if (opts.replyTo) lines.push(`Reply-To: ${opts.replyTo}`);
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) lines.push(`References: ${opts.references}`);
  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) lines.push(`${k}: ${v}`);
  }

  const hasAttachments = opts.attachments && opts.attachments.length > 0;

  if (hasAttachments) {
    // multipart/mixed: body + attachments
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    lines.push('');

    // Body part
    lines.push(`--${boundary}`);
    if (opts.html) {
      lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
      lines.push('');
      lines.push(`--${altBoundary}`);
      lines.push('Content-Type: text/plain; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: 8bit');
      lines.push('');
      lines.push(opts.body);
      lines.push(`--${altBoundary}`);
      lines.push('Content-Type: text/html; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: 8bit');
      lines.push('');
      lines.push(opts.html);
      lines.push(`--${altBoundary}--`);
    } else {
      lines.push('Content-Type: text/plain; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: 8bit');
      lines.push('');
      lines.push(opts.body);
    }

    // Attachment parts
    for (const att of opts.attachments!) {
      lines.push(`--${boundary}`);
      lines.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
      lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
      lines.push('Content-Transfer-Encoding: base64');
      lines.push('');
      // Split base64 into 76-char lines per MIME spec
      const b64 = att.base64;
      for (let i = 0; i < b64.length; i += 76) {
        lines.push(b64.slice(i, i + 76));
      }
    }
    lines.push(`--${boundary}--`);
  } else if (opts.html) {
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: 8bit');
    lines.push('');
    lines.push(opts.body);
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: 8bit');
    lines.push('');
    lines.push(opts.html);
    lines.push(`--${boundary}--`);
  } else {
    lines.push('Content-Type: text/plain; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: 8bit');
    lines.push('');
    lines.push(opts.body);
  }

  return lines.join('\r\n');
}

// Cache for Gmail signature (fetched once per tool creation)
let cachedSignature: string | null = null;
let signatureFetched = false;

async function getSignature(token: string): Promise<string> {
  if (signatureFetched) return cachedSignature || '';
  signatureFetched = true;
  try {
    const res = await gmail(token, '/settings/sendAs');
    const primary = res.sendAs?.find((s: any) => s.isPrimary) || res.sendAs?.[0];
    cachedSignature = primary?.signature || null;
  } catch { cachedSignature = null; }
  return cachedSignature || '';
}

function appendSignature(body: string, signatureHtml: string): string {
  if (!signatureHtml) return body;
  // For plain text, strip HTML tags from signature and append
  const plainSig = signatureHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
  return body + '\n\n' + plainSig;
}

function appendSignatureHtml(bodyHtml: string, signatureHtml: string): string {
  if (!signatureHtml) return bodyHtml;
  return bodyHtml + '<br><br>' + signatureHtml;
}

export function createGmailTools(config: GoogleToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;
  return [
    // ─── List / Search ─────────────────────────────────
    {
      name: 'gmail_search',
      description: 'Search emails using Gmail search syntax. Supports all Gmail operators: from:, to:, subject:, has:attachment, is:unread, after:, before:, label:, in:, category:, larger:, smaller:, filename:, etc.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Gmail search query (e.g. "from:alice@example.com is:unread", "subject:invoice after:2026/01/01", "has:attachment filename:pdf")' },
          maxResults: { type: 'number', description: 'Max messages (default: 20, max: 100)' },
          labelIds: { type: 'string', description: 'Comma-separated label IDs to filter (e.g. "INBOX", "SENT", "STARRED", "IMPORTANT", "UNREAD")' },
          includeSpamTrash: { type: 'string', description: '"true" to include spam/trash in results' },
          pageToken: { type: 'string', description: 'Token for next page of results' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const q: Record<string, string> = {
            maxResults: String(Math.min(params.maxResults || 20, 100)),
          };
          if (params.query) q.q = params.query;
          if (params.labelIds) q.labelIds = params.labelIds;
          if (params.includeSpamTrash === 'true') q.includeSpamTrash = 'true';
          if (params.pageToken) q.pageToken = params.pageToken;

          const list = await gmail(token, '/messages', { query: q });
          if (!list.messages?.length) {
            return jsonResult({ messages: [], count: 0, resultSizeEstimate: list.resultSizeEstimate || 0 });
          }

          // Fetch each message with metadata
          const messages = await Promise.all(
            list.messages.slice(0, 25).map(async (m: any) => {
              try {
                const msg = await gmail(token, `/messages/${m.id}`, { query: { format: 'metadata', metadataHeaders: 'From,To,Cc,Subject,Date' } });
                return parseMessage(msg, 'metadata');
              } catch { return { id: m.id, threadId: m.threadId, error: 'Failed to fetch' }; }
            })
          );

          return jsonResult({
            messages,
            count: messages.length,
            resultSizeEstimate: list.resultSizeEstimate,
            nextPageToken: list.nextPageToken,
            hasMore: !!list.nextPageToken,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Read Message ──────────────────────────────────
    {
      name: 'gmail_read',
      description: 'Read the full content of an email message including body text, HTML, and attachment info.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageId: { type: 'string', description: 'Message ID (required)' },
          markAsRead: { type: 'string', description: '"true" to mark as read when opening (default: "false")' },
        },
        required: ['messageId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const msg = await gmail(token, `/messages/${params.messageId}`, { query: { format: 'full' } });
          const parsed = parseMessage(msg, 'full');

          if (params.markAsRead === 'true' && parsed.isUnread) {
            await gmail(token, `/messages/${params.messageId}/modify`, {
              method: 'POST', body: { removeLabelIds: ['UNREAD'] },
            }).catch(() => {});
          }

          return jsonResult(parsed);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Read Thread ───────────────────────────────────
    {
      name: 'gmail_thread',
      description: 'Read an entire email thread/conversation. Returns all messages in the thread.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          threadId: { type: 'string', description: 'Thread ID (required)' },
          format: { type: 'string', description: '"full" (default) or "metadata" (headers only, faster)' },
        },
        required: ['threadId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const fmt = params.format || 'full';
          const thread = await gmail(token, `/threads/${params.threadId}`, {
            query: { format: fmt, ...(fmt === 'metadata' ? { metadataHeaders: 'From,To,Cc,Subject,Date' } : {}) },
          });
          const messages = (thread.messages || []).map((m: any) => parseMessage(m, fmt));
          return jsonResult({
            threadId: thread.id, snippet: thread.snippet,
            messages, messageCount: messages.length,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Send Email ────────────────────────────────────
    {
      name: 'gmail_send',
      description: 'Send an email. Supports plain text, HTML, CC/BCC, reply threading, attachments, and custom headers.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          to: { type: 'string', description: 'Recipient email(s), comma-separated (required)' },
          subject: { type: 'string', description: 'Email subject (required)' },
          body: { type: 'string', description: 'Plain text body (required)' },
          html: { type: 'string', description: 'HTML body (optional — sends multipart with text fallback)' },
          cc: { type: 'string', description: 'CC recipients, comma-separated' },
          bcc: { type: 'string', description: 'BCC recipients, comma-separated' },
          replyTo: { type: 'string', description: 'Reply-To address' },
          threadId: { type: 'string', description: 'Thread ID to reply in (for threading)' },
          inReplyTo: { type: 'string', description: 'Message-ID being replied to (for proper threading)' },
          references: { type: 'string', description: 'Message-ID references chain' },
          attachments: { type: 'string', description: 'JSON array of file attachments: [{"filename": "screenshot.png", "base64": "...", "mimeType": "image/png"}]' },
          attachment_paths: { type: 'string', description: 'JSON array of file paths to attach, e.g. ["/tmp/screenshot.png"]. Reads files automatically.' },
        },
        required: ['to', 'subject', 'body'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const email = tp.getEmail();
          const sig = await getSignature(token);
          const bodyWithSig = appendSignature(params.body, sig);
          const htmlWithSig = params.html ? appendSignatureHtml(params.html, sig) : (sig ? `<div>${params.body.replace(/\n/g, '<br>')}</div><br><br>${sig}` : undefined);
          const resolvedAttachments = await resolveAttachments(params);
          const raw = buildRawEmail({
            from: email, to: params.to, cc: params.cc, bcc: params.bcc,
            subject: params.subject, body: bodyWithSig, html: htmlWithSig,
            replyTo: params.replyTo, inReplyTo: params.inReplyTo, references: params.references,
            attachments: resolvedAttachments,
          });
          const sendBody: any = { raw: encodeBase64Url(raw) };
          if (params.threadId) sendBody.threadId = params.threadId;
          const result = await gmail(token, '/messages/send', { method: 'POST', body: sendBody });
          return jsonResult({ sent: true, messageId: result.id, threadId: result.threadId, labelIds: result.labelIds, attachmentCount: resolvedAttachments?.length || 0 });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Reply to Email ────────────────────────────────
    {
      name: 'gmail_reply',
      description: 'Reply to an email. Auto-sets threading headers (In-Reply-To, References, threadId). Supports file attachments.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageId: { type: 'string', description: 'Message ID to reply to (required)' },
          body: { type: 'string', description: 'Reply text (required)' },
          html: { type: 'string', description: 'HTML reply body (optional)' },
          replyAll: { type: 'string', description: '"true" to reply to all recipients' },
          cc: { type: 'string', description: 'Additional CC recipients' },
          attachments: { type: 'string', description: 'JSON array of file attachments: [{"filename": "screenshot.png", "base64": "...", "mimeType": "image/png"}]' },
          attachment_paths: { type: 'string', description: 'JSON array of file paths to attach, e.g. ["/tmp/screenshot.png"]. Reads files automatically.' },
        },
        required: ['messageId', 'body'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const email = tp.getEmail();

          // Fetch original message for threading (use full format to ensure headers are present)
          const original = await gmail(token, `/messages/${params.messageId}`, { query: { format: 'full' } });
          const oh = extractHeaders(original.payload?.headers || [], ['From', 'To', 'Cc', 'Subject', 'Message-ID', 'References']);

          // Extract clean email from From header (handles "Name <email>" format)
          const extractEmail = (h: string | undefined) => {
            if (!h) return '';
            const m = h.match(/<([^>]+)>/);
            return m ? m[1] : h.trim();
          };
          const to = params.replyAll === 'true'
            ? [oh.From, ...(oh.To || '').split(','), ...(oh.Cc || '').split(',')]
              .map(e => extractEmail(e))
              .filter(e => e && !e.includes(email || '___'))
              .join(',')
            : extractEmail(oh.From);

          const subject = oh.Subject?.startsWith('Re:') ? oh.Subject : `Re: ${oh.Subject || ''}`;
          const references = [oh.References, oh['Message-ID']].filter(Boolean).join(' ');

          const sig = await getSignature(token);
          const bodyWithSig = appendSignature(params.body, sig);
          const htmlWithSig = params.html ? appendSignatureHtml(params.html, sig) : (sig ? `<div>${params.body.replace(/\n/g, '<br>')}</div><br><br>${sig}` : undefined);
          const resolvedAttachments = await resolveAttachments(params);
          const raw = buildRawEmail({
            from: email, to, cc: params.cc,
            subject, body: bodyWithSig, html: htmlWithSig,
            inReplyTo: oh['Message-ID'], references,
            attachments: resolvedAttachments,
          });

          const result = await gmail(token, '/messages/send', {
            method: 'POST',
            body: { raw: encodeBase64Url(raw), threadId: original.threadId },
          });
          return jsonResult({ sent: true, messageId: result.id, threadId: result.threadId, inReplyTo: oh['Message-ID'] });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Forward Email ─────────────────────────────────
    {
      name: 'gmail_forward',
      description: 'Forward an email to another recipient, preserving the original message content. Supports file attachments.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageId: { type: 'string', description: 'Message ID to forward (required)' },
          to: { type: 'string', description: 'Forward to (required)' },
          body: { type: 'string', description: 'Additional message to include above forwarded content' },
          cc: { type: 'string', description: 'CC recipients' },
          attachment_paths: { type: 'string', description: 'JSON array of file paths to attach, e.g. ["/tmp/screenshot.png"]. Reads files automatically.' },
        },
        required: ['messageId', 'to'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const email = tp.getEmail();

          const original = await gmail(token, `/messages/${params.messageId}`, { query: { format: 'full' } });
          const parsed = parseMessage(original, 'full');
          const fwdBody = [
            params.body || '',
            '',
            '---------- Forwarded message ----------',
            `From: ${parsed.from}`,
            `Date: ${parsed.date}`,
            `Subject: ${parsed.subject}`,
            `To: ${parsed.to}`,
            parsed.cc ? `Cc: ${parsed.cc}` : '',
            '',
            parsed.body || '',
          ].filter(Boolean).join('\n');

          const resolvedAttachments = await resolveAttachments(params);
          const raw = buildRawEmail({
            from: email, to: params.to, cc: params.cc,
            subject: `Fwd: ${parsed.subject || ''}`,
            body: fwdBody,
            attachments: resolvedAttachments,
          });

          const result = await gmail(token, '/messages/send', { method: 'POST', body: { raw: encodeBase64Url(raw) } });
          return jsonResult({ forwarded: true, messageId: result.id, threadId: result.threadId, originalMessageId: params.messageId, attachmentCount: resolvedAttachments?.length || 0 });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Modify Labels ─────────────────────────────────
    {
      name: 'gmail_modify',
      description: 'Add or remove labels from messages. Use for: mark read/unread, star/unstar, archive, move to trash, apply labels.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageIds: { type: 'string', description: 'Comma-separated message IDs (required)' },
          addLabels: { type: 'string', description: 'Comma-separated label IDs to add (e.g. "STARRED", "IMPORTANT", "Label_123")' },
          removeLabels: { type: 'string', description: 'Comma-separated label IDs to remove (e.g. "UNREAD", "INBOX")' },
        },
        required: ['messageIds'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const ids = params.messageIds.split(',').map((s: string) => s.trim()).filter(Boolean);
          const addLabels = params.addLabels ? params.addLabels.split(',').map((s: string) => s.trim()) : [];
          const removeLabels = params.removeLabels ? params.removeLabels.split(',').map((s: string) => s.trim()) : [];

          if (ids.length === 1) {
            await gmail(token, `/messages/${ids[0]}/modify`, {
              method: 'POST', body: { addLabelIds: addLabels, removeLabelIds: removeLabels },
            });
          } else {
            // Batch modify
            await gmail(token, '/messages/batchModify', {
              method: 'POST', body: { ids, addLabelIds: addLabels, removeLabelIds: removeLabels },
            });
          }

          return jsonResult({ modified: true, count: ids.length, addedLabels: addLabels, removedLabels: removeLabels });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Trash / Delete ────────────────────────────────
    {
      name: 'gmail_trash',
      description: 'Move messages to trash or permanently delete them.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageIds: { type: 'string', description: 'Comma-separated message IDs (required)' },
          permanent: { type: 'string', description: '"true" to permanently delete (IRREVERSIBLE). Default: moves to trash.' },
        },
        required: ['messageIds'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const ids = params.messageIds.split(',').map((s: string) => s.trim()).filter(Boolean);
          const permanent = params.permanent === 'true';

          for (const id of ids) {
            if (permanent) {
              await gmail(token, `/messages/${id}`, { method: 'DELETE' });
            } else {
              await gmail(token, `/messages/${id}/trash`, { method: 'POST' });
            }
          }

          return jsonResult({ [permanent ? 'deleted' : 'trashed']: true, count: ids.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Labels ────────────────────────────────────────
    {
      name: 'gmail_labels',
      description: 'List all labels/folders, or create/delete a label.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          action: { type: 'string', description: '"list" (default), "create", or "delete"' },
          name: { type: 'string', description: 'Label name (for create)' },
          labelId: { type: 'string', description: 'Label ID (for delete)' },
          color: { type: 'string', description: 'Label background color hex (for create, e.g. "#4986e7")' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const action = params.action || 'list';

          if (action === 'create') {
            if (!params.name) return errorResult('name is required for create');
            const body: any = { name: params.name, labelListVisibility: 'labelShow', messageListVisibility: 'show' };
            if (params.color) body.color = { backgroundColor: params.color, textColor: '#ffffff' };
            const label = await gmail(token, '/labels', { method: 'POST', body });
            return jsonResult({ created: true, labelId: label.id, name: label.name });
          }

          if (action === 'delete') {
            if (!params.labelId) return errorResult('labelId is required for delete');
            await gmail(token, `/labels/${params.labelId}`, { method: 'DELETE' });
            return jsonResult({ deleted: true, labelId: params.labelId });
          }

          // List
          const data = await gmail(token, '/labels');
          const labels = (data.labels || []).map((l: any) => ({
            id: l.id, name: l.name, type: l.type,
            messagesTotal: l.messagesTotal, messagesUnread: l.messagesUnread,
            threadsTotal: l.threadsTotal, threadsUnread: l.threadsUnread,
            color: l.color?.backgroundColor,
          }));
          const system = labels.filter((l: any) => l.type === 'system');
          const user = labels.filter((l: any) => l.type === 'user');
          return jsonResult({ labels: [...system, ...user], systemCount: system.length, userCount: user.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Drafts ────────────────────────────────────────
    {
      name: 'gmail_drafts',
      description: 'List, create, update, send, or delete email drafts.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          action: { type: 'string', description: '"list" (default), "create", "update", "send", or "delete"' },
          draftId: { type: 'string', description: 'Draft ID (for update/send/delete)' },
          to: { type: 'string', description: 'Recipient (for create/update)' },
          subject: { type: 'string', description: 'Subject (for create/update)' },
          body: { type: 'string', description: 'Body text (for create/update)' },
          html: { type: 'string', description: 'HTML body (for create/update)' },
          cc: { type: 'string', description: 'CC recipients (for create/update)' },
          attachment_paths: { type: 'string', description: 'JSON array of file paths to attach (for create/update)' },
          maxResults: { type: 'number', description: 'Max drafts to list (default: 20)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const action = params.action || 'list';
          const email = tp.getEmail();

          if (action === 'create' || action === 'update') {
            if (!params.to || !params.subject) return errorResult('to and subject required');
            const draftAttachments = await resolveAttachments(params);
            const raw = buildRawEmail({
              from: email, to: params.to, cc: params.cc,
              subject: params.subject, body: params.body || '', html: params.html,
              attachments: draftAttachments,
            });
            const draftBody = { message: { raw: encodeBase64Url(raw) } };

            if (action === 'update' && params.draftId) {
              const result = await gmail(token, `/drafts/${params.draftId}`, { method: 'PUT', body: draftBody });
              return jsonResult({ updated: true, draftId: result.id });
            }
            const result = await gmail(token, '/drafts', { method: 'POST', body: draftBody });
            return jsonResult({ created: true, draftId: result.id, messageId: result.message?.id });
          }

          if (action === 'send') {
            if (!params.draftId) return errorResult('draftId required for send');
            const result = await gmail(token, '/drafts/send', { method: 'POST', body: { id: params.draftId } });
            return jsonResult({ sent: true, messageId: result.id, threadId: result.threadId });
          }

          if (action === 'delete') {
            if (!params.draftId) return errorResult('draftId required');
            await gmail(token, `/drafts/${params.draftId}`, { method: 'DELETE' });
            return jsonResult({ deleted: true, draftId: params.draftId });
          }

          // List drafts
          const data = await gmail(token, '/drafts', { query: { maxResults: String(params.maxResults || 20) } });
          const drafts = (data.drafts || []).map((d: any) => ({
            draftId: d.id, messageId: d.message?.id, threadId: d.message?.threadId,
          }));
          return jsonResult({ drafts, count: drafts.length, nextPageToken: data.nextPageToken });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Get Attachment ────────────────────────────────
    {
      name: 'gmail_attachment',
      description: 'Download an email attachment. Returns base64-encoded data.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          messageId: { type: 'string', description: 'Message ID (required)' },
          attachmentId: { type: 'string', description: 'Attachment ID from gmail_read results (required)' },
        },
        required: ['messageId', 'attachmentId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await gmail(token, `/messages/${params.messageId}/attachments/${params.attachmentId}`);
          return jsonResult({
            attachmentId: params.attachmentId,
            size: data.size,
            data: data.data, // base64url encoded
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Profile / Quota ───────────────────────────────
    {
      name: 'gmail_profile',
      description: 'Get the agent\'s Gmail profile: email address, total messages, threads count, and history ID.',
      category: 'utility' as const,
      parameters: { type: 'object' as const, properties: {}, required: [] },
      async execute(_id: string) {
        try {
          const token = await tp.getAccessToken();
          const profile = await gmail(token, '/profile');
          return jsonResult({
            emailAddress: profile.emailAddress,
            messagesTotal: profile.messagesTotal,
            threadsTotal: profile.threadsTotal,
            historyId: profile.historyId,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Vacation / Auto-Reply ─────────────────────────
    {
      name: 'gmail_vacation',
      description: 'Get or set vacation/auto-reply settings.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          action: { type: 'string', description: '"get" (default) or "set"' },
          enabled: { type: 'string', description: '"true" or "false" (for set)' },
          subject: { type: 'string', description: 'Auto-reply subject (for set)' },
          body: { type: 'string', description: 'Auto-reply message body (for set)' },
          startTime: { type: 'string', description: 'Start date (ISO 8601, for set)' },
          endTime: { type: 'string', description: 'End date (ISO 8601, for set)' },
          restrictToContacts: { type: 'string', description: '"true" to only reply to contacts (for set)' },
          restrictToDomain: { type: 'string', description: '"true" to only reply to same domain (for set)' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          if ((params.action || 'get') === 'get') {
            const data = await gmail(token, '/settings/vacation');
            return jsonResult(data);
          }
          // Set vacation
          const body: any = {
            enableAutoReply: params.enabled === 'true',
            responseSubject: params.subject || '',
            responseBodyPlainText: params.body || '',
            restrictToContacts: params.restrictToContacts === 'true',
            restrictToDomain: params.restrictToDomain === 'true',
          };
          if (params.startTime) body.startTime = new Date(params.startTime).getTime();
          if (params.endTime) body.endTime = new Date(params.endTime).getTime();
          const data = await gmail(token, '/settings/vacation', { method: 'PUT', body });
          return jsonResult({ updated: true, ...data });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Signature Management ────────────────────────────
    {
      name: 'gmail_get_signature',
      description: 'Get the current email signature for the primary send-as alias.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      async execute(_id: string) {
        try {
          const token = await tp.getAccessToken();
          // Get send-as settings for the primary email
          const sendAs = await gmail(token, '/settings/sendAs');
          const primary = sendAs.sendAs?.find((s: any) => s.isPrimary) || sendAs.sendAs?.[0];
          if (!primary) return errorResult('No primary send-as alias found');
          return jsonResult({
            email: primary.sendAsEmail,
            displayName: primary.displayName,
            signature: primary.signature || '(no signature set)',
            isDefault: primary.isDefault,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'gmail_set_signature',
      description: 'Set or update the email signature for the primary send-as alias. Accepts HTML for rich signatures with images, links, and formatting.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          signature: { type: 'string', description: 'HTML signature content. Use HTML tags for formatting: <b>bold</b>, <a href="...">links</a>, <img src="..."> for logos, <br> for line breaks, <table> for layout.' },
          displayName: { type: 'string', description: 'Display name for the send-as alias (optional)' },
        },
        required: ['signature'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          // Get primary send-as email
          const sendAs = await gmail(token, '/settings/sendAs');
          const primary = sendAs.sendAs?.find((s: any) => s.isPrimary) || sendAs.sendAs?.[0];
          if (!primary) return errorResult('No primary send-as alias found');

          const update: any = { signature: params.signature };
          if (params.displayName) update.displayName = params.displayName;

          const result = await gmail(token, `/settings/sendAs/${encodeURIComponent(primary.sendAsEmail)}`, {
            method: 'PATCH',
            body: update,
          });
          return jsonResult({ updated: true, email: primary.sendAsEmail, signatureLength: params.signature.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
