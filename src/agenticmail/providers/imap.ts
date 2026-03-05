/**
 * IMAP/SMTP Email Provider
 *
 * The simplest and most universal email provider.
 * Works with ANY email system that supports IMAP + SMTP.
 *
 * How it works in practice:
 *   1. IT admin creates agent-sales@company.com in Microsoft 365 / Google Workspace / Exchange / etc.
 *   2. Creates an app password (or uses the regular password if MFA isn't enforced)
 *   3. In the enterprise dashboard, enters: email + password + IMAP host + SMTP host
 *   4. Agent connects just like Outlook or Thunderbird would
 *
 * This is the "just works" path. No OAuth apps to register,
 * no consent flows, no token refresh. Just email + password.
 *
 * For Microsoft 365: IMAP host = outlook.office365.com, SMTP host = smtp.office365.com
 * For Google Workspace: IMAP host = imap.gmail.com, SMTP host = smtp.gmail.com (needs app password)
 * For self-hosted Exchange: whatever your IT gives you
 */

import type {
  IEmailProvider, AgentEmailIdentity, EmailProvider,
  EmailMessage, EmailEnvelope, EmailFolder,
  SendEmailOptions, SearchCriteria,
} from '../types.js';

// ─── Extended identity for IMAP (includes server details) ────────────

export interface ImapEmailIdentity extends AgentEmailIdentity {
  /** IMAP server hostname */
  imapHost: string;
  /** IMAP port (default 993) */
  imapPort?: number;
  /** SMTP server hostname */
  smtpHost: string;
  /** SMTP port (default 587) */
  smtpPort?: number;
  /** Password or app password (stored in accessToken field for compatibility) */
  password?: string;
}

// ─── Well-known server presets ───────────────────────────────────────

export const IMAP_PRESETS: Record<string, { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number }> = {
  'microsoft365': { imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587 },
  'office365': { imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587 },
  'outlook': { imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587 },
  'gmail': { imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 587 },
  'google': { imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 587 },
  'yahoo': { imapHost: 'imap.mail.yahoo.com', imapPort: 993, smtpHost: 'smtp.mail.yahoo.com', smtpPort: 465 },
  'zoho': { imapHost: 'imap.zoho.com', imapPort: 993, smtpHost: 'smtp.zoho.com', smtpPort: 587 },
  'fastmail': { imapHost: 'imap.fastmail.com', imapPort: 993, smtpHost: 'smtp.fastmail.com', smtpPort: 587 },
  'icloud': { imapHost: 'imap.mail.me.com', imapPort: 993, smtpHost: 'smtp.mail.me.com', smtpPort: 587 },
};

/**
 * Detect IMAP/SMTP settings from an email domain.
 * Returns preset if known, otherwise guesses based on domain.
 */
export function detectImapSettings(email: string): { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number } | null {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  // Check presets
  for (const [key, _preset] of Object.entries(IMAP_PRESETS)) {
    if (domain.includes(key) || domain === 'gmail.com' || domain === 'outlook.com' || domain === 'hotmail.com') {
      if (domain === 'gmail.com' || domain.endsWith('.google.com')) return IMAP_PRESETS.gmail;
      if (domain === 'outlook.com' || domain === 'hotmail.com' || domain.endsWith('.onmicrosoft.com')) return IMAP_PRESETS.microsoft365;
    }
  }

  // For custom domains, try common patterns
  // Many companies using M365 will have outlook.office365.com
  // but we can't know for sure, so return null and let the admin specify
  return null;
}

// ─── IMAP Provider ──────────────────────────────────────────────────

export class ImapEmailProvider implements IEmailProvider {
  readonly provider: EmailProvider = 'imap';
  private identity: ImapEmailIdentity | null = null;

  // IMAP connection (lazy-loaded to avoid bundling the dep if not used)
  private imapClient: any = null;
  private _smtpClient: any = null;

  private getIdentity(): ImapEmailIdentity {
    if (!this.identity) throw new Error('Not connected — call connect() first');
    return this.identity;
  }

  // ─── Connection ─────────────────────────────────────

