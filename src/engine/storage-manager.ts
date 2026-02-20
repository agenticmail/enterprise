/**
 * Storage Manager
 *
 * Coordinates per-organization cloud storage configuration.
 * Stores cloud credentials in the SecureVault (encrypted at rest).
 * Caches active storage providers per org.
 */

import type { EngineDatabase } from './db-adapter.js';
import type { SecureVault } from './vault.js';
import { createStorageProvider, type StorageConfig, type StorageObject, type StorageProvider, type UploadOptions } from './storage.js';

// ─── Types ──────────────────────────────────────────────

export interface OrgStorageConfig {
  id: string;
  orgId: string;
  storageType: StorageConfig['type'];
  config: Record<string, any>;    // Non-sensitive config (bucket name, region, etc.)
  vaultCredentialId?: string;     // ID of vault entry with encrypted credentials
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorageObjectRecord {
  id: string;
  orgId: string;
  storageKey: string;
  originalName: string;
  contentType: string;
  size: number;
  relatedType?: string;         // 'policy', 'knowledge_base', etc.
  relatedId?: string;           // ID of related entity
  metadata: Record<string, any>;
  createdBy: string;
  createdAt: string;
}

// ─── Storage Manager ────────────────────────────────────

export class StorageManager {
  private providers = new Map<string, StorageProvider>();  // orgId → provider
  private configs = new Map<string, OrgStorageConfig>();   // orgId → config
  private vault?: SecureVault;
  private engineDb?: EngineDatabase;

  constructor(opts: { vault?: SecureVault }) {
    this.vault = opts.vault;
  }

  async setDb(db: EngineDatabase): Promise<void> {
    this.engineDb = db;
    await this.loadFromDb();
  }

  private async loadFromDb(): Promise<void> {
    if (!this.engineDb) return;
    try {
      const rows = await this.engineDb.query<any>('SELECT * FROM org_storage_config');
      for (const r of rows) {
        this.configs.set(r.org_id, {
          id: r.id,
          orgId: r.org_id,
          storageType: r.storage_type,
          config: JSON.parse(r.config || '{}'),
          vaultCredentialId: r.vault_credential_id || undefined,
          enabled: !!r.enabled,
          createdBy: r.created_by,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        });
      }
    } catch { /* table may not exist yet */ }
  }

  // ─── Configuration ───────────────────────────────────

