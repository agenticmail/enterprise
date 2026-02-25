/**
 * Gmail API Email Provider
 *
 * Implements IEmailProvider using Gmail REST API.
 * Agent authenticates via org's Google Workspace OAuth.
 * Email address comes from the org directory.
 */

import type {
  IEmailProvider, AgentEmailIdentity, EmailProvider,
  EmailMessage, EmailEnvelope, EmailFolder,
  SendEmailOptions, SearchCriteria,
} from '../types.js';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1';

export class GoogleEmailProvider implements IEmailProvider {
  readonly provider: EmailProvider = 'google';
  private identity: AgentEmailIdentity | null = null;
  private userId = 'me';

  private get token(): string {
    if (!this.identity) throw new Error('Not connected');
    return this.identity.accessToken;
  }

  private async refreshIfNeeded(): Promise<void> {
    if (this.identity?.refreshToken) {
      this.identity.accessToken = await this.identity.refreshToken();
    }
  }

  private async gmailFetch(path: string, opts?: RequestInit): Promise<any> {
    await this.refreshIfNeeded();
    const res = await fetch(`${GMAIL_BASE}/users/${this.userId}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...opts?.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gmail API ${res.status}: ${text}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // ─── Connection ─────────────────────────────────────

  /** Last known historyId — used for efficient polling via history.list */
  public lastHistoryId: string = '';

  async connect(identity: AgentEmailIdentity): Promise<void> {
    this.identity = identity;
    // Validate token and capture historyId
    const profile = await this.gmailFetch('/profile');
    this.lastHistoryId = profile.historyId || '';
  }

  async disconnect(): Promise<void> {
    this.identity = null;
  }

  // ─── List / Read ────────────────────────────────────

  async listMessages(folder: string, opts?: { limit?: number; offset?: number }): Promise<EmailEnvelope[]> {
    const labelId = this.resolveLabelId(folder);
    const maxResults = opts?.limit || 20;
    const q = labelId === 'INBOX' ? '' : '';
    const data = await this.gmailFetch(`/messages?labelIds=${labelId}&maxResults=${maxResults}${q ? '&q=' + encodeURIComponent(q) : ''}`);

    if (!data.messages?.length) return [];

    // Batch fetch message metadata
    const envelopes: EmailEnvelope[] = [];
    let skipped = 0;
    for (const msg of data.messages) {
      try {
        const detail = await this.gmailFetch(`/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`);
        envelopes.push(this.metadataToEnvelope(detail));
      } catch (e: any) {
        skipped++;
        console.error(`[gmail] Failed to fetch metadata for ${msg.id}: ${e.message?.slice(0, 100)}`);
      }
    }
    if (skipped > 0) console.warn(`[gmail] Skipped ${skipped}/${data.messages.length} messages due to errors`);
    return envelopes;
  }

  async readMessage(uid: string): Promise<EmailMessage> {
    const data = await this.gmailFetch(`/messages/${uid}?format=full`);
    return this.fullToMessage(data);
  }

  async searchMessages(criteria: SearchCriteria): Promise<EmailEnvelope[]> {
    const parts: string[] = [];
    if (criteria.from) parts.push(`from:${criteria.from}`);
    if (criteria.to) parts.push(`to:${criteria.to}`);
    if (criteria.subject) parts.push(`subject:${criteria.subject}`);
    if (criteria.text) parts.push(criteria.text);
    if (criteria.since) parts.push(`after:${criteria.since.split('T')[0]}`);
    if (criteria.before) parts.push(`before:${criteria.before.split('T')[0]}`);
    if (criteria.seen === true) parts.push('is:read');
    if (criteria.seen === false) parts.push('is:unread');

    const q = parts.join(' ');
    const data = await this.gmailFetch(`/messages?q=${encodeURIComponent(q)}&maxResults=50`);

    if (!data.messages?.length) return [];

    const envelopes: EmailEnvelope[] = [];
    for (const msg of data.messages.slice(0, 20)) {
      try {
        const detail = await this.gmailFetch(`/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`);
        envelopes.push(this.metadataToEnvelope(detail));
      } catch { /* skip */ }
    }
    return envelopes;
  }

  async listFolders(): Promise<EmailFolder[]> {
    const data = await this.gmailFetch('/labels');
    return (data.labels || []).map((l: any) => ({
      name: l.name,
      path: l.id,
      unread: l.messagesUnread || 0,
      total: l.messagesTotal || 0,
    }));
  }

  async createFolder(name: string): Promise<void> {
    await this.gmailFetch('/labels', {
      method: 'POST',
      body: JSON.stringify({ name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }),
    });
  }

  // ─── Send ───────────────────────────────────────────

  async send(options: SendEmailOptions): Promise<{ messageId: string }> {
    const raw = this.buildRawEmail(options);
    const sendBody: any = { raw };
    // Include threadId to keep replies in the same Gmail thread
    if (options.threadId) sendBody.threadId = options.threadId;
    const data = await this.gmailFetch('/messages/send', {
      method: 'POST',
      body: JSON.stringify(sendBody),
    });
    return { messageId: data.id };
  }

  async reply(uid: string, body: string, replyAll = false): Promise<{ messageId: string }> {
    // Fetch original with threadId
    const originalData = await this.gmailFetch(`/messages/${uid}?format=full`);
    const original = this.fullToMessage(originalData);
    const threadId = originalData.threadId;

    const to = replyAll
      ? [original.from.email, ...(original.to || []).map(t => t.email), ...(original.cc || []).map(c => c.email)].filter(e => e !== this.identity?.email).join(', ')
      : original.from.email;

    return this.send({
      to,
      subject: original.subject.startsWith('Re:') ? original.subject : `Re: ${original.subject}`,
      body,
      inReplyTo: original.messageId,
      references: original.references ? [...original.references, original.messageId!] : [original.messageId!],
      threadId,
    });
  }

  async forward(uid: string, to: string, body?: string): Promise<{ messageId: string }> {
    const original = await this.readMessage(uid);
    return this.send({
      to,
      subject: `Fwd: ${original.subject}`,
      body: (body ? body + '\n\n' : '') + `---------- Forwarded message ----------\nFrom: ${original.from.email}\nDate: ${original.date}\nSubject: ${original.subject}\n\n${original.body}`,
    });
  }

  // ─── Organize ───────────────────────────────────────

  async moveMessage(uid: string, toFolder: string, fromFolder?: string): Promise<void> {
    const addLabel = this.resolveLabelId(toFolder);
    const removeLabel = fromFolder ? this.resolveLabelId(fromFolder) : 'INBOX';
    await this.gmailFetch(`/messages/${uid}/modify`, {
      method: 'POST',
      body: JSON.stringify({ addLabelIds: [addLabel], removeLabelIds: [removeLabel] }),
    });
  }

  async deleteMessage(uid: string): Promise<void> {
    await this.gmailFetch(`/messages/${uid}/trash`, { method: 'POST' });
  }

  async markRead(uid: string): Promise<void> {
    await this.gmailFetch(`/messages/${uid}/modify`, {
      method: 'POST',
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    });
  }

  async markUnread(uid: string): Promise<void> {
    await this.gmailFetch(`/messages/${uid}/modify`, {
      method: 'POST',
      body: JSON.stringify({ addLabelIds: ['UNREAD'] }),
    });
  }

  async flagMessage(uid: string): Promise<void> {
    await this.gmailFetch(`/messages/${uid}/modify`, {
      method: 'POST',
      body: JSON.stringify({ addLabelIds: ['STARRED'] }),
    });
  }

  async unflagMessage(uid: string): Promise<void> {
    await this.gmailFetch(`/messages/${uid}/modify`, {
      method: 'POST',
      body: JSON.stringify({ removeLabelIds: ['STARRED'] }),
    });
  }

  // ─── Batch ──────────────────────────────────────────

  async batchMarkRead(uids: string[]): Promise<void> {
    await this.gmailFetch('/messages/batchModify', {
      method: 'POST',
      body: JSON.stringify({ ids: uids, removeLabelIds: ['UNREAD'] }),
    });
  }

  async batchMarkUnread(uids: string[]): Promise<void> {
    await this.gmailFetch('/messages/batchModify', {
      method: 'POST',
      body: JSON.stringify({ ids: uids, addLabelIds: ['UNREAD'] }),
    });
  }

  async batchMove(uids: string[], toFolder: string, fromFolder?: string): Promise<void> {
    const addLabel = this.resolveLabelId(toFolder);
    const removeLabel = fromFolder ? this.resolveLabelId(fromFolder) : 'INBOX';
    await this.gmailFetch('/messages/batchModify', {
      method: 'POST',
      body: JSON.stringify({ ids: uids, addLabelIds: [addLabel], removeLabelIds: [removeLabel] }),
    });
  }

  async batchDelete(uids: string[]): Promise<void> {
    await Promise.all(uids.map(uid => this.deleteMessage(uid)));
  }

  // ─── Gmail Push Notifications ────────────────────────

  /**
   * Set up Gmail push notifications via Google Cloud Pub/Sub.
   * Gmail will POST to your Pub/Sub topic when new emails arrive.
   * Requires: Pub/Sub topic created, Gmail API granted publish permission.
   * Returns: historyId and expiration (watch lasts ~7 days, must renew).
   */
  async watchInbox(topicName: string): Promise<{ historyId: string; expiration: string }> {
    const data = await this.gmailFetch('/watch', {
      method: 'POST',
      body: JSON.stringify({
        topicName,
        labelIds: ['INBOX'],
        labelFilterBehavior: 'INCLUDE',
      }),
    });
    return { historyId: data.historyId, expiration: data.expiration };
  }

  /**
   * Stop Gmail push notifications.
   */
  async stopWatch(): Promise<void> {
    await this.gmailFetch('/stop', { method: 'POST' });
  }

  /**
   * Get message history since a historyId (for processing push notification deltas).
   */
  async getHistory(startHistoryId: string): Promise<{ messages: Array<{ id: string; threadId: string }>; historyId: string }> {
    const data = await this.gmailFetch(`/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded&labelId=INBOX`);
    const messages: Array<{ id: string; threadId: string }> = [];
    for (const h of (data.history || [])) {
      for (const added of (h.messagesAdded || [])) {
        if (added.message?.id) messages.push({ id: added.message.id, threadId: added.message.threadId });
      }
    }
    return { messages, historyId: data.historyId || startHistoryId };
  }

  // ─── Helpers ────────────────────────────────────────

  private resolveLabelId(folder: string): string {
    const map: Record<string, string> = {
      INBOX: 'INBOX', inbox: 'INBOX',
      Sent: 'SENT', sent: 'SENT',
      Drafts: 'DRAFT', drafts: 'DRAFT',
      Trash: 'TRASH', trash: 'TRASH',
      Spam: 'SPAM', spam: 'SPAM', Junk: 'SPAM', junk: 'SPAM',
      Starred: 'STARRED', starred: 'STARRED',
      Important: 'IMPORTANT', important: 'IMPORTANT',
    };
    return map[folder] || folder;
  }

  private buildRawEmail(options: SendEmailOptions): string {
    const fromAddr = this.identity?.email;
    const fromName = this.identity?.name;
    const lines = [
      `MIME-Version: 1.0`,
      fromAddr ? `From: ${fromName ? `"${fromName}" <${fromAddr}>` : fromAddr}` : '',
      `To: ${options.to}`,
      `Subject: ${options.subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
    ].filter(Boolean);
    if (options.cc) lines.splice(3, 0, `Cc: ${options.cc}`);
    if (options.inReplyTo) lines.push(`In-Reply-To: ${options.inReplyTo}`);
    if (options.references?.length) lines.push(`References: ${options.references.join(' ')}`);
    lines.push('', options.body);

    const raw = lines.join('\r\n');
    // Base64url encode using Buffer (works reliably in Node.js)
    return Buffer.from(raw, 'utf-8').toString('base64url');
  }

  private getHeader(msg: any, name: string): string {
    const headers = msg.payload?.headers || [];
    const h = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
    return h?.value || '';
  }

  private metadataToEnvelope(msg: any): EmailEnvelope {
    const from = this.getHeader(msg, 'From');
    const fromMatch = from.match(/^(.*?)\s*<(.+?)>$/) || [null, '', from];
    return {
      uid: msg.id,
      from: { name: fromMatch[1]?.replace(/"/g, '').trim() || undefined, email: fromMatch[2] || from },
      to: [{ email: this.getHeader(msg, 'To') }],
      subject: this.getHeader(msg, 'Subject'),
      date: this.getHeader(msg, 'Date'),
      read: !(msg.labelIds || []).includes('UNREAD'),
      flagged: (msg.labelIds || []).includes('STARRED'),
      hasAttachments: false,
      preview: msg.snippet || '',
    };
  }

  private fullToMessage(msg: any): EmailMessage {
    const from = this.getHeader(msg, 'From');
    const fromMatch = from.match(/^(.*?)\s*<(.+?)>$/) || [null, '', from];

    // Extract body from parts
    let body = '';
    let html: string | undefined;
    const extractBody = (payload: any) => {
      if (payload.mimeType === 'text/plain' && payload.body?.data) {
        body = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
      }
      if (payload.mimeType === 'text/html' && payload.body?.data) {
        html = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
      }
      if (payload.parts) payload.parts.forEach(extractBody);
    };
    if (msg.payload) extractBody(msg.payload);

    return {
      uid: msg.id,
      from: { name: fromMatch[1]?.replace(/"/g, '').trim() || undefined, email: fromMatch[2] || from },
      to: [{ email: this.getHeader(msg, 'To') }],
      cc: this.getHeader(msg, 'Cc') ? [{ email: this.getHeader(msg, 'Cc') }] : undefined,
      subject: this.getHeader(msg, 'Subject'),
      body,
      html,
      date: this.getHeader(msg, 'Date'),
      read: !(msg.labelIds || []).includes('UNREAD'),
      flagged: (msg.labelIds || []).includes('STARRED'),
      folder: (msg.labelIds || []).includes('INBOX') ? 'inbox' : 'other',
      messageId: this.getHeader(msg, 'Message-ID'),
      inReplyTo: this.getHeader(msg, 'In-Reply-To') || undefined,
      references: this.getHeader(msg, 'References') ? this.getHeader(msg, 'References').split(/\s+/) : undefined,
      attachments: [],
    };
  }
}
