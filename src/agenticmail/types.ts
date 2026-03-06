/**
 * AgenticMail Enterprise — Core Types
 *
 * These types define the email provider abstraction layer.
 * In enterprise, agents get their email identity from the org's
 * identity provider (Okta, Azure AD, Google Workspace).
 * No separate AgenticMail server needed.
 */

// ─── Agent Email Identity ───────────────────────────────

export interface AgentEmailIdentity {
  /** Agent ID in the enterprise system */
  agentId: string;
  /** Agent display name */
  name: string;
  /** Agent email address (from org directory) */
  email: string;
  /** Org ID */
  orgId: string;
  /** OAuth access token for the email provider */
  accessToken: string;
  /** Token refresh callback */
  refreshToken?: () => Promise<string>;
  /** Provider type */
  provider: EmailProvider;
  /** IMAP/SMTP fields (for non-OAuth agents) */
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  password?: string;
}

export type EmailProvider = 'microsoft' | 'google' | 'imap';

// ─── Email Types ────────────────────────────────────────

export interface EmailMessage {
  uid: string;
  from: { name?: string; email: string };
  to: { name?: string; email: string }[];
  cc?: { name?: string; email: string }[];
  bcc?: { name?: string; email: string }[];
  subject: string;
  body: string;
  html?: string;
  date: string;
  read: boolean;
  flagged: boolean;
  folder: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
  messageId?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
}

export interface EmailEnvelope {
  uid: string;
  from: { name?: string; email: string };
  to: { name?: string; email: string }[];
  subject: string;
  date: string;
  read: boolean;
  flagged: boolean;
  hasAttachments: boolean;
  preview?: string;
}

export interface SendEmailOptions {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  html?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: { filename: string; content: string; contentType?: string; encoding?: string }[];
  /** Gmail thread ID — keeps reply in the same thread */
  threadId?: string;
}

export interface SearchCriteria {
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  since?: string;
  before?: string;
  seen?: boolean;
}

export interface EmailFolder {
  name: string;
  path: string;
  unread: number;
  total: number;
}

// ─── Email Provider Interface ───────────────────────────

/**
 * Abstract email provider that all backends must implement.
 * Microsoft Graph, Gmail API, and generic IMAP all implement this.
 */
export interface IEmailProvider {
  readonly provider: EmailProvider;

  // ─── Connection ─────────────────────────────────────
  connect(identity: AgentEmailIdentity): Promise<void>;
  disconnect(): Promise<void>;

  // ─── Inbox / Folders ────────────────────────────────
  listMessages(folder: string, opts?: { limit?: number; offset?: number }): Promise<EmailEnvelope[]>;
  readMessage(uid: string, folder?: string): Promise<EmailMessage>;
  searchMessages(criteria: SearchCriteria): Promise<EmailEnvelope[]>;
  listFolders(): Promise<EmailFolder[]>;
  createFolder(name: string): Promise<void>;

  // ─── Send ───────────────────────────────────────────
  send(options: SendEmailOptions): Promise<{ messageId: string }>;
  reply(uid: string, body: string, replyAll?: boolean): Promise<{ messageId: string }>;
  forward(uid: string, to: string, body?: string): Promise<{ messageId: string }>;

  // ─── Organize ───────────────────────────────────────
  moveMessage(uid: string, toFolder: string, fromFolder?: string): Promise<void>;
  deleteMessage(uid: string, folder?: string): Promise<void>;
  markRead(uid: string, folder?: string): Promise<void>;
  markUnread(uid: string, folder?: string): Promise<void>;
  flagMessage(uid: string, folder?: string): Promise<void>;
  unflagMessage(uid: string, folder?: string): Promise<void>;

  // ─── Batch ──────────────────────────────────────────
  batchMarkRead(uids: string[], folder?: string): Promise<void>;
  batchMarkUnread(uids: string[], folder?: string): Promise<void>;
  batchMove(uids: string[], toFolder: string, fromFolder?: string): Promise<void>;
  batchDelete(uids: string[], folder?: string): Promise<void>;
}

// ─── Inter-Agent Communication ──────────────────────────

export interface AgentMessage {
  id: string;
  from: string;        // agent ID
  to: string;          // agent ID
  subject: string;
  body: string;
  priority: 'normal' | 'high' | 'urgent';
  createdAt: string;
  read: boolean;
}

export interface AgentTask {
  id: string;
  assignee: string;    // agent ID
  assigner: string;    // agent ID
  title: string;
  description?: string;
  status: 'pending' | 'claimed' | 'completed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  result?: any;
  createdAt: string;
  updatedAt: string;
}

// ─── Storage ────────────────────────────────────────────
// Storage in enterprise uses the engine's existing database
// (already available via EngineDatabase). No separate storage needed.
