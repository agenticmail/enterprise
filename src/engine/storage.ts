/**
 * Cloud Storage Providers
 *
 * Abstract storage interface with implementations for local filesystem,
 * AWS S3, Google Cloud Storage, and Azure Blob Storage.
 * Cloud SDKs are loaded via dynamic import() — they are optional peer deps.
 */

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';

// ─── Types ──────────────────────────────────────────────

export interface StorageConfig {
  type: 'local' | 's3' | 'gcs' | 'azure';
  basePath?: string;             // Local
  bucket?: string;               // S3 / GCS
  region?: string;               // AWS region (default: us-east-1)
  accessKeyId?: string;          // AWS
  secretAccessKey?: string;      // AWS
  endpoint?: string;             // S3-compatible (MinIO, R2, etc.)
  forcePathStyle?: boolean;      // S3-compatible
  projectId?: string;            // GCS
  serviceAccountKey?: string;    // GCS JSON key string
  connectionString?: string;     // Azure
  containerName?: string;        // Azure
}

export interface StorageObject {
  key: string;
  size: number;
  etag?: string;
  lastModified: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface ListOptions {
  maxKeys?: number;
  continuationToken?: string;
}

/** Abstract storage provider — swap implementations without changing business logic. */
export interface StorageProvider {
  readonly type: 'local' | 's3' | 'gcs' | 'azure';
  init(config: StorageConfig): Promise<void>;
  healthCheck(): Promise<boolean>;
  upload(key: string, data: Buffer | string, options?: UploadOptions): Promise<StorageObject>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  list(prefix: string, options?: ListOptions): Promise<StorageObject[]>;
  getPresignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  getPresignedUploadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  getMetadata(key: string): Promise<StorageObject>;
}

// ─── Helpers ────────────────────────────────────────────

/** Compute an MD5 etag from a buffer. */
function md5(buf: Buffer): string {
  return createHash('md5').update(buf).digest('hex');
}

/** Coerce string data to Buffer. */
function toBuf(data: Buffer | string): Buffer {
  return typeof data === 'string' ? Buffer.from(data) : data;
}

/** Build a basic StorageObject after a successful upload. */
function uploadResult(key: string, buf: Buffer, options?: UploadOptions): StorageObject {
  return {
    key, size: buf.length, etag: md5(buf),
    lastModified: new Date().toISOString(),
    contentType: options?.contentType || 'application/octet-stream',
    metadata: options?.metadata,
  };
}

// ─── LocalStorageProvider ───────────────────────────────

/**
 * Filesystem-backed storage provider.
 * Works with zero configuration. Metadata is stored as `.meta.json` sidecar files.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly type = 'local' as const;
  private basePath = './storage';

  async init(config: StorageConfig): Promise<void> {
    this.basePath = config.basePath || './storage';
    await fs.mkdir(this.basePath, { recursive: true });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const f = join(this.basePath, '.health-check');
      await fs.writeFile(f, 'ok');
      await fs.unlink(f);
      return true;
    } catch { return false; }
  }

  async upload(key: string, data: Buffer | string, options?: UploadOptions): Promise<StorageObject> {
    const filePath = join(this.basePath, key);
    await fs.mkdir(dirname(filePath), { recursive: true });
    const buf = toBuf(data);
    await fs.writeFile(filePath, buf);
    if (options?.metadata || options?.contentType) {
      await fs.writeFile(filePath + '.meta.json',
        JSON.stringify({ contentType: options.contentType, metadata: options.metadata }));
    }
    return uploadResult(key, buf, options);
  }

  async download(key: string): Promise<Buffer> {
    return fs.readFile(join(this.basePath, key));
  }

  async delete(key: string): Promise<boolean> {
    try {
      await fs.unlink(join(this.basePath, key));
      await fs.unlink(join(this.basePath, key + '.meta.json')).catch(() => {});
      return true;
    } catch { return false; }
  }

  async exists(key: string): Promise<boolean> {
    try { await fs.access(join(this.basePath, key)); return true; }
    catch { return false; }
  }

  async list(prefix: string, options?: ListOptions): Promise<StorageObject[]> {
    const results: StorageObject[] = [];
    const dir = join(this.basePath, prefix || '');
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
      for (const entry of entries) {
        if (!entry.isFile() || entry.name.endsWith('.meta.json')) continue;
        const filePath = join(dir, entry.name);
        const stat = await fs.stat(filePath);
        const key = filePath.replace(this.basePath + '/', '').replace(this.basePath + '\\', '');
        results.push({ key, size: stat.size, lastModified: stat.mtime.toISOString() });
        if (options?.maxKeys && results.length >= options.maxKeys) break;
      }
    } catch { /* dir may not exist */ }
    return results;
  }

  async getPresignedUrl(key: string): Promise<string> {
    return `file://${join(this.basePath, key)}`;
  }

  async getPresignedUploadUrl(key: string): Promise<string> {
    return `file://${join(this.basePath, key)}`;
  }

  async getMetadata(key: string): Promise<StorageObject> {
    const filePath = join(this.basePath, key);
    const stat = await fs.stat(filePath);
    let meta: { contentType?: string; metadata?: Record<string, string> } = {};
    try { meta = JSON.parse(await fs.readFile(filePath + '.meta.json', 'utf-8')); }
    catch { /* no sidecar */ }
    return {
      key, size: stat.size, lastModified: stat.mtime.toISOString(),
      contentType: meta.contentType || 'application/octet-stream',
      metadata: meta.metadata || {},
    };
  }
}