  async configureStorage(orgId: string, config: StorageConfig, createdBy: string): Promise<OrgStorageConfig> {
    // 1. Extract sensitive fields (accessKeyId, secretAccessKey, serviceAccountKey, connectionString)
    // 2. Store them in vault if vault is available
    // 3. Store non-sensitive config (bucket, region, type, endpoint) in org_storage_config table
    // 4. Invalidate cached provider for this org

    const sensitiveKeys = ['accessKeyId', 'secretAccessKey', 'serviceAccountKey', 'connectionString'];
    const sensitive: Record<string, string> = {};
    const safeConfig: Record<string, any> = {};

    for (const [k, v] of Object.entries(config)) {
      if (sensitiveKeys.includes(k) && typeof v === 'string' && v.length > 0) {
        sensitive[k] = v;
      } else {
        safeConfig[k] = v;
      }
    }

    let vaultCredentialId: string | undefined;
    if (Object.keys(sensitive).length > 0 && this.vault) {
      const entry = await this.vault.storeSecret(
        orgId,
        `storage-credentials-${orgId}`,
        'cloud_storage',
        JSON.stringify(sensitive),
        { storageType: config.type },
        createdBy,
      );
      vaultCredentialId = entry.id;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const record: OrgStorageConfig = {
      id, orgId, storageType: config.type, config: safeConfig,
      vaultCredentialId, enabled: true, createdBy, createdAt: now, updatedAt: now,
    };

    // Upsert — delete existing for org then insert
    if (this.engineDb) {
      await this.engineDb.execute('DELETE FROM org_storage_config WHERE org_id = ?', [orgId]);
      await this.engineDb.execute(
        'INSERT INTO org_storage_config (id, org_id, storage_type, config, vault_credential_id, enabled, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, orgId, config.type, JSON.stringify(safeConfig), vaultCredentialId || null, 1, createdBy, now, now]
      );
    }

    this.configs.set(orgId, record);
    this.providers.delete(orgId); // invalidate cached provider
    return record;
  }

  async getStorageConfig(orgId: string): Promise<OrgStorageConfig | null> {
    return this.configs.get(orgId) || null;
  }

  // ─── Provider Access ─────────────────────────────────

  async getProvider(orgId: string): Promise<StorageProvider> {
    // Check cache
    if (this.providers.has(orgId)) return this.providers.get(orgId)!;

    const config = this.configs.get(orgId);
    if (!config || !config.enabled) {
      // Fall back to local storage
      const local = createStorageProvider('local');
      await local.init({ type: 'local', basePath: `./storage/${orgId}` });
      this.providers.set(orgId, local);
      return local;
    }

    // Build full config by merging safe config with decrypted vault credentials
    const fullConfig: StorageConfig = { ...config.config, type: config.storageType } as StorageConfig;

    if (config.vaultCredentialId && this.vault) {
      const secret = await this.vault.getSecret(config.vaultCredentialId);
      if (secret) {
        const creds = JSON.parse(secret.decrypted);
        Object.assign(fullConfig, creds);
      }
    }

    const provider = createStorageProvider(config.storageType);
    await provider.init(fullConfig);
    this.providers.set(orgId, provider);
    return provider;
  }

  // ─── Document Operations ─────────────────────────────

  async uploadDocument(orgId: string, opts: {
    fileName: string;
    data: Buffer | string;
    contentType: string;
    relatedType?: string;
    relatedId?: string;
    metadata?: Record<string, any>;
    createdBy?: string;
  }): Promise<StorageObjectRecord> {
    const provider = await this.getProvider(orgId);
    const key = `${orgId}/${opts.relatedType || 'general'}/${Date.now()}-${opts.fileName}`;
    const buf = typeof opts.data === 'string' ? Buffer.from(opts.data, 'base64') : opts.data;

    await provider.upload(key, buf, { contentType: opts.contentType, metadata: opts.metadata as any });

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const record: StorageObjectRecord = {
      id, orgId, storageKey: key, originalName: opts.fileName,
      contentType: opts.contentType, size: buf.length,
      relatedType: opts.relatedType, relatedId: opts.relatedId,
      metadata: opts.metadata || {}, createdBy: opts.createdBy || 'system', createdAt: now,
    };

    if (this.engineDb) {
      await this.engineDb.execute(
        'INSERT INTO storage_objects (id, org_id, storage_key, original_name, content_type, size, related_type, related_id, metadata, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, orgId, key, opts.fileName, opts.contentType, buf.length, opts.relatedType || null, opts.relatedId || null, JSON.stringify(opts.metadata || {}), opts.createdBy || 'system', now]
      );
    }

    return record;
  }

  async getDocumentUrl(orgId: string, key: string, expiresInSeconds = 3600): Promise<string> {
    const provider = await this.getProvider(orgId);
    return provider.getPresignedUrl(key, expiresInSeconds);
  }

  async downloadDocument(orgId: string, key: string): Promise<Buffer> {
    const provider = await this.getProvider(orgId);
    return provider.download(key);
  }

  async deleteDocument(orgId: string, key: string): Promise<boolean> {
    const provider = await this.getProvider(orgId);
    const deleted = await provider.delete(key);
    if (deleted && this.engineDb) {
      await this.engineDb.execute('DELETE FROM storage_objects WHERE org_id = ? AND storage_key = ?', [orgId, key]);
    }
    return deleted;
  }

  async listDocuments(orgId: string, opts?: { relatedType?: string; relatedId?: string; limit?: number }): Promise<StorageObjectRecord[]> {
    if (!this.engineDb) return [];
    let sql = 'SELECT * FROM storage_objects WHERE org_id = ?';
    const params: any[] = [orgId];
    if (opts?.relatedType) { sql += ' AND related_type = ?'; params.push(opts.relatedType); }
    if (opts?.relatedId) { sql += ' AND related_id = ?'; params.push(opts.relatedId); }
    sql += ' ORDER BY created_at DESC';
    if (opts?.limit) { sql += ' LIMIT ?'; params.push(opts.limit); }

    const rows = await this.engineDb.query<any>(sql, params);
    return rows.map((r: any) => ({
      id: r.id, orgId: r.org_id, storageKey: r.storage_key, originalName: r.original_name,
      contentType: r.content_type, size: r.size, relatedType: r.related_type,
      relatedId: r.related_id, metadata: JSON.parse(r.metadata || '{}'),
      createdBy: r.created_by, createdAt: r.created_at,
    }));
  }

  // ─── Health Check ────────────────────────────────────

  async healthCheck(orgId: string): Promise<{ healthy: boolean; type: string; error?: string }> {
    try {
      const provider = await this.getProvider(orgId);
      const healthy = await provider.healthCheck();
      return { healthy, type: provider.type };
    } catch (e: any) {
      return { healthy: false, type: 'unknown', error: e.message };
    }
  }
}
