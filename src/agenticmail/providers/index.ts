/**
 * Email Provider Factory
 *
 * Creates the right email provider based on the org's identity provider.
 * - Microsoft 365 / Azure AD → Microsoft Graph API
 * - Google Workspace → Gmail API
 * - Generic IMAP/SMTP → IMAP provider (future)
 */

export { MicrosoftEmailProvider } from './microsoft.js';
export { GoogleEmailProvider } from './google.js';
export { ImapEmailProvider, IMAP_PRESETS, detectImapSettings } from './imap.js';
export type { ImapEmailIdentity } from './imap.js';

import type { IEmailProvider, EmailProvider } from '../types.js';
import { MicrosoftEmailProvider } from './microsoft.js';
import { GoogleEmailProvider } from './google.js';
import { ImapEmailProvider } from './imap.js';

export function createEmailProvider(provider: EmailProvider): IEmailProvider {
  switch (provider) {
    case 'microsoft': return new MicrosoftEmailProvider();
    case 'google': return new GoogleEmailProvider();
    case 'imap': return new ImapEmailProvider();
    default:
      throw new Error(`Unknown email provider: ${provider}`);
  }
}
