/**
 * SMTP/IMAP Email Tools
 *
 * Generic email tools that work with any email provider via SMTP (sending)
 * and IMAP (reading). Used when agent has SMTP credentials configured
 * instead of Google/Microsoft OAuth.
 */

import { createTransport } from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { readFileSync } from 'node:fs';
// Minimal types — no external dependency
interface ToolContext {
  emailConfig?: {
    email?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    imapHost?: string;
    imapPort?: number;
    imapUser?: string;
    imapPass?: string;
  };
}

interface ToolResult {
  result?: any;
  error?: string;
}

// ─── Helpers ────────────────────────────────────────────

function getSmtpConfig(ctx: ToolContext) {
  const ec = ctx.emailConfig as any;
  if (!ec?.smtpHost) throw new Error('SMTP not configured. Set up email credentials in agent settings.');
  const pass = ec.smtpPass || ec.password;
  if (!pass) throw new Error('No password configured. Set email password in agent email settings.');
  return {
    host: ec.smtpHost,
    port: ec.smtpPort || 587,
    secure: (ec.smtpPort || 587) === 465,
    auth: { user: ec.smtpUser || ec.email, pass },
  };
}

function getImapConfig(ctx: ToolContext) {
  const ec = ctx.emailConfig;
  if (!ec?.imapHost && !ec?.smtpHost) throw new Error('IMAP not configured. Set up email credentials in agent settings.');
  // Auto-derive IMAP from SMTP if not explicitly set
  const smtpHost = ec.smtpHost || '';
  let imapHost = ec.imapHost;
  if (!imapHost) {
    // Common SMTP → IMAP mappings
    if (smtpHost.includes('smtp.gmail')) imapHost = 'imap.gmail.com';
    else if (smtpHost.includes('smtp.office365') || smtpHost.includes('smtp.outlook')) imapHost = 'outlook.office365.com';
    else if (smtpHost.includes('smtp.yahoo')) imapHost = 'imap.mail.yahoo.com';
    else imapHost = smtpHost.replace('smtp.', 'imap.');
  }
  const pass = (ec as any).smtpPass || (ec as any).imapPass || (ec as any).password;
  if (!pass) throw new Error('No password configured. Set email password in agent email settings.');
  return {
    host: imapHost,
    port: ec.imapPort || 993,
    secure: true,
    auth: { user: (ec as any).smtpUser || (ec as any).imapUser || ec.email || '', pass },
    logger: false,
  };
}

async function withImap<T>(ctx: ToolContext, fn: (client: any) => Promise<T>): Promise<T> {
  const config = getImapConfig(ctx);
  const client = new ImapFlow({ ...config, socketTimeout: 30000, greetingTimeout: 15000 } as any);
  // Suppress uncaught errors from socket timeouts
  client.on('error', (err: any) => {
    console.warn(`[smtp-email] IMAP error (suppressed): ${err.message}`);
  });
  try {
    await client.connect();
    return await fn(client);
  } finally {
    try { await client.logout(); } catch {}
    try { client.close(); } catch {}
  }
}

// ─── HTML / attachment helpers ──────────────────────────
//
// The hard problem agents hit with rich HTML email: a message with
// inline images is huge when the images are base64 `data:` URIs
// embedded directly in the HTML (an 800KB email is common). Passing
// that as a single tool-call string parameter blows past the LLM's
// per-argument size limit, so the send never makes it to SMTP.
//
// The industry-standard fix (how Outlook, Gmail, Mailchimp, etc. embed
// images WITHOUT external hosting) is `multipart/related` with `cid:`
// references: the HTML body stays tiny (it just references `cid:xxx`),
// and each image rides along as a related MIME part. We do two things:
//
//   1. File-based body input (`htmlPath`/`textPath`) so the agent can
//      write arbitrarily large HTML to disk with the `write` tool and
//      hand us a path — no parameter-size ceiling at all.
//   2. Auto-hoist: scan the HTML for `data:<mime>;base64,…` URIs, pull
//      each out into a `cid:` inline attachment, and rewrite the
//      `src`/`url()` to point at the cid. The agent keeps authoring
//      natural data-URI HTML; we transparently turn it into a proper
//      multipart/related message with a small body.