  async connect(identity: AgentEmailIdentity): Promise<void> {
    const imapIdentity = identity as ImapEmailIdentity;

    // Validate required fields
    if (!imapIdentity.imapHost) throw new Error('IMAP host is required');
    if (!imapIdentity.smtpHost) throw new Error('SMTP host is required');

    this.identity = imapIdentity;

    // Try to load imapflow for IMAP connection
    try {
      const { ImapFlow } = await import('imapflow');
      this.imapClient = new ImapFlow({
        host: imapIdentity.imapHost,
        port: imapIdentity.imapPort || 993,
        secure: true,
        auth: {
          user: imapIdentity.email,
          pass: imapIdentity.password || imapIdentity.accessToken,
        },
        logger: false,
      });
      await this.imapClient.connect();
    } catch (err: any) {
      // If imapflow isn't installed, we'll use a fetch-based fallback for providers that support REST
      if (err.code === 'ERR_MODULE_NOT_FOUND' || err.message?.includes('Cannot find')) {
        console.warn('[imap-provider] imapflow not installed — IMAP operations will fail. Install with: npm install imapflow');
        this.imapClient = null;
      } else {
        throw new Error(`Failed to connect to IMAP server ${imapIdentity.imapHost}: ${err.message}`);
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.imapClient) {
      try { await this.imapClient.logout(); } catch {}
      this.imapClient = null;
    }
    this.identity = null;
  }

  // ─── List / Read ────────────────────────────────────

  async listMessages(folder: string, opts?: { limit?: number; offset?: number }): Promise<EmailEnvelope[]> {
    if (!this.imapClient) throw new Error('IMAP not connected. Ensure imapflow is installed and connection succeeded.');

    const limit = opts?.limit || 20;
    const lock = await this.imapClient.getMailboxLock(folder || 'INBOX');
    try {
      const envelopes: EmailEnvelope[] = [];
      const status = await this.imapClient.status(folder || 'INBOX', { messages: true });
      const total = status.messages || 0;
      const start = Math.max(1, total - (opts?.offset || 0) - limit + 1);
      const end = total - (opts?.offset || 0);

      if (start > end || end < 1) return [];

      for await (const msg of this.imapClient.fetch(`${start}:${end}`, { envelope: true, flags: true, bodyStructure: true })) {
        envelopes.push({
          uid: String(msg.uid),
          from: {
            name: msg.envelope?.from?.[0]?.name || undefined,
            email: msg.envelope?.from?.[0]?.address || '',
          },
          to: (msg.envelope?.to || []).map((t: any) => ({
            name: t.name || undefined,
            email: t.address || '',
          })),
          subject: msg.envelope?.subject || '',
          date: msg.envelope?.date?.toISOString() || '',
          read: msg.flags?.has('\\Seen') || false,
          flagged: msg.flags?.has('\\Flagged') || false,
          hasAttachments: msg.bodyStructure?.childNodes?.length > 1 || false,
        });
      }

      return envelopes.reverse(); // newest first
    } finally {
      lock.release();
    }
  }

  async readMessage(uid: string, folder?: string): Promise<EmailMessage> {
    if (!this.imapClient) throw new Error('IMAP not connected');

    const lock = await this.imapClient.getMailboxLock(folder || 'INBOX');
    try {
      const msg = await this.imapClient.fetchOne(uid, {
        envelope: true,
        flags: true,
        source: true, // full RFC822 message
      }, { uid: true });

      if (!msg) throw new Error(`Message ${uid} not found`);

      // Parse the raw email source
      const source = msg.source?.toString('utf-8') || '';
      const bodyMatch = source.match(/\r?\n\r?\n([\s\S]*)/);
      const body = bodyMatch ? bodyMatch[1] : '';

      return {
        uid: String(msg.uid),
        from: {
          name: msg.envelope?.from?.[0]?.name || undefined,
          email: msg.envelope?.from?.[0]?.address || '',
        },
        to: (msg.envelope?.to || []).map((t: any) => ({
          name: t.name || undefined,
          email: t.address || '',
        })),
        cc: (msg.envelope?.cc || []).map((c: any) => ({
          name: c.name || undefined,
          email: c.address || '',
        })),
        subject: msg.envelope?.subject || '',
        body,
        date: msg.envelope?.date?.toISOString() || '',
        read: msg.flags?.has('\\Seen') || false,
        flagged: msg.flags?.has('\\Flagged') || false,
        folder: folder || 'INBOX',
        messageId: msg.envelope?.messageId || undefined,
        inReplyTo: msg.envelope?.inReplyTo || undefined,
      };
    } finally {
      lock.release();
    }
  }

  async searchMessages(criteria: SearchCriteria): Promise<EmailEnvelope[]> {
    if (!this.imapClient) throw new Error('IMAP not connected');

    const lock = await this.imapClient.getMailboxLock('INBOX');
    try {
      const query: any = {};
      if (criteria.from) query.from = criteria.from;
      if (criteria.to) query.to = criteria.to;
      if (criteria.subject) query.subject = criteria.subject;
      if (criteria.text) query.body = criteria.text;
      if (criteria.since) query.since = new Date(criteria.since);
      if (criteria.before) query.before = new Date(criteria.before);
      if (criteria.seen === true) query.seen = true;
      if (criteria.seen === false) query.unseen = true;

      const uids = await this.imapClient.search(query, { uid: true });
      if (!uids.length) return [];

      const envelopes: EmailEnvelope[] = [];
      const uidRange = uids.slice(-50).join(','); // last 50 results

      for await (const msg of this.imapClient.fetch(uidRange, { envelope: true, flags: true }, { uid: true })) {
        envelopes.push({
          uid: String(msg.uid),
          from: {
            name: msg.envelope?.from?.[0]?.name || undefined,
            email: msg.envelope?.from?.[0]?.address || '',
          },
          to: (msg.envelope?.to || []).map((t: any) => ({
            name: t.name || undefined,
            email: t.address || '',
          })),
          subject: msg.envelope?.subject || '',
          date: msg.envelope?.date?.toISOString() || '',
          read: msg.flags?.has('\\Seen') || false,
          flagged: msg.flags?.has('\\Flagged') || false,
          hasAttachments: false,
        });
      }

      return envelopes.reverse();
    } finally {
      lock.release();
    }
  }

  async listFolders(): Promise<EmailFolder[]> {
    if (!this.imapClient) throw new Error('IMAP not connected');

    const folders: EmailFolder[] = [];
    const mailboxes = await this.imapClient.list();

    for (const mb of mailboxes) {
      try {
        const status = await this.imapClient.status(mb.path, { messages: true, unseen: true });
        folders.push({
          name: mb.name,
          path: mb.path,
          unread: status.unseen || 0,
          total: status.messages || 0,
        });
      } catch {
        folders.push({ name: mb.name, path: mb.path, unread: 0, total: 0 });
      }
    }

    return folders;
  }

  async createFolder(name: string): Promise<void> {
    if (!this.imapClient) throw new Error('IMAP not connected');
    await this.imapClient.mailboxCreate(name);
  }

  // ─── Send (via SMTP) ───────────────────────────────

  async send(options: SendEmailOptions): Promise<{ messageId: string }> {
    const identity = this.getIdentity();

    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: identity.smtpHost,
        port: identity.smtpPort || 587,
        secure: (identity.smtpPort || 587) === 465,
        auth: {
          user: identity.email,
          pass: identity.password || identity.accessToken,
        },
      });

