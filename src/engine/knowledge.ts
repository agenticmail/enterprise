/**
 * Knowledge Base Engine
 *
 * Companies need their agent to know their products, docs, FAQs,
 * internal processes. This engine handles:
 * - Document ingestion (PDF, markdown, HTML, text, CSV)
 * - Chunking and embedding
 * - Semantic search / retrieval (RAG)
 * - Knowledge base CRUD per agent
 *
 * The agent queries this before answering customer questions.
 */

// ─── Types ──────────────────────────────────────────────

export interface KnowledgeBase {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  agentIds: string[];                // Which agents can access this KB
  documents: KBDocument[];
  stats: {
    totalDocuments: number;
    totalChunks: number;
    totalTokens: number;
    lastUpdated: string;
  };
  config: KBConfig;
  createdAt: string;
  updatedAt: string;
}

export interface KBDocument {
  id: string;
  knowledgeBaseId: string;
  name: string;
  sourceType: 'file' | 'url' | 'text' | 'api';
  sourceUrl?: string;
  mimeType: string;
  size: number;                      // Bytes
  chunks: KBChunk[];
  metadata: Record<string, any>;
  status: 'processing' | 'ready' | 'error';
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KBChunk {
  id: string;
  documentId: string;
  content: string;
  tokenCount: number;
  position: number;                  // Order within document
  embedding?: number[];              // Vector embedding
  metadata: {
    section?: string;                // Document section/heading
    page?: number;
    lineStart?: number;
    lineEnd?: number;
  };
}

export interface KBConfig {
  chunkSize: number;                 // Target tokens per chunk (default: 512)
  chunkOverlap: number;             // Overlap tokens between chunks (default: 50)
  embeddingModel: string;           // e.g. "text-embedding-3-small"
  embeddingProvider: 'openai' | 'local' | 'none';
  maxResultsPerQuery: number;       // Default: 5
  minSimilarityScore: number;       // Default: 0.7
  autoRefreshUrls: boolean;         // Re-fetch URL sources periodically
  refreshIntervalHours: number;     // Default: 24
}

export interface SearchResult {
  chunk: KBChunk;
  document: KBDocument;
  score: number;                    // Similarity score 0-1
  highlight?: string;               // Relevant excerpt with match highlighted
  content?: string;                 // Convenience: chunk.content
}

// ─── Knowledge Base Engine ──────────────────────────────

import type { EngineDatabase } from './db-adapter.js';

export class KnowledgeBaseEngine {
  private knowledgeBases = new Map<string, KnowledgeBase>();
  private embeddings = new Map<string, number[]>();  // chunkId → embedding
  private engineDb?: EngineDatabase;
  private apiKeys: Record<string, string> = {};

  /** Set API keys (loaded from database) for embedding providers */
  setApiKeys(keys: Record<string, string>) {
    this.apiKeys = keys;
  }