const MAX_EMBED_BYTES = 25 * 1024 * 1024; // SMTP providers (Gmail) cap ~25MB/message

interface InlineAtt { cid: string; filename: string; content: Buffer; contentType: string; }

/**
 * Pull every `data:<mime>;base64,…` URI out of the HTML, replace it
 * with a `cid:` reference, and return the extracted inline attachments.
 * Matches both `src="data:…"` / `src='data:…'` and CSS `url(data:…)`.
 */
function hoistDataUris(html: string): { html: string; inline: InlineAtt[] } {
  const inline: InlineAtt[] = [];
  const seen = new Map<string, string>(); // dedupe identical images → one part
  let n = 0;
  const re = /(["'(])\s*data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+?)\s*(["')])/gi;
  const out = html.replace(re, (_m, open: string, mime: string, b64: string, close: string) => {
    const clean = b64.replace(/\s+/g, '');
    let cid = seen.get(clean);
    if (!cid) {
      n += 1;
      cid = `img${n}.${Date.now().toString(36)}@agenticmail`;
      const ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
      inline.push({ cid, filename: `image${n}.${ext}`, content: Buffer.from(clean, 'base64'), contentType: mime });
      seen.set(clean, cid);
    }
    return `${open}cid:${cid}${close}`;
  });
  return { html: out, inline };
}

/** Normalize agent-supplied attachments (file path OR inline content). */
function normalizeAttachments(list: any): any[] {
  if (!Array.isArray(list)) return [];
  return list.map((a: any) => {
    const att: any = {};
    if (a.filename) att.filename = a.filename;
    if (a.contentType) att.contentType = a.contentType;
    if (a.cid) att.cid = a.cid; // presence of cid ⇒ inline (multipart/related)
    if (a.path) {
      att.path = a.path; // nodemailer streams it from disk — no base64 in the tool call
    } else if (typeof a.content === 'string') {
      att.content = a.encoding === 'base64' ? Buffer.from(a.content, 'base64') : a.content;
      if (a.encoding === 'base64') att.encoding = undefined;
    }
    return att;
  }).filter((a: any) => a.path || a.content);
}

/**
 * Resolve the final { text, html, attachments } for a send/reply,
 * applying file-based input, data-URI hoisting, and explicit
 * attachments/inlineImages. Reusable across send + reply.
 */
function buildMailContent(params: any): { text?: string; html?: string; attachments: any[] } {
  let text: string | undefined = params.body ?? params.text;
  let html: string | undefined = params.html;

  // File-based body input — bypasses the tool-call parameter size limit.
  if (params.htmlPath) html = readFileSync(params.htmlPath, 'utf-8');
  if (params.textPath) text = readFileSync(params.textPath, 'utf-8');

  const attachments: any[] = [];

  // Explicit inline images: [{ path|content, cid, filename, contentType }]
  for (const img of normalizeAttachments(params.inlineImages)) {
    if (!img.cid) img.cid = `inline${attachments.length + 1}@agenticmail`;
    attachments.push(img);
  }

  // Auto-hoist data: URIs from the HTML into cid: inline parts.
  if (html && html.includes('data:')) {
    const hoisted = hoistDataUris(html);
    html = hoisted.html;
    for (const part of hoisted.inline) {
      attachments.push({ cid: part.cid, filename: part.filename, content: part.content, contentType: part.contentType });
    }
  }

  // Regular (non-inline) attachments.
  for (const att of normalizeAttachments(params.attachments)) attachments.push(att);

  // Guard against exceeding provider message-size caps.
  const total = attachments.reduce((sum, a) => sum + (a.content ? Buffer.byteLength(a.content) : 0), 0);
  if (total > MAX_EMBED_BYTES) {
    throw new Error(`Embedded content is ${(total / 1024 / 1024).toFixed(1)}MB, over the ~25MB SMTP limit. Reduce image sizes or send fewer images.`);
  }

  return { text, html, attachments };
}

function formatAddress(addr: any): string {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  if (addr.name) return `${addr.name} <${addr.address}>`;
  return addr.address || '';
}

function formatAddressList(list: any): string {
  if (!list) return '';
  if (Array.isArray(list)) return list.map(formatAddress).join(', ');
  return formatAddress(list);
}

// ─── Tool Implementations ───────────────────────────────

async function emailSend(ctx: ToolContext, params: any): Promise<ToolResult> {
  const { to, cc, bcc, subject, replyTo } = params;
  if (!to) return { error: 'Missing required parameter: to' };

  const { text, html, attachments } = buildMailContent(params);
  if (!subject && !text && !html) return { error: 'Must provide subject or body (body/html/htmlPath/textPath)' };

  const transport = createTransport(getSmtpConfig(ctx));
  const from = (ctx.emailConfig as any)?.sendAsAlias || ctx.emailConfig?.email || ctx.emailConfig?.smtpUser;

  const info = await transport.sendMail({
    from,
    to,
    cc,
    bcc,
    subject: subject || '(no subject)',
    text,
    html,
    replyTo,
    attachments: attachments.length ? attachments : undefined,
  });

  const inlineCount = attachments.filter((a) => a.cid).length;
  return {
    result: {
      messageId: info.messageId, to, subject, status: 'sent',
      attachments: attachments.length,
      inlineImages: inlineCount,
      htmlBytes: html ? Buffer.byteLength(html) : 0,
    },
  };
}

async function emailReply(ctx: ToolContext, params: any): Promise<ToolResult> {
  const { uid, folder, all } = params;
  if (!uid) return { error: 'Missing required parameter: uid (email UID to reply to)' };
  // Same rich-content pipeline as send: file-based body, data-URI
  // hoisting → cid inline images, explicit attachments.
  const { text, html, attachments } = buildMailContent(params);

  // Fetch the original message to get headers
  const original = await withImap(ctx, async (client) => {
    const lock = await client.getMailboxLock(folder || 'INBOX');
    try {
      const msg = await client.fetchOne(String(uid), { envelope: true }, { uid: true });
      return msg?.envelope;
    } finally {
      lock.release();
    }
  });

  if (!original) return { error: `Email UID ${uid} not found` };

  const transport = createTransport(getSmtpConfig(ctx));
  const from = (ctx.emailConfig as any)?.sendAsAlias || ctx.emailConfig?.email || ctx.emailConfig?.smtpUser;
  const replyTo = all
    ? [...(original.from || []), ...(original.to || []), ...(original.cc || [])].map((a: any) => a.address).filter((a: string) => a !== from)
    : (original.replyTo || original.from || []).map((a: any) => a.address);

  const info = await transport.sendMail({
    from,
    to: replyTo.join(', '),
    subject: original.subject?.startsWith('Re:') ? original.subject : `Re: ${original.subject || ''}`,
    text,
    html,
    inReplyTo: original.messageId,
    references: original.messageId,
    attachments: attachments.length ? attachments : undefined,
  });

  return {
    result: {
      messageId: info.messageId, to: replyTo, subject: `Re: ${original.subject}`, status: 'sent',
      attachments: attachments.length, inlineImages: attachments.filter((a) => a.cid).length,
    },
  };
}

async function emailForward(ctx: ToolContext, params: any): Promise<ToolResult> {
  const { uid, to, folder, comment } = params;
  if (!uid || !to) return { error: 'Missing required parameters: uid, to' };

  const original = await withImap(ctx, async (client) => {
    const lock = await client.getMailboxLock(folder || 'INBOX');
    try {
      const msg = await client.fetchOne(String(uid), { envelope: true, source: true }, { uid: true });
      return msg;
    } finally {
      lock.release();
    }
  });

  if (!original) return { error: `Email UID ${uid} not found` };

  const transport = createTransport(getSmtpConfig(ctx));
  const from = (ctx.emailConfig as any)?.sendAsAlias || ctx.emailConfig?.email || ctx.emailConfig?.smtpUser;
  const origSubject = original.envelope?.subject || '';

  const body = comment
    ? `${comment}\n\n---------- Forwarded message ----------\n${original.source?.toString() || '(no content)'}`
    : `---------- Forwarded message ----------\n${original.source?.toString() || '(no content)'}`;

  const info = await transport.sendMail({
    from,
    to,
    subject: origSubject.startsWith('Fwd:') ? origSubject : `Fwd: ${origSubject}`,
    text: body,
  });

  return { result: { messageId: info.messageId, to, subject: `Fwd: ${origSubject}`, status: 'forwarded' } };
}

async function emailSearch(ctx: ToolContext, params: any): Promise<ToolResult> {
  const { query, from, to, subject, since, before, folder, limit } = params;
  const maxResults = Math.min(limit || 20, 50);

  return withImap(ctx, async (client) => {
    const lock = await client.getMailboxLock(folder || 'INBOX');
    try {
      const searchQuery: any = {};
      if (query) searchQuery.body = query;
      if (from) searchQuery.from = from;
      if (to) searchQuery.to = to;
      if (subject) searchQuery.subject = subject;
      if (since) searchQuery.since = new Date(since);
      if (before) searchQuery.before = new Date(before);
      if (Object.keys(searchQuery).length === 0) searchQuery.all = true;

      const uids = await client.search(searchQuery, { uid: true });
      const recentUids = uids.slice(-maxResults).reverse();

      if (recentUids.length === 0) return { result: { messages: [], total: 0 } };

      const messages: any[] = [];
      for await (const msg of client.fetch({ uid: recentUids.map(String) }, { envelope: true, uid: true, flags: true })) {
        messages.push({
          uid: msg.uid,
          from: formatAddressList(msg.envelope?.from),
          to: formatAddressList(msg.envelope?.to),
          subject: msg.envelope?.subject || '(no subject)',
          date: msg.envelope?.date?.toISOString(),
          flags: [...(msg.flags || [])],
          read: msg.flags?.has('\\Seen'),
        });
      }

      return { result: { messages, total: uids.length, showing: messages.length } };
    } finally {
      lock.release();
    }
  });
}

async function emailRead(ctx: ToolContext, params: any): Promise<ToolResult> {
  const { uid, folder, markRead } = params;
  if (!uid) return { error: 'Missing required parameter: uid' };

  return withImap(ctx, async (client) => {
    const lock = await client.getMailboxLock(folder || 'INBOX');
    try {
      // source: true gives the full RFC822 source. Earlier we passed
      // `source: { maxBytes: 500000 }` which imapflow 1.3.x rejects
      // with a generic "Command failed" error.
      const msg = await client.fetchOne(String(uid), {
        envelope: true, flags: true,
        bodyStructure: true, source: true,
      }, { uid: true });

      if (!msg) return { error: `Email UID ${uid} not found` };

      // Extract text content from source
      let textBody = '';
      if (msg.source) {
        const raw = msg.source.toString();
        // Simple text extraction — find text/plain part
        const textMatch = raw.match(/Content-Type: text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\.\r\n|$)/i);
        if (textMatch) textBody = textMatch[1].trim();
        else textBody = raw.slice(raw.indexOf('\r\n\r\n') + 4).trim().slice(0, 2000);
      }

      if (markRead !== false) {
        try { await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }); } catch {}
      }

      return {
        result: {
          uid: msg.uid,
          from: formatAddressList(msg.envelope?.from),
          to: formatAddressList(msg.envelope?.to),
          cc: formatAddressList(msg.envelope?.cc),
          subject: msg.envelope?.subject || '(no subject)',
          date: msg.envelope?.date?.toISOString(),
          messageId: msg.envelope?.messageId,
          body: textBody,
          flags: [...(msg.flags || [])],
        }
      };
    } finally {
      lock.release();
    }
  });
}