      const result = await transporter.sendMail({
        from: identity.email,
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        text: options.body,
        html: options.html,
        inReplyTo: options.inReplyTo,
        references: options.references?.join(' '),
        attachments: options.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
          encoding: a.encoding as any,
        })),
      });

      return { messageId: result.messageId || `smtp-${Date.now()}` };
    } catch (err: any) {
      if (err.code === 'ERR_MODULE_NOT_FOUND' || err.message?.includes('Cannot find')) {
        throw new Error('nodemailer is required for SMTP sending. Install with: npm install nodemailer');
      }
      throw new Error(`SMTP send failed: ${err.message}`);
    }
  }

  async reply(uid: string, body: string, replyAll = false): Promise<{ messageId: string }> {
    const original = await this.readMessage(uid);
    const to = replyAll
      ? [original.from.email, ...(original.to || []).map(t => t.email), ...(original.cc || []).map(c => c.email)]
          .filter(e => e !== this.identity?.email)
          .join(', ')
      : original.from.email;

    return this.send({
      to,
      subject: original.subject.startsWith('Re:') ? original.subject : `Re: ${original.subject}`,
      body,
      inReplyTo: original.messageId,
      references: original.references
        ? [...original.references, original.messageId!]
        : original.messageId ? [original.messageId] : undefined,
    });
  }

  async forward(uid: string, to: string, body?: string): Promise<{ messageId: string }> {
    const original = await this.readMessage(uid);
    return this.send({
      to,
      subject: `Fwd: ${original.subject}`,
      body: (body ? body + '\n\n' : '') +
        `---------- Forwarded message ----------\n` +
        `From: ${original.from.email}\n` +
        `Date: ${original.date}\n` +
        `Subject: ${original.subject}\n\n` +
        original.body,
    });
  }

  // ─── Organize ───────────────────────────────────────

  async moveMessage(uid: string, toFolder: string, _fromFolder?: string): Promise<void> {
    if (!this.imapClient) throw new Error('IMAP not connected');
    const lock = await this.imapClient.getMailboxLock(_fromFolder || 'INBOX');
    try {
      await this.imapClient.messageMove(uid, toFolder, { uid: true });
    } finally {
      lock.release();
    }
  }

  async deleteMessage(uid: string, folder?: string): Promise<void> {
    if (!this.imapClient) throw new Error('IMAP not connected');
    const lock = await this.imapClient.getMailboxLock(folder || 'INBOX');
    try {
      await this.imapClient.messageDelete(uid, { uid: true });
    } finally {
      lock.release();
    }
  }

  async markRead(uid: string, folder?: string): Promise<void> {
    if (!this.imapClient) throw new Error('IMAP not connected');
    const lock = await this.imapClient.getMailboxLock(folder || 'INBOX');
    try {
      await this.imapClient.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
    } finally {
      lock.release();
    }
  }

  async markUnread(uid: string, folder?: string): Promise<void> {
    if (!this.imapClient) throw new Error('IMAP not connected');
    const lock = await this.imapClient.getMailboxLock(folder || 'INBOX');
    try {
      await this.imapClient.messageFlagsRemove(uid, ['\\Seen'], { uid: true });
    } finally {
      lock.release();
    }
  }

  async flagMessage(uid: string, folder?: string): Promise<void> {
    if (!this.imapClient) throw new Error('IMAP not connected');
    const lock = await this.imapClient.getMailboxLock(folder || 'INBOX');
    try {
      await this.imapClient.messageFlagsAdd(uid, ['\\Flagged'], { uid: true });
    } finally {
      lock.release();
    }
  }

  async unflagMessage(uid: string, folder?: string): Promise<void> {
    if (!this.imapClient) throw new Error('IMAP not connected');
    const lock = await this.imapClient.getMailboxLock(folder || 'INBOX');
    try {
      await this.imapClient.messageFlagsRemove(uid, ['\\Flagged'], { uid: true });
    } finally {
      lock.release();
    }
  }

  // ─── Batch ──────────────────────────────────────────

  async batchMarkRead(uids: string[], folder?: string): Promise<void> {
    for (const uid of uids) await this.markRead(uid, folder);
  }

  async batchMarkUnread(uids: string[], folder?: string): Promise<void> {
    for (const uid of uids) await this.markUnread(uid, folder);
  }

  async batchMove(uids: string[], toFolder: string, fromFolder?: string): Promise<void> {
    for (const uid of uids) await this.moveMessage(uid, toFolder, fromFolder);
  }

  async batchDelete(uids: string[], folder?: string): Promise<void> {
    for (const uid of uids) await this.deleteMessage(uid, folder);
  }
}