  /**
   * Backfill embeddings for chunks that were imported without them (the
   * `import-manager.ts insertChunk` path used to skip embeddings entirely;
   * the inline-embed fix in 0.5.572 fixes future imports but doesn't
   * retroactively update older un-embedded chunks). Iterates kb_chunks
   * with NULL embedding, batches 100 at a time through OpenAI, writes
   * the embedding column.
   *
   * Returns: { total, embedded, alreadyEmbedded, skipped, errors }.
   */
  async regenerateEmbeddings(kbId: string, opts?: { batchSize?: number; onProgress?: (done: number, total: number) => void }): Promise<{ total: number; embedded: number; alreadyEmbedded: number; skipped: number; errors: number }> {
    if (!this.engineDb) throw new Error('regenerateEmbeddings requires an attached engineDb');
    const kb = this.knowledgeBases.get(kbId) || await this.engineDb.getKnowledgeBase(kbId);
    if (!kb) throw new Error(`Knowledge base not found: ${kbId}`);

    const apiKey = this.apiKeys.openai || this.apiKeys['openai-official'];
    if (!apiKey) throw new Error('No OpenAI API key wired to KnowledgeBaseEngine. Add one in Settings → Models & API Keys, then restart enterprise.');

    const batchSize = opts?.batchSize ?? 100;

    // Pull every chunk in this KB that has no embedding yet. Doing this at
    // the DB layer (rather than walking in-memory kb.documents[].chunks[])
    // because the in-memory snapshot might be stale relative to the DB
    // immediately after a fresh import.
    const rows = await this.engineDb.query<any>(
      `SELECT c.id AS id, c.content AS content
       FROM kb_chunks c
       JOIN kb_documents d ON c.document_id = d.id
       WHERE d.knowledge_base_id = $1 AND c.embedding IS NULL
       ORDER BY c.id`,
      [kbId]
    );

    const totalAlready = await this.engineDb.query<any>(
      `SELECT count(*)::int AS n FROM kb_chunks c JOIN kb_documents d ON c.document_id = d.id WHERE d.knowledge_base_id = $1 AND c.embedding IS NOT NULL`,
      [kbId]
    );
    const alreadyEmbedded = totalAlready[0]?.n ?? 0;

    let embedded = 0, errors = 0, skipped = 0;
    const total = rows.length;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      try {
        const resp = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: (kb.config?.embeddingModel) || 'text-embedding-3-small',
            input: batch.map((c: any) => c.content),
          }),
        });
        if (!resp.ok) {
          const msg = await resp.text();
          console.error(`[knowledge] regenerateEmbeddings: OpenAI ${resp.status} — ${msg.slice(0, 200)}`);
          errors += batch.length;
          continue;
        }
        const data = await resp.json() as any;
        for (let j = 0; j < batch.length; j++) {
          try {
            const vec = data.data[j].embedding;
            await this.engineDb.run(
              `UPDATE kb_chunks SET embedding = $1 WHERE id = $2`,
              [JSON.stringify(vec), batch[j].id]
            );
            this.embeddings.set(batch[j].id, vec);
            embedded++;
          } catch (err: any) {
            console.error(`[knowledge] regenerateEmbeddings: UPDATE failed for chunk ${batch[j].id}: ${err.message}`);
            skipped++;
          }
        }
      } catch (err: any) {
        console.error(`[knowledge] regenerateEmbeddings: batch failed: ${err.message}`);
        errors += batch.length;
      }
      if (opts?.onProgress) {
        try { opts.onProgress(embedded, total); } catch {}
      }
    }

    // Reload the KB so in-memory documents pick up the new embeddings
    if (this.engineDb) {
      try {
        const fresh = await this.engineDb.getKnowledgeBase(kbId);
        if (fresh) this.knowledgeBases.set(kbId, fresh);
      } catch {}
    }

    console.log(`[knowledge] regenerateEmbeddings("${kb.name}"): embedded=${embedded} alreadyEmbedded=${alreadyEmbedded} errors=${errors} skipped=${skipped}`);
    return { total, embedded, alreadyEmbedded, skipped, errors };
  }

  /**
   * Startup health-check: report KBs that have chunks but no embeddings.
   * Designed to be loud in the boot log so operators don't silently
   * deploy with a dead RAG. Logs to stdout; never throws.
   */
  async warnAboutMissingEmbeddings(): Promise<void> {
    if (!this.engineDb) return;
    try {
      // FILTER (WHERE …) is PostgreSQL-only and isn't supported by the
      // generic engineDb adapter (it strips the syntax on sqlite-style
      // dialects and the query throws on Postgres because the adapter
      // doesn't recognize it). Use a portable CASE WHEN aggregate instead.
      const rows = await this.engineDb.query<any>(
        `SELECT d.knowledge_base_id AS kb_id,
                SUM(CASE WHEN c.embedding IS NULL THEN 1 ELSE 0 END) AS missing,
                COUNT(*) AS total
         FROM kb_chunks c
         JOIN kb_documents d ON c.document_id = d.id
         GROUP BY d.knowledge_base_id`
      );
      for (const r of rows) {
        if (r.missing > 0) {
          const kb = this.knowledgeBases.get(r.kb_id);
          const name = kb?.name || r.kb_id;
          const provider = kb?.config?.embeddingProvider || 'openai';
          const haveKey = !!(this.apiKeys[provider] || this.apiKeys['openai-official']);
          console.warn(`[knowledge] ⚠️  KB "${name}" has ${r.missing}/${r.total} chunks WITHOUT embeddings.`);
          console.warn(`[knowledge]    Embedding provider: ${provider}  (key ${haveKey ? 'present' : 'MISSING'})`);
          console.warn(`[knowledge]    RAG search will return 0 hits until embeddings are generated.`);
          if (haveKey) {
            console.warn(`[knowledge]    Fix: POST /api/engine/knowledge-bases/${r.kb_id}/regenerate-embeddings`);
          } else {
            console.warn(`[knowledge]    Fix: add ${provider} key in Settings → Models & API Keys, then call regenerate-embeddings.`);
          }
        }
      }
    } catch (err: any) {
      // Health check failures are non-fatal; the tables might not exist on
      // a fresh DB before the first import.
      console.log(`[knowledge] warnAboutMissingEmbeddings: ${err.message}`);
    }
  }

  /**
   * Set the database adapter and load existing knowledge bases from DB
   */
  async setDb(db: EngineDatabase): Promise<void> {
    this.engineDb = db;
    await this.loadFromDb();
  }

  /**
   * Load all knowledge bases from DB into memory
   */
  private async loadFromDb(): Promise<void> {
    if (!this.engineDb) return;
    try {
      const rows = await this.engineDb.query<any>('SELECT id FROM knowledge_bases');
      console.log(`[knowledge] loadFromDb: found ${rows.length} knowledge bases in DB`);
      for (const row of rows) {
        const kb = await this.engineDb.getKnowledgeBase(row.id);
        if (kb) {
          this.knowledgeBases.set(kb.id, kb);
          console.log(`[knowledge] Loaded KB "${kb.name}" (${kb.id}) with ${kb.documents.length} docs`);
          // Load embeddings into memory
          for (const doc of kb.documents) {
            for (const chunk of doc.chunks) {
              if (chunk.embedding) {
                this.embeddings.set(chunk.id, chunk.embedding);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error('[knowledge] loadFromDb error:', err.message);
    }
  }

  /**
   * Create a new knowledge base
   */
  createKnowledgeBase(orgId: string, opts: {
    name: string;
    description?: string;
    agentIds?: string[];
    config?: Partial<KBConfig>;
  }): KnowledgeBase {
    const kb: KnowledgeBase = {
      id: crypto.randomUUID(),
      orgId,
      name: opts.name,
      description: opts.description,
      agentIds: opts.agentIds || [],
      documents: [],
      stats: { totalDocuments: 0, totalChunks: 0, totalTokens: 0, lastUpdated: new Date().toISOString() },
      config: {
        chunkSize: 512,
        chunkOverlap: 50,
        embeddingModel: 'text-embedding-3-small',
        embeddingProvider: 'openai',
        maxResultsPerQuery: 5,
        minSimilarityScore: 0.7,
        autoRefreshUrls: false,
        refreshIntervalHours: 24,
        ...opts.config,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.knowledgeBases.set(kb.id, kb);
    this.engineDb?.upsertKnowledgeBase(kb).catch((err) => {
      console.error(`[knowledge] Failed to persist knowledge base ${kb.id}:`, err);
    });
    return kb;
  }

  /**
   * Ingest a document into a knowledge base
   */
  async ingestDocument(kbId: string, opts: {
    name: string;
    content: string;
    sourceType: KBDocument['sourceType'];
    sourceUrl?: string;
    mimeType?: string;
    metadata?: Record<string, any>;
  }): Promise<KBDocument> {
    const kb = this.knowledgeBases.get(kbId);
    if (!kb) throw new Error(`Knowledge base ${kbId} not found`);

    const doc: KBDocument = {
      id: crypto.randomUUID(),
      knowledgeBaseId: kbId,
      name: opts.name,
      sourceType: opts.sourceType,
      sourceUrl: opts.sourceUrl,
      mimeType: opts.mimeType || 'text/plain',
      size: Buffer.byteLength(opts.content, 'utf-8'),
      chunks: [],
      metadata: opts.metadata || {},
      status: 'processing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      // Extract text based on format
      const text = this.extractText(opts.content, doc.mimeType);

      // Chunk the text
      const chunks = this.chunkText(text, doc.id, kb.config);
      doc.chunks = chunks;

      // Generate embeddings
      if (kb.config.embeddingProvider !== 'none') {
        await this.generateEmbeddings(chunks, kb.config);
      }

      doc.status = 'ready';

      // Update KB stats
      kb.documents.push(doc);
      kb.stats.totalDocuments = kb.documents.length;
      kb.stats.totalChunks = kb.documents.reduce((sum, d) => sum + d.chunks.length, 0);
      kb.stats.totalTokens = kb.documents.reduce((sum, d) =>
        sum + d.chunks.reduce((cs, c) => cs + c.tokenCount, 0), 0);
      kb.stats.lastUpdated = new Date().toISOString();
      kb.updatedAt = new Date().toISOString();

    } catch (error: any) {
      doc.status = 'error';
      doc.error = error.message;
    }

    // Persist doc and updated KB to DB
    if (this.engineDb) {
      this.engineDb.insertKBDocument(doc).catch((err) => {
        console.error(`[knowledge] Failed to persist document ${doc.id}:`, err);
      });
      this.engineDb.upsertKnowledgeBase(kb).catch((err) => {
        console.error(`[knowledge] Failed to persist KB after document ingest:`, err);
      });
    }

    return doc;
  }

  /**
   * Search across knowledge bases for an agent
   */
  /**
   * List all knowledge bases accessible to a given agent
   */
  async listForAgent(agentId: string): Promise<KnowledgeBase[]> {
    return Array.from(this.knowledgeBases.values()).filter(kb => {
      const ids = Array.isArray(kb.agentIds) ? kb.agentIds : [];
      return ids.includes(agentId);
    });
  }

  async search(agentId: string, query: string, opts?: {
    kbIds?: string[];
    maxResults?: number;
    minScore?: number;
    limit?: number;
  }): Promise<SearchResult[]> {
    // Find all KBs this agent has access to
    const kbs = Array.from(this.knowledgeBases.values()).filter(kb => {
      if (opts?.kbIds?.length) return opts.kbIds.includes(kb.id);
      const ids = Array.isArray(kb.agentIds) ? kb.agentIds : [];
      return ids.includes(agentId);
    });

    if (kbs.length === 0) return [];

    const maxResults = opts?.maxResults || 5;
    const minScore = opts?.minScore || 0.7;

    // Get query embedding
    const queryEmbedding = await this.getEmbedding(query, kbs[0].config);

    // Search all chunks across all accessible KBs
    const results: SearchResult[] = [];

    for (const kb of kbs) {
      for (const doc of kb.documents) {
        if (doc.status !== 'ready') continue;

        for (const chunk of doc.chunks) {
          let score: number;

          if (queryEmbedding && chunk.embedding) {
            // Vector similarity search
            score = this.cosineSimilarity(queryEmbedding, chunk.embedding);
          } else {
            // Fallback: keyword matching
            score = this.keywordScore(query, chunk.content);
          }

          if (score >= minScore) {
            results.push({
              chunk,
              document: doc,
              score,
              highlight: this.extractHighlight(query, chunk.content),
            });
          }
        }
      }
    }

    // Sort by score, return top N
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  /**
   * Generate context string for an agent's prompt (RAG injection)
   */
  async getContext(agentId: string, query: string, maxTokens: number = 2000): Promise<string> {
    const results = await this.search(agentId, query);
    if (results.length === 0) return '';

    let context = '## Relevant Knowledge Base Context\n\n';
    let tokenCount = 0;

    for (const result of results) {
      const chunkTokens = result.chunk.tokenCount;
      if (tokenCount + chunkTokens > maxTokens) break;

      context += `### From: ${result.document.name}`;
      if (result.chunk.metadata.section) context += ` > ${result.chunk.metadata.section}`;
      context += `\n${result.chunk.content}\n\n`;
      tokenCount += chunkTokens;
    }

    return context;
  }

  // ─── CRUD ───────────────────────────────────────────

  getKnowledgeBase(id: string): KnowledgeBase | undefined {
    return this.knowledgeBases.get(id);
  }

  /** Reload a single KB from DB (call after external writes like imports). */
  async reloadKnowledgeBase(id: string): Promise<void> {
    if (!this.engineDb) return;
    const kb = await this.engineDb.getKnowledgeBase(id);
    if (kb) this.knowledgeBases.set(kb.id, kb);
  }

  getAllKnowledgeBases(): KnowledgeBase[] {
    return Array.from(this.knowledgeBases.values());
  }

  getKnowledgeBasesByOrg(orgId: string): KnowledgeBase[] {
    return Array.from(this.knowledgeBases.values()).filter(kb => kb.orgId === orgId);
  }

  getKnowledgeBasesForAgent(agentId: string): KnowledgeBase[] {
    return Array.from(this.knowledgeBases.values()).filter(kb => {
      const ids = Array.isArray(kb.agentIds) ? kb.agentIds : [];
      return ids.includes(agentId);
    });
  }

  deleteDocument(kbId: string, docId: string): boolean {
    const kb = this.knowledgeBases.get(kbId);
    if (!kb) return false;
    const idx = kb.documents.findIndex(d => d.id === docId);
    if (idx < 0) return false;

    // Remove embeddings for chunks
    for (const chunk of kb.documents[idx].chunks) {
      this.embeddings.delete(chunk.id);
    }

    const removedDoc = kb.documents[idx];
    kb.documents.splice(idx, 1);
    kb.stats.totalDocuments = kb.documents.length;
    kb.stats.totalChunks = kb.documents.reduce((sum, d) => sum + d.chunks.length, 0);
    kb.updatedAt = new Date().toISOString();

    // Persist to DB
    if (this.engineDb) {
      this.engineDb.deleteKBDocument(removedDoc.id).catch((err) => {
        console.error(`[knowledge] Failed to delete document ${removedDoc.id} from DB:`, err);
      });
      this.engineDb.upsertKnowledgeBase(kb).catch((err) => {
        console.error(`[knowledge] Failed to persist KB after document deletion:`, err);
      });
    }

    return true;
  }

  deleteKnowledgeBase(id: string): boolean {
    const deleted = this.knowledgeBases.delete(id);
    if (deleted) {
      this.engineDb?.deleteKnowledgeBase(id).catch((err) => {
        console.error(`[knowledge] Failed to delete knowledge base ${id} from DB:`, err);
      });
    }
    return deleted;
  }

  // ─── Text Processing ─────────────────────────────────

  private extractText(content: string, mimeType: string): string {
    // For now, handle plain text and markdown directly
    // PDF, DOCX, etc. would need additional parsers
    switch (mimeType) {
      case 'text/html':
        // Strip HTML tags
        return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      case 'text/csv':
        // Convert CSV rows to readable text
        return content.split('\n').map(row => row.replace(/,/g, ' | ')).join('\n');
      default:
        return content;
    }
  }

  private chunkText(text: string, documentId: string, config: KBConfig): KBChunk[] {
    const chunks: KBChunk[] = [];
    const sentences = this.splitIntoSentences(text);
    let currentChunk = '';
    let currentTokens = 0;
    let position = 0;
    let currentSection: string | undefined;

    for (const sentence of sentences) {
      // Detect section headings
      const headingMatch = sentence.match(/^#+\s+(.+)$/);
      if (headingMatch) {
        currentSection = headingMatch[1];
      }

      const sentenceTokens = this.estimateTokens(sentence);

      if (currentTokens + sentenceTokens > config.chunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          id: crypto.randomUUID(),
          documentId,
          content: currentChunk.trim(),
          tokenCount: currentTokens,
          position: position++,
          metadata: { section: currentSection },
        });

        // Start new chunk with overlap
        const overlapText = this.getOverlapText(currentChunk, config.chunkOverlap);
        currentChunk = overlapText + ' ' + sentence;
        currentTokens = this.estimateTokens(currentChunk);
      } else {
        currentChunk += ' ' + sentence;
        currentTokens += sentenceTokens;
      }
    }

    // Don't forget the last chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        id: crypto.randomUUID(),
        documentId,
        content: currentChunk.trim(),
        tokenCount: currentTokens,
        position: position,
        metadata: { section: currentSection },
      });
    }

    return chunks;
  }

  private splitIntoSentences(text: string): string[] {
    // Split on sentence boundaries, keeping headings together
    return text.split(/(?<=[.!?])\s+|(?=^#+\s)/m).filter(s => s.trim().length > 0);
  }

  private estimateTokens(text: string): number {
    // Rough estimate: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  }

  private getOverlapText(text: string, overlapTokens: number): string {
    const words = text.split(/\s+/);
    const overlapWords = Math.ceil(overlapTokens * 0.75); // ~0.75 words per token
    return words.slice(-overlapWords).join(' ');
  }

  // ─── Embeddings ─────────────────────────────────────

  private async generateEmbeddings(chunks: KBChunk[], config: KBConfig) {
    if (config.embeddingProvider === 'openai') {
      const apiKey = this.apiKeys.openai || this.apiKeys['openai-official'];
      if (!apiKey) return; // Skip if no API key

      // Batch embeddings (OpenAI supports up to 2048 inputs)
      const batchSize = 100;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        try {
          const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: config.embeddingModel,
              input: batch.map(c => c.content),
            }),
          });

          if (response.ok) {
            const data = await response.json() as any;
            for (let j = 0; j < data.data.length; j++) {
              batch[j].embedding = data.data[j].embedding;
              this.embeddings.set(batch[j].id, data.data[j].embedding);
            }
          }
        } catch { /* skip embedding on error */ }
      }
    }
  }

  private async getEmbedding(text: string, config: KBConfig): Promise<number[] | null> {
    if (config.embeddingProvider !== 'openai') return null;

    const apiKey = this.apiKeys.openai || this.apiKeys['openai-official'];
    if (!apiKey) return null;

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: config.embeddingModel, input: text }),
      });
      if (response.ok) {
        const data = await response.json() as any;
        return data.data[0].embedding;
      }
    } catch { /* fall through */ }

    return null;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  private keywordScore(query: string, content: string): number {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const contentLower = content.toLowerCase();
    let matches = 0;
    for (const word of queryWords) {
      if (contentLower.includes(word)) matches++;
    }
    return queryWords.length > 0 ? matches / queryWords.length : 0;
  }

  private extractHighlight(query: string, content: string, maxLength: number = 200): string {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);

    // Find sentence with most keyword matches
    let bestSentence = sentences[0] || content.slice(0, maxLength);
    let bestScore = 0;

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      const score = queryWords.filter(w => lower.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        bestSentence = sentence;
      }
    }

    return bestSentence.trim().slice(0, maxLength) + (bestSentence.length > maxLength ? '...' : '');
  }
}