async function emailList(ctx: ToolContext, params: any): Promise<ToolResult> {
  const { folder, limit, unreadOnly } = params;
  const maxResults = Math.min(limit || 20, 50);

  return withImap(ctx, async (client) => {
    const lock = await client.getMailboxLock(folder || 'INBOX');
    try {
      const searchQuery = unreadOnly ? { unseen: true } : { all: true };
      const uids = await client.search(searchQuery, { uid: true });
      const recentUids = uids.slice(-maxResults).reverse();

      if (recentUids.length === 0) return { result: { messages: [], total: 0 } };

      const messages: any[] = [];
      for await (const msg of client.fetch({ uid: recentUids.map(String) }, { envelope: true, uid: true, flags: true })) {
        messages.push({
          uid: msg.uid,
          from: formatAddressList(msg.envelope?.from),
          subject: msg.envelope?.subject || '(no subject)',
          date: msg.envelope?.date?.toISOString(),
          read: msg.flags?.has('\\Seen'),
        });
      }

      return { result: { messages, total: uids.length, showing: messages.length } };
    } finally {
      lock.release();
    }
  });
}

async function emailFolders(ctx: ToolContext, _params: any): Promise<ToolResult> {
  return withImap(ctx, async (client) => {
    const folders = await client.list();
    const result = folders.map((f: any) => ({
      path: f.path,
      name: f.name,
      specialUse: f.specialUse || null,
    }));
    return { result: { folders: result } };
  });
}

