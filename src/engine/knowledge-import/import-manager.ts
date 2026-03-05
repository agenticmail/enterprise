/**
 * Knowledge Import — Import Manager
 *
 * Orchestrates the full import pipeline:
 *   1. Validate source config
 *   2. Discover documents from source
 *   3. Chunk documents into knowledge entries
 *   4. Import chunks into a knowledge base
 *
 * Tracks job progress and supports cancellation.
 */

import type {
  ImportSourceType, ImportJob, ImportProgress, ImportProvider,
  ImportDocument, ImportSource, ImportChunk,
} from './types.js';
import { chunkDocument } from './chunker.js';
import { processDocument } from './processors/pipeline.js';
import { GitHubImportProvider } from './provider-github.js';
import { SharePointImportProvider } from './provider-sharepoint.js';
import { GoogleSitesImportProvider } from './provider-google-sites.js';
import { UrlImportProvider } from './provider-url.js';
import { FileUploadImportProvider } from './provider-file-upload.js';

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ─── Provider Registry ──────────────────────────────

const PROVIDERS: Record<ImportSourceType, ImportProvider> = {
  'github': new GitHubImportProvider(),
  'sharepoint': new SharePointImportProvider(),
  'google-sites': new GoogleSitesImportProvider(),
  'url': new UrlImportProvider(),
  'file-upload': new FileUploadImportProvider(),
  'confluence': new UrlImportProvider(),  // Uses URL-based import; add dedicated API provider when Confluence OAuth is supported
  'notion': new UrlImportProvider(),      // Uses URL-based import; add dedicated API provider when Notion OAuth is supported
};

// ─── Source Catalog ──────────────────────────────────

const SOURCE_CATALOG: ImportSource[] = [
  {
    type: 'github', label: 'GitHub', icon: 'github',
    description: 'Import README, docs, and markdown files from any GitHub repository.',
    requiresAuth: false,
    configFields: PROVIDERS.github.getConfigFields(),
  },
  {
    type: 'sharepoint', label: 'SharePoint', icon: 'sharepoint',
    description: 'Import documents and pages from Microsoft SharePoint Online sites.',
    requiresAuth: true,
    configFields: PROVIDERS.sharepoint.getConfigFields(),
  },
  {
    type: 'google-sites', label: 'Google Drive / Sites', icon: 'google',
    description: 'Import from Google Drive folders or published Google Sites.',
    requiresAuth: false,
    configFields: PROVIDERS['google-sites'].getConfigFields(),
  },
  {
    type: 'url', label: 'Website / URL', icon: 'globe',
    description: 'Import documentation from any public website, docs site, or URL.',
    requiresAuth: false,
    configFields: PROVIDERS.url.getConfigFields(),
  },
  {
    type: 'file-upload', label: 'File Upload', icon: 'upload',
    description: 'Upload markdown, HTML, TXT, or PDF files directly.',
    requiresAuth: false,
    configFields: PROVIDERS['file-upload'].getConfigFields(),
  },
  {
    type: 'confluence', label: 'Confluence', icon: 'confluence',
    description: 'Import spaces and pages from Atlassian Confluence. (Coming soon)',
    requiresAuth: true,
    configFields: [],
  },
  {
    type: 'notion', label: 'Notion', icon: 'notion',
    description: 'Import pages and databases from Notion workspaces. (Coming soon)',
    requiresAuth: true,
    configFields: [],
  },
];

// ─── Import Manager ──────────────────────────────────

export class KnowledgeImportManager {
  private jobs = new Map<string, ImportJob>();
  private cancelledJobs = new Set<string>();
  private knowledgeContribution?: any;
  private knowledgeEngine?: any; // KnowledgeBaseEngine — for cache refresh
  private db?: any;

  constructor(opts?: { knowledgeContribution?: any }) {
    this.knowledgeContribution = opts?.knowledgeContribution;
  }

  setDb(db: any): void {
    this.db = db;
  }

  setKnowledgeContribution(kc: any): void {
    this.knowledgeContribution = kc;
  }

  setKnowledgeEngine(ke: any): void {
    this.knowledgeEngine = ke;
  }

  /** Get available import sources. */
  getSources(): ImportSource[] {
    return SOURCE_CATALOG;
  }

  /** Get config fields for a specific source type. */
  getSourceConfig(type: ImportSourceType): ImportSource | undefined {
    return SOURCE_CATALOG.find(s => s.type === type);
  }

  /** Validate source config without starting an import. */
  async validateSource(type: ImportSourceType, config: Record<string, any>): Promise<{ valid: boolean; error?: string }> {
    const provider = PROVIDERS[type];
    if (!provider) return { valid: false, error: `Unknown source type: ${type}` };
    return provider.validate(config);
  }

