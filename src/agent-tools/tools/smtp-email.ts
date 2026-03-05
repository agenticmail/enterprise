/**
 * SMTP/IMAP Email Tools
 *
 * Generic email tools that work with any email provider via SMTP (sending)
 * and IMAP (reading). Used when agent has SMTP credentials configured
 * instead of Google/Microsoft OAuth.
 */

import { createTransport } from 'nodemailer';
import { ImapFlow } from 'imapflow';
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
    auth: { user: ec.smtpUser || ec.imapUser || ec.email, pass },
    logger: false,
  };
}

async function withImap<T>(ctx: ToolContext, fn: (client: any) => Promise<T>): Promise<T> {
  const config = getImapConfig(ctx);
  const client = new ImapFlow({ ...config, socketTimeout: 30000, greetingTimeout: 15000 });
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
  const { to, cc, bcc, subject, body, html, replyTo } = params;
  if (!to) return { error: 'Missing required parameter: to' };
  if (!subject && !body) return { error: 'Must provide subject or body' };

  const transport = createTransport(getSmtpConfig(ctx));
  const from = ctx.emailConfig?.email || ctx.emailConfig?.smtpUser;

  const info = await transport.sendMail({
    from,
    to,
    cc,
    bcc,
    subject: subject || '(no subject)',
    text: body,
    html,
    replyTo,
  });

  return { result: { messageId: info.messageId, to, subject, status: 'sent' } };
}

async function emailReply(ctx: ToolContext, params: any): Promise<ToolResult> {
  const { uid, folder, body, html, all } = params;
  if (!uid) return { error: 'Missing required parameter: uid (email UID to reply to)' };

  // Fetch the original message to get headers
  const original = await withImap(ctx, async (client) => {
    const lock = await client.getMailboxLock(folder || 'INBOX');
    try {
      const msg = await client.fetchOne(String(uid), { envelope: true, uid: true });
      return msg?.envelope;
    } finally {
      lock.release();
    }
  });

  if (!original) return { error: `Email UID ${uid} not found` };

  const transport = createTransport(getSmtpConfig(ctx));
  const from = ctx.emailConfig?.email || ctx.emailConfig?.smtpUser;
  const replyTo = all
    ? [...(original.from || []), ...(original.to || []), ...(original.cc || [])].map((a: any) => a.address).filter((a: string) => a !== from)
    : (original.replyTo || original.from || []).map((a: any) => a.address);

  const info = await transport.sendMail({
    from,
    to: replyTo.join(', '),
    subject: original.subject?.startsWith('Re:') ? original.subject : `Re: ${original.subject || ''}`,
    text: body,
    html,
    inReplyTo: original.messageId,
    references: original.messageId,
  });

  return { result: { messageId: info.messageId, to: replyTo, subject: `Re: ${original.subject}`, status: 'sent' } };
}

async function emailForward(ctx: ToolContext, params: any): Promise<ToolResult> {
  const { uid, to, folder, comment } = params;
  if (!uid || !to) return { error: 'Missing required parameters: uid, to' };

  const original = await withImap(ctx, async (client) => {
    const lock = await client.getMailboxLock(folder || 'INBOX');
    try {
      const msg = await client.fetchOne(String(uid), { envelope: true, source: true, uid: true });
      return msg;
    } finally {
      lock.release();
    }
  });

  if (!original) return { error: `Email UID ${uid} not found` };

  const transport = createTransport(getSmtpConfig(ctx));
  const from = ctx.emailConfig?.email || ctx.emailConfig?.smtpUser;
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
      for await (const msg of client.fetch(recentUids.map(String), { envelope: true, uid: true, flags: true })) {
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
      const msg = await client.fetchOne(String(uid), {
        envelope: true, uid: true, flags: true,
        bodyStructure: true, source: { maxBytes: 500000 },
      });

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
      for await (const msg of client.fetch(recentUids.map(String), { envelope: true, uid: true, flags: true })) {
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