async function emailMove(ctx: ToolContext, params: any): Promise<ToolResult> {
  const { uid, from, to } = params;
  if (!uid || !to) return { error: 'Missing required parameters: uid, to (destination folder)' };

  return withImap(ctx, async (client) => {
    const lock = await client.getMailboxLock(from || 'INBOX');
    try {
      await client.messageMove(String(uid), to, { uid: true });
      return { result: { uid, movedTo: to, status: 'moved' } };
    } finally {
      lock.release();
    }
  });
}

async function emailDelete(ctx: ToolContext, params: any): Promise<ToolResult> {
  const { uid, folder, permanent } = params;
  if (!uid) return { error: 'Missing required parameter: uid' };

  return withImap(ctx, async (client) => {
    const lock = await client.getMailboxLock(folder || 'INBOX');
    try {
      if (permanent) {
        await client.messageFlagsAdd(String(uid), ['\\Deleted'], { uid: true });
        await client.messageDelete(String(uid), { uid: true });
      } else {
        await client.messageMove(String(uid), 'Trash', { uid: true });
      }
      return { result: { uid, status: permanent ? 'deleted' : 'trashed' } };
    } finally {
      lock.release();
    }
  });
}

async function emailMarkRead(ctx: ToolContext, params: any): Promise<ToolResult> {
  const { uid, folder, unread } = params;
  if (!uid) return { error: 'Missing required parameter: uid' };

  return withImap(ctx, async (client) => {
    const lock = await client.getMailboxLock(folder || 'INBOX');
    try {
      if (unread) {
        await client.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true });
      } else {
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      }
      return { result: { uid, status: unread ? 'marked_unread' : 'marked_read' } };
    } finally {
      lock.release();
    }
  });
}

