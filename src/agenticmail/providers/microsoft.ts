/**
 * Microsoft Graph Email Provider
 *
 * Implements IEmailProvider using Microsoft Graph API.
 * Agent authenticates via org's Azure AD / Entra ID OAuth.
 * Email address comes from the org directory.
 */

import type {
  IEmailProvider, AgentEmailIdentity, EmailProvider,
  EmailMessage, EmailEnvelope, EmailFolder,
  SendEmailOptions, SearchCriteria,
} from '../types.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export class MicrosoftEmailProvider implements IEmailProvider {
  readonly provider: EmailProvider = 'microsoft';
  private identity: AgentEmailIdentity | null = null;

  private get token(): string {
    if (!this.identity) throw new Error('Not connected');
    return this.identity.accessToken;
  }

  private async refreshIfNeeded(): Promise<void> {
    if (this.identity?.refreshToken) {
      this.identity.accessToken = await this.identity.refreshToken();
    }
  }

  private async graphFetch(path: string, opts?: RequestInit): Promise<any> {
    await this.refreshIfNeeded();
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...opts?.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Graph API ${res.status}: ${text}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // ─── Connection ─────────────────────────────────────

  async connect(identity: AgentEmailIdentity): Promise<void> {
    this.identity = identity;
    // Validate token by fetching profile
    await this.graphFetch('/me?$select=mail,displayName');
  }

  async disconnect(): Promise<void> {
    this.identity = null;
  }

  // ─── List / Read ────────────────────────────────────

  async listMessages(folder: string, opts?: { limit?: number; offset?: number }): Promise<EmailEnvelope[]> {
    const folderId = this.resolveFolderId(folder);
    const top = opts?.limit || 20;
    const skip = opts?.offset || 0;
    const data = await this.graphFetch(
      `/me/mailFolders/${folderId}/messages?$top=${top}&$skip=${skip}&$select=id,subject,from,toRecipients,receivedDateTime,isRead,flag,hasAttachments,bodyPreview&$orderby=receivedDateTime desc`
    );
    return (data.value || []).map((m: any) => this.toEnvelope(m));
  }

  async readMessage(uid: string): Promise<EmailMessage> {
    const data = await this.graphFetch(`/me/messages/${uid}?$select=id,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,isRead,flag,hasAttachments,body,bodyPreview,replyTo,internetMessageId,internetMessageHeaders,conversationId`);
    return this.toMessage(data);
  }

  async searchMessages(criteria: SearchCriteria): Promise<EmailEnvelope[]> {
    const filters: string[] = [];
    if (criteria.from) filters.push(`from/emailAddress/address eq '${criteria.from}'`);
    if (criteria.subject) filters.push(`contains(subject, '${criteria.subject}')`);
    if (criteria.since) filters.push(`receivedDateTime ge ${criteria.since}`);
    if (criteria.before) filters.push(`receivedDateTime lt ${criteria.before}`);
    if (criteria.seen !== undefined) filters.push(`isRead eq ${criteria.seen}`);

    let path = '/me/messages?$top=50&$select=id,subject,from,toRecipients,receivedDateTime,isRead,flag,hasAttachments,bodyPreview&$orderby=receivedDateTime desc';
    if (filters.length) path += '&$filter=' + encodeURIComponent(filters.join(' and '));
    if (criteria.text) path = `/me/messages?$search="${encodeURIComponent(criteria.text)}"&$top=50&$select=id,subject,from,toRecipients,receivedDateTime,isRead,flag,hasAttachments,bodyPreview`;

    const data = await this.graphFetch(path);
    return (data.value || []).map((m: any) => this.toEnvelope(m));
  }

  async listFolders(): Promise<EmailFolder[]> {
    const data = await this.graphFetch('/me/mailFolders?$select=id,displayName,unreadItemCount,totalItemCount');
    return (data.value || []).map((f: any) => ({
      name: f.displayName,
      path: f.id,
      unread: f.unreadItemCount || 0,
      total: f.totalItemCount || 0,
    }));
  }

  async createFolder(name: string): Promise<void> {
    await this.graphFetch('/me/mailFolders', {
      method: 'POST',
      body: JSON.stringify({ displayName: name }),
    });
  }

  // ─── Send ───────────────────────────────────────────

  async send(options: SendEmailOptions): Promise<{ messageId: string }> {
    const message = this.buildGraphMessage(options);
    await this.graphFetch('/me/sendMail', {
      method: 'POST',
      body: JSON.stringify({ message, saveToSentItems: true }),
    });
    return { messageId: `graph-${Date.now()}` };
  }

  async reply(uid: string, body: string, replyAll = false): Promise<{ messageId: string }> {
    const endpoint = replyAll ? 'replyAll' : 'reply';
    await this.graphFetch(`/me/messages/${uid}/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify({ comment: body }),
    });
    return { messageId: `graph-reply-${Date.now()}` };
  }

  async forward(uid: string, to: string, body?: string): Promise<{ messageId: string }> {
    await this.graphFetch(`/me/messages/${uid}/forward`, {
      method: 'POST',
      body: JSON.stringify({
        comment: body || '',
        toRecipients: [{ emailAddress: { address: to } }],
      }),
    });
    return { messageId: `graph-fwd-${Date.now()}` };
  }

  // ─── Organize ───────────────────────────────────────

  async moveMessage(uid: string, toFolder: string): Promise<void> {
    const folderId = this.resolveFolderId(toFolder);
    await this.graphFetch(`/me/messages/${uid}/move`, {
      method: 'POST',
      body: JSON.stringify({ destinationId: folderId }),
    });
  }

  async deleteMessage(uid: string): Promise<void> {
    await this.graphFetch(`/me/messages/${uid}`, { method: 'DELETE' });
  }

  async markRead(uid: string): Promise<void> {
    await this.graphFetch(`/me/messages/${uid}`, {
      method: 'PATCH',
      body: JSON.stringify({ isRead: true }),
    });
  }

  async markUnread(uid: string): Promise<void> {
    await this.graphFetch(`/me/messages/${uid}`, {
      method: 'PATCH',
      body: JSON.stringify({ isRead: false }),
    });
  }

  async flagMessage(uid: string): Promise<void> {
    await this.graphFetch(`/me/messages/${uid}`, {
      method: 'PATCH',
      body: JSON.stringify({ flag: { flagStatus: 'flagged' } }),
    });
  }

  async unflagMessage(uid: string): Promise<void> {
    await this.graphFetch(`/me/messages/${uid}`, {
      method: 'PATCH',
      body: JSON.stringify({ flag: { flagStatus: 'notFlagged' } }),
    });
  }

  // ─── Batch ──────────────────────────────────────────

  async batchMarkRead(uids: string[]): Promise<void> {
    await Promise.all(uids.map(uid => this.markRead(uid)));
  }

  async batchMarkUnread(uids: string[]): Promise<void> {
    await Promise.all(uids.map(uid => this.markUnread(uid)));
  }

  async batchMove(uids: string[], toFolder: string): Promise<void> {
    await Promise.all(uids.map(uid => this.moveMessage(uid, toFolder)));
  }

  async batchDelete(uids: string[]): Promise<void> {
    await Promise.all(uids.map(uid => this.deleteMessage(uid)));
  }

  // ─── Helpers ────────────────────────────────────────

  private resolveFolderId(folder: string): string {
    const map: Record<string, string> = {
      INBOX: 'inbox', inbox: 'inbox',
      Sent: 'sentItems', sent: 'sentItems', sentitems: 'sentItems',
      Drafts: 'drafts', drafts: 'drafts',
      Trash: 'deletedItems', trash: 'deletedItems', deleteditems: 'deletedItems',
      Junk: 'junkemail', junk: 'junkemail', spam: 'junkemail',
      Archive: 'archive', archive: 'archive',
    };
    return map[folder] || folder;
  }

  private buildGraphMessage(options: SendEmailOptions): any {
    const msg: any = {
      subject: options.subject,
      body: { contentType: options.html ? 'HTML' : 'Text', content: options.html || options.body },
      toRecipients: options.to.split(',').map(e => ({ emailAddress: { address: e.trim() } })),
    };
    if (options.cc) msg.ccRecipients = options.cc.split(',').map(e => ({ emailAddress: { address: e.trim() } }));
    if (options.bcc) msg.bccRecipients = options.bcc.split(',').map(e => ({ emailAddress: { address: e.trim() } }));
    if (options.inReplyTo) msg.internetMessageHeaders = [{ name: 'In-Reply-To', value: options.inReplyTo }];
    return msg;
  }

  private toEnvelope(m: any): EmailEnvelope {
    return {
      uid: m.id,
      from: { name: m.from?.emailAddress?.name, email: m.from?.emailAddress?.address || '' },
      to: (m.toRecipients || []).map((r: any) => ({ name: r.emailAddress?.name, email: r.emailAddress?.address || '' })),
      subject: m.subject || '',
      date: m.receivedDateTime || '',
      read: !!m.isRead,
      flagged: m.flag?.flagStatus === 'flagged',
      hasAttachments: !!m.hasAttachments,
      preview: m.bodyPreview || '',
    };
  }

  private toMessage(m: any): EmailMessage {
    return {
      uid: m.id,
      from: { name: m.from?.emailAddress?.name, email: m.from?.emailAddress?.address || '' },
      to: (m.toRecipients || []).map((r: any) => ({ name: r.emailAddress?.name, email: r.emailAddress?.address || '' })),
      cc: (m.ccRecipients || []).map((r: any) => ({ name: r.emailAddress?.name, email: r.emailAddress?.address || '' })),
      subject: m.subject || '',
      body: m.body?.contentType === 'HTML' ? '' : (m.body?.content || ''),
      html: m.body?.contentType === 'HTML' ? m.body?.content : undefined,
      date: m.receivedDateTime || '',
      read: !!m.isRead,
      flagged: m.flag?.flagStatus === 'flagged',
      folder: 'inbox',
      messageId: m.internetMessageId,
      attachments: [],
    };
  }
}
