/**
 * AgenticMail Enterprise
 *
 * Embedded email & communication system for enterprise agents.
 * No separate server — agents use their org email via OAuth.
 *
 * Usage:
 *   import { AgenticMailManager } from './agenticmail/index.js';
 *   const mail = new AgenticMailManager({ db: engineDb });
 *   await mail.registerAgent({ agentId, email, accessToken, provider: 'microsoft', ... });
 *   const provider = mail.getProvider(agentId);
 *   await provider.send({ to: 'user@company.com', subject: 'Hello', body: '...' });
 */

export { AgenticMailManager } from './manager.js';
export type { AgenticMailManagerOptions } from './manager.js';
export { createEmailProvider } from './providers/index.js';
export { MicrosoftEmailProvider } from './providers/microsoft.js';
export { GoogleEmailProvider } from './providers/google.js';
export { ImapEmailProvider, IMAP_PRESETS, detectImapSettings } from './providers/imap.js';
export type { ImapEmailIdentity } from './providers/imap.js';
export type {
  IEmailProvider,
  AgentEmailIdentity,
  EmailProvider,
  EmailMessage,
  EmailEnvelope,
  EmailFolder,
  SendEmailOptions,
  SearchCriteria,
  EmailAttachment,
  AgentMessage,
  AgentTask,
} from './types.js';