  /** Start an import job. Returns immediately with job ID; import runs in background. */
  async startImport(opts: {
    orgId: string;
    baseId: string;
    sourceType: ImportSourceType;
    sourceConfig: Record<string, any>;
    createdBy?: string;
    categoryId?: string;
  }): Promise<ImportJob> {
    const provider = PROVIDERS[opts.sourceType];
    if (!provider) throw new Error(`Unknown source type: ${opts.sourceType}`);

    // Validate first
    const validation = await provider.validate(opts.sourceConfig);
    if (!validation.valid) throw new Error(validation.error || 'Invalid source configuration');

    const job: ImportJob = {
      id: uid(),
      orgId: opts.orgId,
      baseId: opts.baseId,
      sourceType: opts.sourceType,
      sourceConfig: { ...opts.sourceConfig },
      status: 'pending',
      progress: {
        totalItems: 0,
        processedItems: 0,
        importedItems: 0,
        skippedItems: 0,
        failedItems: 0,
        phase: 'discovering',
      },
      createdBy: opts.createdBy || 'system',
      createdAt: new Date().toISOString(),
    };

    // Don't store sensitive tokens in job record
    delete job.sourceConfig.token;
    delete job.sourceConfig.clientSecret;
    delete job.sourceConfig.accessToken;
    delete job.sourceConfig.serviceAccountKey;

    this.jobs.set(job.id, job);
    await this.persistJob(job);

    // Run import in background
    this.runImport(job, provider, opts.sourceConfig, opts.categoryId).catch(err => {
      job.status = 'failed';
      job.error = err.message;
      job.completedAt = new Date().toISOString();
      this.persistJob(job).catch(() => {});
    });

    return job;
  }

  /** Get job status. */
  getJob(jobId: string): ImportJob | undefined {
    return this.jobs.get(jobId);
  }

  /** List jobs for an org. */
  listJobs(orgId: string, limit: number = 50): ImportJob[] {
    return Array.from(this.jobs.values())
      .filter(j => j.orgId === orgId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  /** Cancel a running job. */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'running') return false;
    this.cancelledJobs.add(jobId);
    job.status = 'cancelled';
    job.completedAt = new Date().toISOString();
    this.persistJob(job).catch(() => {});
    return true;
  }

  // ─── Import Pipeline ──────────────────────────────

  private async runImport(
    job: ImportJob,
    provider: ImportProvider,
    config: Record<string, any>,
    categoryId?: string
  ): Promise<void> {
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    job.progress.phase = 'discovering';
    this.docIdCache.clear();
    this.chunkPosition = 0;

    const documents: ImportDocument[] = [];

    // Phase 1: Discover documents
    try {
      for await (const doc of provider.discover(config)) {
        if (this.cancelledJobs.has(job.id)) return;
        documents.push(doc);
        job.progress.totalItems = documents.length;
        job.progress.currentItem = doc.sourcePath;
      }
    } catch (err: any) {
      job.status = 'failed';
      job.error = `Discovery failed: ${err.message}`;
      job.completedAt = new Date().toISOString();
      return;
    }

    if (documents.length === 0) {
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.progress.phase = 'done';
      return;
    }

    // Phase 2: Process each document through 3-layer pipeline
    job.progress.phase = 'processing';

    for (const doc of documents) {
      if (this.cancelledJobs.has(job.id)) return;

      job.progress.currentItem = doc.sourcePath;

      try {
        // Run 3-layer processing pipeline: EXTRACT → CLEAN → VALIDATE
        const processed = processDocument(doc);

        if (!processed) {
          // Rejected by quality gate
          job.progress.skippedItems++;
          job.progress.processedItems++;
          continue;
        }

        // Log pipeline stats
        const { metadata: meta, quality } = processed;
        console.log(`[knowledge-import] Processed "${processed.title}": ${meta.originalSize}→${meta.cleanedSize} bytes (${(meta.compressionRatio * 100).toFixed(0)}% removed), quality ${quality.score}/100, ${processed.sections.length} sections, ${meta.processingMs}ms`);

        // Chunk sections and import
        job.progress.phase = 'importing';
        let importedForDoc = 0;

        // Also chunk via old chunker for backward compat, but use processed content
        const processedDoc = { ...doc, content: processed.content, contentType: 'text' as const, title: processed.title };
        const chunks = chunkDocument(processedDoc, {
          categoryId: categoryId || 'best-practices',
          confidence: Math.max(0.5, quality.score / 100),
        });

        if (chunks.length === 0) {
          // Fallback: use sections directly
          for (const section of processed.sections) {
            if (this.cancelledJobs.has(job.id)) return;
            try {
              await this.insertChunk(job, {
                documentId: doc.id,
                title: section.title || processed.title,
                content: section.content,
                summary: section.content.slice(0, 200).replace(/\s+\S*$/, '') + '...',
                tags: [],
                categoryId: categoryId || 'best-practices',
                confidence: Math.max(0.5, quality.score / 100),
                sourceUrl: doc.sourceUrl,
                sourcePath: doc.sourcePath,
              });
              importedForDoc++;
            } catch (chunkErr: any) {
              console.error(`[knowledge-import] Section import failed:`, chunkErr?.message || chunkErr);
              job.progress.failedItems++;
            }
          }
        } else {
          for (const chunk of chunks) {
            if (this.cancelledJobs.has(job.id)) return;
            try {
              await this.insertChunk(job, chunk);
              importedForDoc++;
            } catch (chunkErr: any) {
              console.error(`[knowledge-import] Chunk import failed:`, chunkErr?.message || chunkErr);
              job.progress.failedItems++;
            }
          }
        }

        if (importedForDoc > 0) {
          job.progress.importedItems += importedForDoc;
        }
      } catch (docErr: any) {
        console.error(`[knowledge-import] Doc processing failed for ${doc.sourcePath}:`, docErr?.message || docErr);
        job.progress.failedItems++;
      }

      job.progress.processedItems++;
      job.progress.phase = 'processing';
    }

    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.progress.phase = 'done';
    job.progress.currentItem = undefined;
    await this.persistJob(job);

    // Refresh in-memory cache so dashboard sees the new docs immediately
    if (this.knowledgeEngine?.reloadKnowledgeBase) {
      try { await this.knowledgeEngine.reloadKnowledgeBase(job.baseId); } catch { /* non-blocking */ }
    }
  }

