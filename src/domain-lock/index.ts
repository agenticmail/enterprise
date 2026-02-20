/**
 * DomainLock — Enterprise Domain Registration & Verification
 *
 * Protects enterprise deployments by ensuring domain uniqueness.
 * Communicates with the AgenticMail central registry for:
 *   1. Domain registration (one-time, during setup)
 *   2. DNS verification (one-time, after DNS TXT record is added)
 *   3. Recovery (if system is lost, re-register on a new machine)
 *
 * After verification, the system operates 100% offline.
 */

import { randomBytes } from 'crypto';

const REGISTRY_BASE_URL = process.env.AGENTICMAIL_REGISTRY_URL
  || 'https://registry.agenticmail.com/v1';

// ─── Types ──────────────────────────────────────────────

export interface RegistrationResult {
  success: boolean;
  registrationId?: string;
  dnsChallenge?: string;
  error?: string;
  /** HTTP status code from registry (e.g. 409 = domain already taken) */
  statusCode?: number;
}

export interface VerificationResult {
  success: boolean;
  verified?: boolean;
  error?: string;
}

export interface RecoveryResult {
  success: boolean;
  dnsChallenge?: string;
  registrationId?: string;
  error?: string;
}

export interface DomainStatus {
  domain: string | null;
  status: 'unregistered' | 'pending_dns' | 'verified' | 'failed';
  registeredAt: string | null;
  verifiedAt: string | null;
  dnsChallenge: string | null;
}

// ─── DomainLock Client ──────────────────────────────────

export class DomainLock {
  private registryUrl: string;

  constructor(opts?: { registryUrl?: string }) {
    this.registryUrl = (opts?.registryUrl || REGISTRY_BASE_URL).replace(/\/$/, '');
  }

  /**
   * Generate a 256-bit deployment key.
   * Returns the plaintext (hex) and its bcrypt hash.
   * The plaintext should be shown to the user ONCE and never stored.
   */
  async generateDeploymentKey(): Promise<{ plaintext: string; hash: string }> {
    const { default: bcrypt } = await import('bcryptjs');
    const plaintext = randomBytes(32).toString('hex'); // 64-char hex
    const hash = await bcrypt.hash(plaintext, 12);
    return { plaintext, hash };
  }

  /**
   * Register a domain with the central registry.
   * Called during setup wizard Step 5.
   *
   * @param domain - The domain to register (e.g. "agents.agenticmail.io")
   * @param keyHash - bcrypt hash of the deployment key
   * @param opts - Optional org name and contact email
   */
  async register(
    domain: string,
    keyHash: string,
    opts?: { orgName?: string; contactEmail?: string },
  ): Promise<RegistrationResult> {
    try {
      const res = await fetch(`${this.registryUrl}/domains/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domain.toLowerCase().trim(),
          keyHash,
          orgName: opts?.orgName,
          contactEmail: opts?.contactEmail,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const data = await res.json().catch(() => ({})) as any;

      if (res.status === 409) {
        return {
          success: false,
          error: data.error || 'Domain is already registered and verified. Use "recover" if this is your domain.',
          statusCode: 409,
        };
      }

      if (!res.ok) {
        return {
          success: false,
          error: data.error || `Registration failed (HTTP ${res.status})`,
          statusCode: res.status,
        };
      }

      return {
        success: true,
        registrationId: data.registrationId,
        dnsChallenge: data.dnsChallenge,
      };
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return { success: false, error: 'Registry server unreachable (timeout). You can retry later or continue without registration.' };
      }
      return { success: false, error: `Registry connection failed: ${err.message}` };
    }
  }

  /**
   * Ask the registry to check DNS verification for a domain.
   * The registry resolves _agenticmail-verify.<domain> TXT record.
   */
  async checkVerification(domain: string): Promise<VerificationResult> {
    try {
      const res = await fetch(`${this.registryUrl}/domains/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domain.toLowerCase().trim() }),
        signal: AbortSignal.timeout(15_000),
      });

      const data = await res.json().catch(() => ({})) as any;

      if (!res.ok) {
        return { success: false, error: data.error || `Verification check failed (HTTP ${res.status})` };
      }

      return {
        success: true,
        verified: data.verified === true,
        error: data.verified ? undefined : (data.error || 'DNS record not found yet'),
      };
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return { success: false, error: 'Registry server unreachable (timeout)' };
      }
      return { success: false, error: `Registry connection failed: ${err.message}` };
    }
  }

  /**
   * Recover a domain registration on a new machine.
   * Requires the original deployment key (plaintext).
   * The registry verifies via bcrypt.compare against stored hash.
   * On success, a new DNS challenge is issued (must re-verify DNS).
   */
  async recover(domain: string, deploymentKey: string): Promise<RecoveryResult> {
    try {
      const res = await fetch(`${this.registryUrl}/domains/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domain.toLowerCase().trim(),
          deploymentKey,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const data = await res.json().catch(() => ({})) as any;

      if (res.status === 403) {
        return { success: false, error: 'Invalid deployment key. The key does not match the registered domain.' };
      }

      if (res.status === 404) {
        return { success: false, error: 'Domain is not registered. Use setup wizard to register first.' };
      }

      if (!res.ok) {
        return { success: false, error: data.error || `Recovery failed (HTTP ${res.status})` };
      }

      return {
        success: true,
        dnsChallenge: data.dnsChallenge,
        registrationId: data.registrationId,
      };
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return { success: false, error: 'Registry server unreachable (timeout)' };
      }
      return { success: false, error: `Registry connection failed: ${err.message}` };
    }
  }

  /**
   * Check domain status on the registry (public, read-only).
   */
  async getRemoteStatus(domain: string): Promise<{ registered: boolean; verified: boolean } | null> {
    try {
      const res = await fetch(
        `${this.registryUrl}/domains/${encodeURIComponent(domain.toLowerCase().trim())}/status`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return null;
      return await res.json() as { registered: boolean; verified: boolean };
    } catch {
      return null;
    }
  }
}