// ─── S3StorageProvider ──────────────────────────────────

/**
 * AWS S3 storage provider. Also works with S3-compatible services
 * (MinIO, Cloudflare R2, DigitalOcean Spaces) via `endpoint` + `forcePathStyle`.
 *
 * Peer deps: @aws-sdk/client-s3, @aws-sdk/s3-request-presigner
 */
export class S3StorageProvider implements StorageProvider {
  readonly type = 's3' as const;
  private client: any = null;
  private bucket = '';

  async init(config: StorageConfig): Promise<void> {
    this.bucket = config.bucket || '';
    if (!this.bucket) throw new Error('S3 bucket is required');
    try {
      const { S3Client } = await import('@aws-sdk/client-s3');
      const cfg: Record<string, any> = { region: config.region || 'us-east-1' };
      if (config.accessKeyId && config.secretAccessKey) {
        cfg.credentials = { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey };
      }
      if (config.endpoint) {
        cfg.endpoint = config.endpoint;
        cfg.forcePathStyle = config.forcePathStyle ?? true;
      }
      this.client = new S3Client(cfg);
    } catch (e: any) {
      if (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'MODULE_NOT_FOUND')
        throw new Error('AWS SDK not installed. Run: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner');
      throw e;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch { return false; }
  }

  async upload(key: string, data: Buffer | string, options?: UploadOptions): Promise<StorageObject> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const buf = toBuf(data);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: buf,
      ContentType: options?.contentType || 'application/octet-stream',
      Metadata: options?.metadata,
    }));
    return uploadResult(key, buf, options);
  }

  async download(key: string): Promise<Buffer> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<boolean> {
    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch { return false; }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch { return false; }
  }

  async list(prefix: string, options?: ListOptions): Promise<StorageObject[]> {
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const res = await this.client.send(new ListObjectsV2Command({
      Bucket: this.bucket, Prefix: prefix,
      MaxKeys: options?.maxKeys || 1000, ContinuationToken: options?.continuationToken,
    }));
    return (res.Contents || []).map((o: any) => ({
      key: o.Key, size: o.Size, etag: o.ETag, lastModified: o.LastModified?.toISOString() || '',
    }));
  }

  async getPresignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSeconds });
  }

  async getPresignedUploadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSeconds });
  }

  async getMetadata(key: string): Promise<StorageObject> {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return {
      key, size: res.ContentLength || 0, etag: res.ETag,
      lastModified: res.LastModified?.toISOString() || '',
      contentType: res.ContentType, metadata: res.Metadata,
    };
  }
}

// ─── GCSStorageProvider ─────────────────────────────────

/**
 * Google Cloud Storage provider.
 *
 * Peer dep: @google-cloud/storage
 */
export class GCSStorageProvider implements StorageProvider {
  readonly type = 'gcs' as const;
  private bucketHandle: any = null;