// ─── Tool Registry ──────────────────────────────────────

const TOOL_MAP: Record<string, (ctx: ToolContext, params: any) => Promise<ToolResult>> = {
  email_send: emailSend,
  email_reply: emailReply,
  email_forward: emailForward,
  email_search: emailSearch,
  email_read: emailRead,
  email_list: emailList,
  email_folders: emailFolders,
  email_move: emailMove,
  email_delete: emailDelete,
  email_mark_read: emailMarkRead,
};

export function getSmtpEmailTools() {
  return Object.keys(TOOL_MAP);
}

export async function executeSmtpEmailTool(toolId: string, ctx: ToolContext, params: any): Promise<ToolResult> {
  const handler = TOOL_MAP[toolId];
  if (!handler) return { error: `Unknown SMTP email tool: ${toolId}` };
  
  try {
    return await handler(ctx, params);
  } catch (e: any) {
    const msg = e.message || String(e);
    // Friendly error messages
    if (msg.includes('AUTHENTICATIONFAILED') || msg.includes('Invalid credentials')) {
      return { error: 'Email authentication failed. Check your email/password in agent settings. For Gmail, you need an App Password (not regular password).' };
    }
    if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
      return { error: `Cannot connect to email server: ${msg}. Check SMTP/IMAP host settings.` };
    }
    return { error: msg };
  }
}
