/**
 * Secure Vault — AES-256-GCM Encryption at Rest
 *
 * Provides encrypted storage for secrets: API keys, cloud credentials,
 * database passwords, and other sensitive data. Uses AES-256-GCM with
 * PBKDF2 key derivation. Each entry has its own random salt and IV.
 *
 * Master key from AGENTICMAIL_VAULT_KEY env var.
 */

import { createHash, randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'crypto';
import type { EngineDatabase } from './db-adapter.js';

// ─── Types ──────────────────────────────────────────────

export interface VaultConfig {
  masterKeyEnvVar: string;        // Default: 'AGENTICMAIL_VAULT_KEY'
  pbkdf2Iterations: number;       // Default: 600_000
  pbkdf2Digest: string;           // Default: 'sha512'
  keyLength: number;              // Default: 32 (256 bits)
  saltLength: number;             // Default: 16
  ivLength: number;               // Default: 12
  authTagLength: number;          // Default: 16
}

export interface EncryptedPayload {
  v: number;                      // Format version (1)
  alg: string;                    // 'aes-256-gcm'
  salt: string;                   // Base64 salt
  iv: string;                     // Base64 IV
  tag: string;                    // Base64 auth tag
  data: string;                   // Base64 ciphertext
}

export interface VaultEntry {
  id: string;
  orgId: string;
  name: string;
  category: string;               // 'deploy', 'cloud_storage', 'api_key', 'custom'
  encryptedValue: string;         // JSON-serialized EncryptedPayload
  metadata: Record<string, any>;  // Non-sensitive metadata (never store secrets here)
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  rotatedAt?: string;
  expiresAt?: string;
}

export interface VaultAuditEntry {
  id: string;
  orgId: string;
  vaultEntryId?: string;
  action: string;                 // 'encrypt' | 'decrypt' | 'rotate' | 'delete' | 'migrate' | 'scan'
  actor: string;
  ip?: string;
  metadata: Record<string, any>;
  createdAt: string;
}

// ─── Default Configuration ──────────────────────────────

const DEFAULT_CONFIG: VaultConfig = {
  masterKeyEnvVar: 'AGENTICMAIL_VAULT_KEY',
  pbkdf2Iterations: 600_000,
  pbkdf2Digest: 'sha512',
  keyLength: 32,
  saltLength: 16,
  ivLength: 12,
  authTagLength: 16,
};

const DEV_FALLBACK_KEY = 'dev-insecure-vault-key-do-not-use-in-prod';

// ─── Secure Vault ───────────────────────────────────────

export class SecureVault {
  private config: VaultConfig;
  private masterKey: string;
  private entries = new Map<string, VaultEntry>();
  private engineDb?: EngineDatabase;
  private initialized = false;

  constructor(config?: Partial<VaultConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    const envKey = process.env[this.config.masterKeyEnvVar];
    if (!envKey) {
      console.warn(
        `[vault] ${this.config.masterKeyEnvVar} not set — using insecure dev fallback. ` +
        `DO NOT use this in production.`
      );
      this.masterKey = DEV_FALLBACK_KEY;
    } else {
      this.masterKey = envKey;
    }
  }

  // ─── Database Lifecycle ─────────────────────────────

  async setDb(db: EngineDatabase): Promise<void> {
    this.engineDb = db;
    await this.loadFromDb();
  }

  private async loadFromDb(): Promise<void> {
    if (!this.engineDb) return;
    try {
      const rows = await this.engineDb.query<any>('SELECT * FROM vault_entries');
      for (const r of rows) {
        this.entries.set(r.id, {
          id: r.id,
          orgId: r.org_id,
          name: r.name,
          category: r.category,
          encryptedValue: r.encrypted_value,
          metadata: JSON.parse(r.metadata || '{}'),
          createdBy: r.created_by,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          rotatedAt: r.rotated_at || undefined,
          expiresAt: r.expires_at || undefined,
        });
      }
      this.initialized = true;
    } catch {
      /* table may not exist yet */
    }
  }

  // ─── Core Crypto ─────────────────────────────────────

  private deriveKey(salt: Buffer): Buffer {
    return pbkdf2Sync(
      this.masterKey,
      salt,
      this.config.pbkdf2Iterations,
      this.config.keyLength,
      this.config.pbkdf2Digest,
    );
  }

  /**
   * Encrypt plaintext using AES-256-GCM with a random salt and IV.
   * Returns a JSON string containing the EncryptedPayload.
   */
  encrypt(plaintext: string): string {
    const salt = randomBytes(this.config.saltLength);
    const iv = randomBytes(this.config.ivLength);
    const key = this.deriveKey(salt);

    const cipher = createCipheriv('aes-256-gcm', key, iv, {
      authTagLength: this.config.authTagLength,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    const payload: EncryptedPayload = {
      v: 1,
      alg: 'aes-256-gcm',
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64'),
    };

    return JSON.stringify(payload);
  }

  /**
   * Decrypt an EncryptedPayload JSON string back to plaintext.
   * Throws 'Vault decryption failed' on any error.
   */
  decrypt(encryptedJson: string): string {
    try {
      const payload: EncryptedPayload = JSON.parse(encryptedJson);

      if (payload.v !== 1) throw new Error('Unsupported vault format version');
      if (payload.alg !== 'aes-256-gcm') throw new Error('Unsupported algorithm');

      const salt = Buffer.from(payload.salt, 'base64');
      const iv = Buffer.from(payload.iv, 'base64');
      const tag = Buffer.from(payload.tag, 'base64');
      const data = Buffer.from(payload.data, 'base64');

      const key = this.deriveKey(salt);

      const decipher = createDecipheriv('aes-256-gcm', key, iv, {
        authTagLength: this.config.authTagLength,
      });
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([
        decipher.update(data),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch {
      throw new Error('Vault decryption failed');
    }
  }

  /**
   * Check whether a string looks like an EncryptedPayload (v=1, alg=aes-256-gcm).
   */
  isEncrypted(value: string): boolean {
    try {
      const parsed = JSON.parse(value);
      return parsed.v === 1 && parsed.alg === 'aes-256-gcm';
    } catch {
      return false;
    }
  }

  /**
   * Returns true if the master key is not the insecure dev fallback.
   */
  isConfigured(): boolean {
    return this.masterKey !== DEV_FALLBACK_KEY;
  }

  // ─── Entry CRUD ──────────────────────────────────────

  /**
   * Store a new secret in the vault. Encrypts the plaintext, persists to DB,
   * and caches in the in-memory map.
   */
  async storeSecret(
    orgId: string,
    name: string,
    category: string,
    plaintext: string,
    metadata?: Record<string, any>,
    createdBy?: string,
  ): Promise<VaultEntry> {
    const now = new Date().toISOString();
    const encryptedValue = this.encrypt(plaintext);

    const entry: VaultEntry = {
      id: crypto.randomUUID(),
      orgId,
      name,
      category,
      encryptedValue,
      metadata: metadata || {},
      createdBy: createdBy || 'system',
      createdAt: now,
      updatedAt: now,
    };

    this.entries.set(entry.id, entry);

    await this.engineDb?.execute(
      `INSERT INTO vault_entries (id, org_id, name, category, encrypted_value, metadata, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id, entry.orgId, entry.name, entry.category,
        entry.encryptedValue, JSON.stringify(entry.metadata),
        entry.createdBy, entry.createdAt, entry.updatedAt,
      ]
    ).catch((err) => {
      console.error('[vault] Failed to persist vault entry:', err);
    });

    await this.auditLog(orgId, 'encrypt', entry.createdBy, entry.id, { name });

    return entry;
  }

  /**
   * Retrieve a secret by ID. Returns both the VaultEntry and the decrypted plaintext.
   * Logs an audit entry for the access.
   */
  async getSecret(id: string): Promise<{ entry: VaultEntry; decrypted: string } | null> {
    const entry = this.entries.get(id);
    if (!entry) return null;

    const decrypted = this.decrypt(entry.encryptedValue);

    await this.auditLog(entry.orgId, 'decrypt', 'system', id, { name: entry.name });

    return { entry, decrypted };
  }

  /**
   * List vault entries for an organization (optionally filtered by category).
   * Returns entries WITHOUT decrypting — safe for listing in the UI.
   */
  async getSecretsByOrg(orgId: string, category?: string): Promise<VaultEntry[]> {
    return Array.from(this.entries.values())
      .filter((e) => e.orgId === orgId && (!category || e.category === category));
  }

  /**
   * Re-encrypt a secret with a new plaintext value.
   */
  async updateSecret(id: string, plaintext: string, metadata?: Record<string, any>): Promise<VaultEntry | null> {
    const existing = this.entries.get(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const encryptedValue = this.encrypt(plaintext);

    const updated: VaultEntry = {
      ...existing,
      encryptedValue,
      metadata: metadata ? { ...existing.metadata, ...metadata } : existing.metadata,
      updatedAt: now,
    };

    this.entries.set(id, updated);

    await this.engineDb?.execute(
      `UPDATE vault_entries SET encrypted_value = ?, metadata = ?, updated_at = ? WHERE id = ?`,
      [updated.encryptedValue, JSON.stringify(updated.metadata), updated.updatedAt, id]
    ).catch((err) => {
      console.error('[vault] Failed to update vault entry:', err);
    });

    return updated;
  }

  /**
   * Delete a secret from DB and the in-memory cache.
   */
  async deleteSecret(id: string): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry) return false;

    this.entries.delete(id);

    await this.engineDb?.execute(
      'DELETE FROM vault_entries WHERE id = ?',
      [id]
    ).catch((err) => {
      console.error('[vault] Failed to delete vault entry:', err);
    });

    await this.auditLog(entry.orgId, 'delete', 'system', id, { name: entry.name });

    return true;
  }

  /**
   * Rotate a single secret: decrypt with current key, re-encrypt with new salt/IV.
   * Updates rotatedAt timestamp.
   */
  async rotateSecret(id: string): Promise<VaultEntry | null> {
    const entry = this.entries.get(id);
    if (!entry) return null;

    const plaintext = this.decrypt(entry.encryptedValue);
    const now = new Date().toISOString();
    const encryptedValue = this.encrypt(plaintext);

    const rotated: VaultEntry = {
      ...entry,
      encryptedValue,
      updatedAt: now,
      rotatedAt: now,
    };

    this.entries.set(id, rotated);

    await this.engineDb?.execute(
      `UPDATE vault_entries SET encrypted_value = ?, updated_at = ?, rotated_at = ? WHERE id = ?`,
      [rotated.encryptedValue, rotated.updatedAt, rotated.rotatedAt, id]
    ).catch((err) => {
      console.error('[vault] Failed to rotate vault entry:', err);
    });

    await this.auditLog(entry.orgId, 'rotate', 'system', id, { name: entry.name });

    return rotated;
  }

  /**
   * Rotate all secrets for an organization. Returns count of rotated entries and any errors.
   */
  async rotateAllSecrets(orgId: string): Promise<{ rotated: number; errors: string[] }> {
    const orgEntries = Array.from(this.entries.values()).filter((e) => e.orgId === orgId);
    let rotated = 0;
    const errors: string[] = [];

    for (const entry of orgEntries) {
      try {
        await this.rotateSecret(entry.id);
        rotated++;
      } catch (err: any) {
        errors.push(`${entry.name} (${entry.id}): ${err.message || 'unknown error'}`);
      }
    }

    return { rotated, errors };
  }

  // ─── Deploy Credential Migration ─────────────────────

  /**
   * Migrates existing deploy_credentials configs to encrypted form.
   * For each credential whose config is not already encrypted (no _encrypted key),
   * encrypts the config and updates the row in-place.
   */
  async migrateDeployCredentials(): Promise<{ migrated: number }> {
    if (!this.engineDb) return { migrated: 0 };

    let migrated = 0;

    try {
      const rows = await this.engineDb.query<any>('SELECT * FROM deploy_credentials');

      for (const row of rows) {
        const config = JSON.parse(row.config || '{}');

        // Skip already-encrypted configs
        if (config._encrypted) continue;

        const encryptedPayload = this.encrypt(JSON.stringify(config));
        const wrappedConfig = JSON.stringify({ _encrypted: encryptedPayload });

        await this.engineDb.execute(
          'UPDATE deploy_credentials SET config = ? WHERE id = ?',
          [wrappedConfig, row.id]
        );

        migrated++;
      }

      await this.auditLog('system', 'migrate', 'system', undefined, { migrated, table: 'deploy_credentials' });
    } catch (err) {
      console.error('[vault] Failed to migrate deploy credentials:', err);
    }

    return { migrated };
  }

  // ─── Audit Log ───────────────────────────────────────

  /**
   * Write an entry to the vault audit log.
   */
  async auditLog(
    orgId: string,
    action: string,
    actor: string,
    entryId?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    if (!this.engineDb) return;

    const record: VaultAuditEntry = {
      id: crypto.randomUUID(),
      orgId,
      vaultEntryId: entryId,
      action,
      actor,
      metadata: metadata || {},
      createdAt: new Date().toISOString(),
    };

    await this.engineDb.execute(
      `INSERT INTO vault_audit_log (id, org_id, vault_entry_id, action, actor, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id, record.orgId, record.vaultEntryId || null,
        record.action, record.actor, JSON.stringify(record.metadata),
        record.createdAt,
      ]
    ).catch((err) => {
      console.error('[vault] Failed to write audit log:', err);
    });
  }

  /**
   * Retrieve audit log entries for an organization with optional filters.
   */
  async getAuditLog(
    orgId: string,
    opts?: { entryId?: string; action?: string; limit?: number },
  ): Promise<VaultAuditEntry[]> {
    if (!this.engineDb) return [];

    const conditions: string[] = ['org_id = ?'];
    const params: any[] = [orgId];

    if (opts?.entryId) {
      conditions.push('vault_entry_id = ?');
      params.push(opts.entryId);
    }
    if (opts?.action) {
      conditions.push('action = ?');
      params.push(opts.action);
    }

    const where = conditions.join(' AND ');
    const limit = opts?.limit || 50;
    params.push(limit);

    try {
      const rows = await this.engineDb.query<any>(
        `SELECT * FROM vault_audit_log WHERE ${where} ORDER BY created_at DESC LIMIT ?`,
        params,
      );

      return rows.map((r: any) => ({
        id: r.id,
        orgId: r.org_id,
        vaultEntryId: r.vault_entry_id || undefined,
        action: r.action,
        actor: r.actor,
        ip: r.ip || undefined,
        metadata: JSON.parse(r.metadata || '{}'),
        createdAt: r.created_at,
      }));
    } catch {
      /* table may not exist yet */
      return [];
    }
  }

  // ─── Status ──────────────────────────────────────────

  /**
   * Returns a summary of the vault state — safe for dashboard display.
   */
  getStatus(): { configured: boolean; totalEntries: number; entriesByCategory: Record<string, number> } {
    const entriesByCategory: Record<string, number> = {};

    for (const entry of this.entries.values()) {
      entriesByCategory[entry.category] = (entriesByCategory[entry.category] || 0) + 1;
    }

    return {
      configured: this.isConfigured(),
      totalEntries: this.entries.size,
      entriesByCategory,
    };
  }
}