  async init(config: StorageConfig): Promise<void> {
    if (!config.bucket) throw new Error('GCS bucket is required');
    try {
      const { Storage } = await import('@google-cloud/storage');
      const opts: Record<string, any> = {};
      if (config.projectId) opts.projectId = config.projectId;
      if (config.serviceAccountKey) opts.credentials = JSON.parse(config.serviceAccountKey);
      this.bucketHandle = new Storage(opts).bucket(config.bucket);
    } catch (e: any) {
      if (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'MODULE_NOT_FOUND')
        throw new Error('Google Cloud Storage SDK not installed. Run: npm install @google-cloud/storage');
      throw e;
    }
  }

  async healthCheck(): Promise<boolean> {
    try { const [ok] = await this.bucketHandle.exists(); return ok; }
    catch { return false; }
  }

  async upload(key: string, data: Buffer | string, options?: UploadOptions): Promise<StorageObject> {
    const buf = toBuf(data);
    await this.bucketHandle.file(key).save(buf, {
      contentType: options?.contentType || 'application/octet-stream',
      metadata: options?.metadata ? { metadata: options.metadata } : undefined,
    });
    return uploadResult(key, buf, options);
  }

  async download(key: string): Promise<Buffer> {
    const [contents] = await this.bucketHandle.file(key).download();
    return contents;
  }

  async delete(key: string): Promise<boolean> {
    try { await this.bucketHandle.file(key).delete(); return true; }
    catch { return false; }
  }

  async exists(key: string): Promise<boolean> {
    try { const [ok] = await this.bucketHandle.file(key).exists(); return ok; }
    catch { return false; }
  }

  async list(prefix: string, options?: ListOptions): Promise<StorageObject[]> {
    const qOpts: Record<string, any> = { prefix };
    if (options?.maxKeys) qOpts.maxResults = options.maxKeys;
    if (options?.continuationToken) qOpts.pageToken = options.continuationToken;
    const [files] = await this.bucketHandle.getFiles(qOpts);
    return (files || []).map((f: any) => ({
      key: f.name, size: Number(f.metadata?.size || 0), etag: f.metadata?.etag,
      lastModified: f.metadata?.updated || f.metadata?.timeCreated || '',
      contentType: f.metadata?.contentType,
    }));
  }

  async getPresignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const [url] = await this.bucketHandle.file(key).getSignedUrl({
      action: 'read' as const, expires: Date.now() + expiresInSeconds * 1000,
    });
    return url;
  }

  async getPresignedUploadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const [url] = await this.bucketHandle.file(key).getSignedUrl({
      action: 'write' as const, expires: Date.now() + expiresInSeconds * 1000,
      contentType: 'application/octet-stream',
    });
    return url;
  }

  async getMetadata(key: string): Promise<StorageObject> {
    const [m] = await this.bucketHandle.file(key).getMetadata();
    return {
      key, size: Number(m.size || 0), etag: m.etag,
      lastModified: m.updated || m.timeCreated || '',
      contentType: m.contentType, metadata: m.metadata || {},
    };
  }
}

// ─── AzureBlobStorageProvider ───────────────────────────

/**
 * Azure Blob Storage provider.
 *
 * Peer dep: @azure/storage-blob
 */
export class AzureBlobStorageProvider implements StorageProvider {
  readonly type = 'azure' as const;
  private containerClient: any = null;
  private containerName = '';
  private connectionString = '';

  async init(config: StorageConfig): Promise<void> {
    this.containerName = config.containerName || 'agenticmail';
    this.connectionString = config.connectionString || '';
    if (!this.connectionString) throw new Error('Azure connection string is required');
    try {
      const { BlobServiceClient } = await import('@azure/storage-blob');
      const svc = BlobServiceClient.fromConnectionString(this.connectionString);
      this.containerClient = svc.getContainerClient(this.containerName);
      await this.containerClient.createIfNotExists();
    } catch (e: any) {
      if (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'MODULE_NOT_FOUND')
        throw new Error('Azure Storage SDK not installed. Run: npm install @azure/storage-blob');
      throw e;
    }
  }

  async healthCheck(): Promise<boolean> {
    try { return await this.containerClient.exists(); }
    catch { return false; }
  }

