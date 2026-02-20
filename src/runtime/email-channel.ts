/**
 * Email Channel — Inbound Email Trigger
 *
 * Triggers agent sessions from inbound email.
 * When an email arrives at an agent's address, it creates or resumes
 * a session and feeds the email content as a user message.
 */

import type { AgentMessage, SessionState } from './types.js';

// ─── Types ───────────────────────────────────────────────

export interface InboundEmail {
  to: string;
  from: string;
  subject: string;
  body: string;
  html?: string;
  attachments?: EmailAttachment[];
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content?: string; // base64
}

export interface InboundEmailResult {
  sessionId: string;
  agentId: string;
  isNewSession: boolean;
}

export interface EmailChannelConfig {
  /** Look up agent by email address */
  resolveAgent: (email: string) => Promise<{ agentId: string; orgId: string } | null>;
  /** Find an active session for agent + sender combo, or return null */
  findActiveSession: (agentId: string, senderEmail: string) => Promise<SessionState | null>;
  /** Create a new session */
  createSession: (agentId: string, orgId: string) => Promise<SessionState>;
  /** Send a message to a session */
  sendMessage: (sessionId: string, message: string) => Promise<void>;
}

// ─── Email Channel ───────────────────────────────────────

export class EmailChannel {
  private config: EmailChannelConfig;

  constructor(config: EmailChannelConfig) {
    this.config = config;
  }

  /**
   * Handle an inbound email and trigger an agent session.
   */
  async handleInbound(email: InboundEmail): Promise<InboundEmailResult> {
    // 1. Look up agent by email address
    var agent = await this.config.resolveAgent(email.to);
    if (!agent) {
      throw new Error(`No agent found for email address: ${email.to}`);
    }

    // 2. Find active session or create new one
    var isNewSession = false;
    var session = await this.config.findActiveSession(agent.agentId, email.from);

    if (!session) {
      session = await this.config.createSession(agent.agentId, agent.orgId);
      isNewSession = true;
    }

    // 3. Format email as user message
    var messageContent = formatEmailAsMessage(email);

    // 4. Feed into agent session
    await this.config.sendMessage(session.id, messageContent);

    return {
      sessionId: session.id,
      agentId: agent.agentId,
      isNewSession,
    };
  }
}

// ─── Formatting ──────────────────────────────────────────

function formatEmailAsMessage(email: InboundEmail): string {
  var parts: string[] = [];

  parts.push(`[Inbound Email]`);
  parts.push(`From: ${email.from}`);
  parts.push(`Subject: ${email.subject}`);
  if (email.inReplyTo) {
    parts.push(`In-Reply-To: ${email.inReplyTo}`);
  }
  parts.push('');
  parts.push(email.body);

  if (email.attachments && email.attachments.length > 0) {
    parts.push('');
    parts.push(`Attachments (${email.attachments.length}):`);
    for (var att of email.attachments) {
      parts.push(`  - ${att.filename} (${att.contentType}, ${formatBytes(att.size)})`);
    }
  }

  return parts.join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