  // ─── Document + Chunk Insert (direct DB) ──────────

  private docIdCache = new Map<string, string>();

  /** Ensure a kb_documents row exists for this source document, return its ID. */
  private async ensureDocument(job: ImportJob, chunk: ImportChunk): Promise<string> {
    const key = chunk.documentId;
    if (this.docIdCache.has(key)) return this.docIdCache.get(key)!;

    const docId = uid();
    await this.db!.run(
      `INSERT INTO kb_documents (id, knowledge_base_id, name, source_type, source_url, mime_type, size, metadata, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
      [docId, job.baseId, chunk.title.slice(0, 200), job.sourceType, chunk.sourceUrl || '', 'text/markdown', chunk.content.length,
       JSON.stringify({ sourcePath: chunk.sourcePath, tags: chunk.tags, importJobId: job.id }), 'ready', new Date().toISOString()]
    );
    this.docIdCache.set(key, docId);
    return docId;
  }

  private chunkPosition = 0;

  private async insertChunk(job: ImportJob, chunk: ImportChunk): Promise<void> {
    if (!this.db) throw new Error('No database configured');
    const docId = await this.ensureDocument(job, chunk);
    const chunkId = uid();
    const tokenCount = Math.ceil(chunk.content.length / 4); // rough estimate
    await this.db.run(
      `INSERT INTO kb_chunks (id, document_id, content, token_count, position, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [chunkId, docId, chunk.content, tokenCount, this.chunkPosition++,
       JSON.stringify({ title: chunk.title, summary: chunk.summary, tags: chunk.tags, sourceUrl: chunk.sourceUrl, sourcePath: chunk.sourcePath })]
    );
  }

  // ─── Persistence ──────────────────────────────────

  private async persistJob(job: ImportJob): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.run(
        `INSERT INTO knowledge_import_jobs (id, org_id, base_id, source_type, status, data, created_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT(id) DO UPDATE SET status=excluded.status, data=excluded.data, completed_at=excluded.completed_at`,
        [job.id, job.orgId, job.baseId, job.sourceType, job.status,
         JSON.stringify({ sourceConfig: job.sourceConfig, progress: job.progress, error: job.error, createdBy: job.createdBy, startedAt: job.startedAt }),
         job.createdAt, job.completedAt || null]
      );
    } catch { /* non-blocking */ }
  }

  /** Load persisted jobs from DB on startup. */
  async loadJobs(): Promise<void> {
    if (!this.db) return;
    try {
      const rows = await this.db.all('SELECT * FROM knowledge_import_jobs ORDER BY created_at DESC LIMIT 100');
      for (const row of rows || []) {
        const data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
        const job: ImportJob = {
          id: row.id,
          orgId: row.org_id,
          baseId: row.base_id,
          sourceType: row.source_type,
          sourceConfig: data.sourceConfig || {},
          status: row.status,
          progress: data.progress || { totalItems: 0, processedItems: 0, importedItems: 0, skippedItems: 0, failedItems: 0, phase: 'done' },
          createdBy: data.createdBy || 'system',
          createdAt: row.created_at,
          startedAt: data.startedAt,
          completedAt: row.completed_at,
          error: data.error,
        };
        this.jobs.set(job.id, job);
      }
    } catch { /* table may not exist yet */ }
  }
}