  async upload(key: string, data: Buffer | string, options?: UploadOptions): Promise<StorageObject> {
    const buf = toBuf(data);
    await this.containerClient.getBlockBlobClient(key).upload(buf, buf.length, {
      blobHTTPHeaders: { blobContentType: options?.contentType || 'application/octet-stream' },
      metadata: options?.metadata,
    });
    return uploadResult(key, buf, options);
  }

  async download(key: string): Promise<Buffer> {
    return this.containerClient.getBlockBlobClient(key).downloadToBuffer();
  }

  async delete(key: string): Promise<boolean> {
    try { await this.containerClient.getBlockBlobClient(key).delete(); return true; }
    catch { return false; }
  }

  async exists(key: string): Promise<boolean> {
    try { return await this.containerClient.getBlockBlobClient(key).exists(); }
    catch { return false; }
  }

  async list(prefix: string, options?: ListOptions): Promise<StorageObject[]> {
    const results: StorageObject[] = [];
    const maxKeys = options?.maxKeys || 1000;
    for await (const blob of this.containerClient.listBlobsFlat({ prefix })) {
      results.push({
        key: blob.name, size: blob.properties?.contentLength || 0,
        etag: blob.properties?.etag,
        lastModified: blob.properties?.lastModified?.toISOString() || '',
        contentType: blob.properties?.contentType,
      });
      if (results.length >= maxKeys) break;
    }
    return results;
  }

  async getPresignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return this.generateSasUrl(key, 'r', expiresInSeconds);
  }

  async getPresignedUploadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return this.generateSasUrl(key, 'cw', expiresInSeconds);
  }

  async getMetadata(key: string): Promise<StorageObject> {
    const props = await this.containerClient.getBlockBlobClient(key).getProperties();
    return {
      key, size: props.contentLength || 0, etag: props.etag,
      lastModified: props.lastModified?.toISOString() || '',
      contentType: props.contentType, metadata: props.metadata || {},
    };
  }

  // ── Azure helpers ─────────────────────────────────────

  /**
   * Generate a SAS URL for a blob with the given permission string.
   * Falls back to the direct blob URL if credentials cannot be extracted.
   */
  private async generateSasUrl(key: string, permissions: string, expiresInSeconds: number): Promise<string> {
    const { BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential } =
      await import('@azure/storage-blob');
    const cred = this.extractCredential();
    const blob = this.containerClient.getBlockBlobClient(key);
    if (!cred) return blob.url;

    const sas = generateBlobSASQueryParameters(
      { containerName: this.containerName, blobName: key,
        permissions: BlobSASPermissions.parse(permissions),
        expiresOn: new Date(Date.now() + expiresInSeconds * 1000) },
      new StorageSharedKeyCredential(cred.accountName, cred.accountKey),
    ).toString();
    return `${blob.url}?${sas}`;
  }

  /** Parse AccountName and AccountKey from a connection string. */
  private extractCredential(): { accountName: string; accountKey: string } | null {
    try {
      const parts: Record<string, string> = {};
      for (const seg of this.connectionString.split(';')) {
        const idx = seg.indexOf('=');
        if (idx > -1) parts[seg.slice(0, idx)] = seg.slice(idx + 1);
      }
      const accountName = parts['AccountName'];
      const accountKey = parts['AccountKey'];
      return accountName && accountKey ? { accountName, accountKey } : null;
    } catch { return null; }
  }
}

// ─── Factory ────────────────────────────────────────────

/**
 * Create a storage provider by type. The returned provider is uninitialized —
 * call `provider.init(config)` before use.
 *
 * @example
 * ```ts
 * const provider = createStorageProvider('s3');
 * await provider.init({ type: 's3', bucket: 'my-bucket', region: 'us-west-2' });
 * await provider.upload('invoices/2024/jan.pdf', pdfBuffer);
 * ```
 */
export function createStorageProvider(type: StorageConfig['type']): StorageProvider {
  switch (type) {
    case 's3':    return new S3StorageProvider();
    case 'gcs':   return new GCSStorageProvider();
    case 'azure': return new AzureBlobStorageProvider();
    case 'local':
    default:      return new LocalStorageProvider();
  }
}
