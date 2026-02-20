/**
 * Agent Memory Manager -- Persistent Memory & Learning System
 *
 * Provides growing, persistent memory for AI agents that evolves over time,
 * similar to how human employees learn and adapt in an organization.
 *
 * Features:
 * - Category-based memory organization (org_knowledge, interaction_pattern, preference, correction, skill, context, reflection)
 * - Importance levels (critical, high, normal, low)
 * - Confidence scores that decay over time for unaccessed entries
 * - Access tracking for frequently used knowledge
 * - Context generation for injection into agent prompts
 * - Pruning of expired/low-confidence entries
 */

import type { EngineDatabase } from './db-adapter.js';

// ─── Types ──────────────────────────────────────────────

export type MemoryCategory =
  | 'org_knowledge'
  | 'interaction_pattern'
  | 'preference'
  | 'correction'
  | 'skill'
  | 'context'
  | 'reflection';

export type MemoryImportance = 'critical' | 'high' | 'normal' | 'low';

export type MemorySource =
  | 'onboarding'
  | 'interaction'
  | 'admin'
  | 'self_reflection'
  | 'correction';

export const MEMORY_CATEGORIES: Record<MemoryCategory, { label: string; description: string }> = {
  org_knowledge: {
    label: 'Organization Knowledge',
    description: 'Policies, procedures, and organizational information',
  },
  interaction_pattern: {
    label: 'Interaction Patterns',
    description: 'Learned patterns from past interactions',
  },
  preference: {
    label: 'Preferences',
    description: 'User and organizational preferences',
  },
  correction: {
    label: 'Corrections',
    description: 'Corrections and feedback received',
  },
  skill: {
    label: 'Skills',
    description: 'Learned abilities and competencies',
  },
  context: {
    label: 'Context',
    description: 'Contextual information and background knowledge',
  },
  reflection: {
    label: 'Reflections',
    description: 'Self-reflective insights and learnings',
  },
};

export interface AgentMemoryEntry {
  id: string;
  agentId: string;
  orgId: string;
  category: MemoryCategory;
  title: string;
  content: string;
  source: MemorySource;
  importance: MemoryImportance;
  confidence: number; // 0.0-1.0
  accessCount: number;
  lastAccessedAt?: string;
  expiresAt?: string;
  tags: string[];
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryStats {
  totalEntries: number;
  byCategory: Record<string, number>;
  byImportance: Record<string, number>;
  bySource: Record<string, number>;
  avgConfidence: number;
}

/** Input shape for createMemory — id, timestamps, and accessCount are generated automatically. */
export type CreateMemoryInput = Omit<AgentMemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'accessCount'>;

/** Input shape for updateMemory — partial updates merged with existing entry. */
export type UpdateMemoryInput = Partial<Omit<AgentMemoryEntry, 'id' | 'agentId' | 'orgId' | 'createdAt'>>;

/** Query options for filtering memory entries. */
export interface MemoryQueryOptions {
  agentId: string;
  category?: string;
  importance?: string;
  source?: string;
  query?: string;
  limit?: number;
}

/** Minimal policy shape expected by createFromPolicy (matches OrgPolicy fields used). */
export interface PolicyForMemory {
  id: string;
  orgId: string;
  name: string;
  category: string;
  content: string;
  enforcement: string;
}

// ─── Importance Weight Map ──────────────────────────────

const IMPORTANCE_WEIGHT: Record<MemoryImportance, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

// ─── Full-Text Search Engine (BM25F + Stemming + Inverted Index) ─────
//
// Comprehensive text relevance scoring for agent memory retrieval.
// Zero dependencies — pure TypeScript implementation.
//
// Features:
// - Pre-built inverted index maintained incrementally (no re-indexing on query)
// - Lightweight Porter-style stemmer (suffix stripping for English)
// - Field weighting via BM25F: title ×3, tags ×2, content ×1
// - Pre-computed IDF values updated on index mutations
// - Prefix matching: "deploy" matches "deployment", "deployments"
// - Per-agent partitioning for scoped searches
// - Bigram proximity boost: terms appearing adjacent score higher

// ── BM25 Parameters ──

const BM25_K1 = 1.2;   // Term frequency saturation
const BM25_B = 0.75;    // Document length normalization
const FIELD_WEIGHT_TITLE = 3.0;
const FIELD_WEIGHT_TAGS = 2.0;
const FIELD_WEIGHT_CONTENT = 1.0;
const PREFIX_MATCH_PENALTY = 0.7; // Prefix matches score 70% of exact matches

// ── Stop Words ──

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an',
  'and', 'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before',
  'being', 'below', 'between', 'both', 'but', 'by', 'can', 'could', 'did',
  'do', 'does', 'doing', 'down', 'during', 'each', 'either', 'every',
  'few', 'for', 'from', 'further', 'get', 'got', 'had', 'has', 'have',
  'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
  'just', 'may', 'me', 'might', 'more', 'most', 'must', 'my', 'myself',
  'neither', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only',
  'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'shall', 'she', 'should', 'so', 'some', 'such', 'than', 'that',
  'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
  'us', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which',
  'while', 'who', 'whom', 'why', 'will', 'with', 'would', 'yet', 'you',
  'your', 'yours', 'yourself', 'yourselves',
]);

// ── Porter Stemmer (lightweight suffix stripping) ──
// Handles common English suffixes to normalize "deployments" → "deploy",
// "running" → "run", "policies" → "polici", "configured" → "configur".
// Not a full Porter stemmer — covers the 80/20 of suffixes that matter most.

const STEM_RULES: [RegExp, string, number][] = [
  // Step 1: plurals and past participles
  [/ies$/, 'i', 3],            // policies → polici,eries → eri
  [/sses$/, 'ss', 4],          // addresses → address
  [/([^s])s$/, '$1', 3],       // items → item, but not "ss"
  [/eed$/, 'ee', 4],           // agreed → agree
  [/ed$/, '', 3],              // configured → configur, but min length 3
  [/ing$/, '', 4],             // running → runn → run (handled below)
  // Step 2: derivational suffixes
  [/ational$/, 'ate', 6],      // relational → relate
  [/tion$/, 't', 5],           // adoption → adopt
  [/ness$/, '', 5],            // awareness → aware
  [/ment$/, '', 5],            // deployment → deploy
  [/able$/, '', 5],            // configurable → configur
  [/ible$/, '', 5],            // accessible → access
  [/ful$/, '', 5],             // powerful → power
  [/ous$/, '', 5],             // dangerous → danger
  [/ive$/, '', 5],             // interactive → interact
  [/ize$/, '', 4],             // normalize → normal
  [/ise$/, '', 4],             // organise → organ
  [/ally$/, '', 5],            // automatically → automat
  [/ly$/, '', 4],              // quickly → quick
  [/er$/, '', 4],              // handler → handl
];

/** Clean up common doubling artifacts after suffix stripping. */
const DOUBLE_CONSONANT = /([^aeiou])\1$/;

function stem(word: string): string {
  if (word.length < 3) return word;
  let stemmed = word;
  for (const [pattern, replacement, minLen] of STEM_RULES) {
    if (stemmed.length >= minLen && pattern.test(stemmed)) {
      stemmed = stemmed.replace(pattern, replacement);
      break; // Apply only the first matching rule
    }
  }
  // Clean doubled consonants: runn → run, configurr → configur
  if (stemmed.length > 2 && DOUBLE_CONSONANT.test(stemmed)) {
    stemmed = stemmed.slice(0, -1);
  }
  return stemmed;
}

// ── Tokenizer ──

/** Tokenize text into stemmed, lowercase terms, filtering stop words. */
function tokenize(text: string): string[] {
  return text.toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .map(stem);
}

/** Tokenize preserving original (unstemmed) forms alongside stems. */
function tokenizeWithOriginals(text: string): { stem: string; original: string }[] {
  return text.toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .map((t) => ({ stem: stem(t), original: t }));
}

// ── Inverted Index Data Structures ──

interface DocRecord {
  /** Weighted term frequencies across all fields: title (3x), tags (2x), content (1x) */
  weightedTf: Map<string, number>;
  /** Total weighted document length (for BM25 length normalization) */
  weightedLen: number;
  /** All unique stems in the document (for prefix matching) */
  allStems: Set<string>;
  /** Ordered list of stems for bigram proximity detection */
  stemSequence: string[];
}

/**
 * Pre-built inverted index for fast text search.
 * Maintained incrementally — no re-indexing needed on queries.
 *
 * Structure:
 *   term → Set<docId>              (posting list — which docs contain this term)
 *   prefixMap: prefix → Set<stem>  (3-char prefixes → full stems for prefix matching)
 *   docs: docId → DocRecord        (per-doc weighted TF and length)
 *   idf: term → number             (pre-computed IDF, refreshed on mutations)
 */
class MemorySearchIndex {
  /** Posting lists: stemmed term → Set of memory IDs containing it */
  private postings = new Map<string, Set<string>>();
  /** Per-document metadata for BM25 scoring */
  private docs = new Map<string, DocRecord>();
  /** Pre-computed IDF values. Stale flag triggers lazy recomputation. */
  private idf = new Map<string, number>();
  private idfStale = true;
  /** 3-character prefix map for prefix matching: prefix → Set of full stems */
  private prefixMap = new Map<string, Set<string>>();
  /** Total weighted document length (for computing average) */
  private totalWeightedLen = 0;

  get docCount(): number { return this.docs.size; }
  get avgDocLen(): number { return this.docs.size > 0 ? this.totalWeightedLen / this.docs.size : 1; }

  /**
   * Index a memory entry. Extracts stems from title, content, and tags
   * with field-specific weighting and builds posting lists.
   */
  addDocument(id: string, entry: { title: string; content: string; tags: string[] }): void {
    // Remove old version if updating
    if (this.docs.has(id)) this.removeDocument(id);

    const titleTokens = tokenize(entry.title);
    const contentTokens = tokenize(entry.content);
    const tagTokens = entry.tags.flatMap((t) => tokenize(t));

    // Build weighted term frequency map
    const weightedTf = new Map<string, number>();
    for (const t of titleTokens) weightedTf.set(t, (weightedTf.get(t) || 0) + FIELD_WEIGHT_TITLE);
    for (const t of tagTokens) weightedTf.set(t, (weightedTf.get(t) || 0) + FIELD_WEIGHT_TAGS);
    for (const t of contentTokens) weightedTf.set(t, (weightedTf.get(t) || 0) + FIELD_WEIGHT_CONTENT);

    const weightedLen = titleTokens.length * FIELD_WEIGHT_TITLE
      + tagTokens.length * FIELD_WEIGHT_TAGS
      + contentTokens.length * FIELD_WEIGHT_CONTENT;

    const allStems = new Set<string>();
    for (const t of weightedTf.keys()) allStems.add(t);

    // Stem sequence for bigram proximity (title first, then content — most important ordering)
    const stemSequence = [...titleTokens, ...contentTokens];

    const docRecord: DocRecord = { weightedTf, weightedLen, allStems, stemSequence };
    this.docs.set(id, docRecord);
    this.totalWeightedLen += weightedLen;

    // Update posting lists
    for (const term of allStems) {
      let posting = this.postings.get(term);
      if (!posting) { posting = new Set(); this.postings.set(term, posting); }
      posting.add(id);

      // Update prefix map (3-char prefixes for prefix matching)
      if (term.length >= 3) {
        const prefix = term.slice(0, 3);
        let prefixSet = this.prefixMap.get(prefix);
        if (!prefixSet) { prefixSet = new Set(); this.prefixMap.set(prefix, prefixSet); }
        prefixSet.add(term);
      }
    }

    this.idfStale = true;
  }

  /** Remove a document from the index. */
  removeDocument(id: string): void {
    const doc = this.docs.get(id);
    if (!doc) return;

    this.totalWeightedLen -= doc.weightedLen;
    this.docs.delete(id);

    // Remove from posting lists
    for (const term of doc.allStems) {
      const posting = this.postings.get(term);
      if (posting) {
        posting.delete(id);
        if (posting.size === 0) {
          this.postings.delete(term);
          // Clean prefix map
          if (term.length >= 3) {
            const prefixSet = this.prefixMap.get(term.slice(0, 3));
            if (prefixSet) { prefixSet.delete(term); if (prefixSet.size === 0) this.prefixMap.delete(term.slice(0, 3)); }
          }
        }
      }
    }

    this.idfStale = true;
  }

  /** Recompute IDF values for all terms. Called lazily before search. */
  private refreshIdf(): void {
    if (!this.idfStale) return;
    const N = this.docs.size;
    this.idf.clear();
    for (const [term, posting] of this.postings) {
      const df = posting.size;
      // BM25 IDF: log((N - df + 0.5) / (df + 0.5) + 1)
      this.idf.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
    }
    this.idfStale = false;
  }

  /**
   * Expand query terms with prefix matches.
   * "deploy" → ["deploy", "deployment", "deploying", ...] (if they exist in the index)
   */
  private expandQueryTerms(queryStems: string[]): Map<string, number> {
    const expanded = new Map<string, number>();

    for (const qs of queryStems) {
      // Exact match always gets full weight
      if (this.postings.has(qs)) {
        expanded.set(qs, Math.max(expanded.get(qs) || 0, 1.0));
      }

      // Prefix expansion: find all stems that start with the query stem (min 3 chars)
      if (qs.length >= 3) {
        const prefix = qs.slice(0, 3);
        const candidates = this.prefixMap.get(prefix);
        if (candidates) {
          for (const candidate of candidates) {
            if (candidate !== qs && candidate.startsWith(qs)) {
              expanded.set(candidate, Math.max(expanded.get(candidate) || 0, PREFIX_MATCH_PENALTY));
            }
          }
        }
      }
    }

    return expanded;
  }

  /**
   * Compute bigram proximity boost: if two query terms appear adjacent
   * in the document's stem sequence, boost the score.
   */
  private bigramProximityBoost(docId: string, queryStems: string[]): number {
    if (queryStems.length < 2) return 0;
    const doc = this.docs.get(docId);
    if (!doc || doc.stemSequence.length < 2) return 0;

    let boost = 0;
    const seq = doc.stemSequence;
    const querySet = new Set(queryStems);

    for (let i = 0; i < seq.length - 1; i++) {
      if (querySet.has(seq[i]) && querySet.has(seq[i + 1]) && seq[i] !== seq[i + 1]) {
        boost += 0.5; // Each adjacent pair of query terms adds 0.5
      }
    }

    return Math.min(boost, 2.0); // Cap at 2.0 bonus
  }

  /**
   * Search the index for documents matching a query.
   * Returns scored results sorted by BM25F relevance.
   *
   * @param query - Raw query string
   * @param candidateIds - Optional: only score these document IDs (for agent-scoped search)
   * @returns Array of { id, score } sorted by descending score
   */
  search(query: string, candidateIds?: Set<string>): Array<{ id: string; score: number }> {
    const queryStems = tokenize(query);
    if (queryStems.length === 0) return [];

    this.refreshIdf();

    const expandedTerms = this.expandQueryTerms(queryStems);
    if (expandedTerms.size === 0) return [];

    const avgDl = this.avgDocLen;

    // Collect candidate document IDs from posting lists
    const candidates = new Set<string>();
    for (const term of expandedTerms.keys()) {
      const posting = this.postings.get(term);
      if (posting) {
        for (const docId of posting) {
          if (!candidateIds || candidateIds.has(docId)) candidates.add(docId);
        }
      }
    }

    // Score each candidate
    const results: Array<{ id: string; score: number }> = [];

    for (const docId of candidates) {
      const doc = this.docs.get(docId);
      if (!doc) continue;

      let score = 0;

      for (const [term, weight] of expandedTerms) {
        const tf = doc.weightedTf.get(term) || 0;
        if (tf === 0) continue;
        const termIdf = this.idf.get(term) || 0;

        // BM25F: IDF × (weightedTF × (k1 + 1)) / (weightedTF + k1 × (1 - b + b × docLen/avgDocLen))
        const numerator = tf * (BM25_K1 + 1);
        const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (doc.weightedLen / avgDl));
        score += termIdf * (numerator / denominator) * weight;
      }

      // Bigram proximity boost
      score += this.bigramProximityBoost(docId, queryStems);

      if (score > 0) results.push({ id: docId, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /** Check if a document exists in the index. */
  has(id: string): boolean { return this.docs.has(id); }
}

// ─── Agent Memory Manager ───────────────────────────────

export class AgentMemoryManager {
  private memories = new Map<string, AgentMemoryEntry>();
  /** Per-agent index: agentId → Set of memory IDs for O(1) agent lookups */
  private agentIndex = new Map<string, Set<string>>();
  /** Full-text search index (BM25F + stemming + inverted index) */
  private searchIndex = new MemorySearchIndex();
  private engineDb?: EngineDatabase;

  // ─── Database Lifecycle ─────────────────────────────

  async setDb(db: EngineDatabase): Promise<void> {
    this.engineDb = db;
    await this.loadFromDb();
  }

  private async loadFromDb(): Promise<void> {
    if (!this.engineDb) return;
    try {
      const rows = await this.engineDb.query<any>('SELECT * FROM agent_memory');
      for (const r of rows) {
        const entry = this.rowToEntry(r);
        this.memories.set(entry.id, entry);
        this.indexAdd(entry.agentId, entry.id);
        this.searchIndex.addDocument(entry.id, entry);
      }
    } catch {
      /* table may not exist yet */
    }
  }

  /** Add a memory ID to the per-agent index. */
  private indexAdd(agentId: string, memoryId: string): void {
    let set = this.agentIndex.get(agentId);
    if (!set) { set = new Set(); this.agentIndex.set(agentId, set); }
    set.add(memoryId);
  }

  /** Remove a memory ID from the per-agent index. */
  private indexRemove(agentId: string, memoryId: string): void {
    const set = this.agentIndex.get(agentId);
    if (set) { set.delete(memoryId); if (set.size === 0) this.agentIndex.delete(agentId); }
  }

  /** Get all memory entries for an agent via the index — O(n) where n is that agent's entries, not total. */
  private getAgentMemories(agentId: string): AgentMemoryEntry[] {
    const ids = this.agentIndex.get(agentId);
    if (!ids || ids.size === 0) return [];
    const result: AgentMemoryEntry[] = [];
    for (const id of ids) {
      const entry = this.memories.get(id);
      if (entry) result.push(entry);
    }
    return result;
  }

  // ─── CRUD Operations ────────────────────────────────

  /**
   * Creates a new memory entry with auto-generated id and timestamps.
   * Persists to both the in-memory Map and the database.
   */
  async createMemory(input: CreateMemoryInput): Promise<AgentMemoryEntry> {
    const now = new Date().toISOString();
    const entry: AgentMemoryEntry = {
      ...input,
      id: crypto.randomUUID(),
      accessCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.memories.set(entry.id, entry);
    this.indexAdd(entry.agentId, entry.id);
    this.searchIndex.addDocument(entry.id, entry);

    await this.engineDb?.execute(
      `INSERT INTO agent_memory (id, agent_id, org_id, category, title, content, source, importance, confidence, access_count, last_accessed_at, expires_at, tags, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id, entry.agentId, entry.orgId, entry.category,
        entry.title, entry.content, entry.source, entry.importance,
        entry.confidence, entry.accessCount, entry.lastAccessedAt || null,
        entry.expiresAt || null, JSON.stringify(entry.tags),
        JSON.stringify(entry.metadata), entry.createdAt, entry.updatedAt,
      ]
    ).catch((err) => {
      console.error('[agent-memory] Failed to persist memory entry:', err);
    });

    return entry;
  }

  /**
   * Updates an existing memory entry by merging provided fields.
   * Returns the updated entry or null if not found.
   */
  async updateMemory(id: string, updates: UpdateMemoryInput): Promise<AgentMemoryEntry | null> {
    const existing = this.memories.get(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: AgentMemoryEntry = {
      ...existing,
      ...updates,
      id: existing.id,
      agentId: existing.agentId,
      orgId: existing.orgId,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    this.memories.set(id, updated);

    // Re-index if text fields changed
    if (updates.title !== undefined || updates.content !== undefined || updates.tags !== undefined) {
      this.searchIndex.addDocument(id, updated);
    }

    await this.engineDb?.execute(
      `UPDATE agent_memory SET
        category = ?, title = ?, content = ?, source = ?,
        importance = ?, confidence = ?, access_count = ?,
        last_accessed_at = ?, expires_at = ?, tags = ?,
        metadata = ?, updated_at = ?
       WHERE id = ?`,
      [
        updated.category, updated.title, updated.content, updated.source,
        updated.importance, updated.confidence, updated.accessCount,
        updated.lastAccessedAt || null, updated.expiresAt || null,
        JSON.stringify(updated.tags), JSON.stringify(updated.metadata),
        updated.updatedAt, id,
      ]
    ).catch((err) => {
      console.error('[agent-memory] Failed to update memory entry:', err);
    });

    return updated;
  }

  /**
   * Deletes a memory entry from both the in-memory Map and the database.
   * Returns true if the entry existed and was deleted.
   */
  async deleteMemory(id: string): Promise<boolean> {
    const entry = this.memories.get(id);
    const existed = this.memories.delete(id);
    if (entry) this.indexRemove(entry.agentId, id);
    this.searchIndex.removeDocument(id);

    await this.engineDb?.execute(
      'DELETE FROM agent_memory WHERE id = ?',
      [id]
    ).catch((err) => {
      console.error('[agent-memory] Failed to delete memory entry:', err);
    });

    return existed;
  }

  /**
   * Retrieves a single memory entry by id.
   * Returns from the in-memory Map (async for interface compatibility).
   */
  async getMemory(id: string): Promise<AgentMemoryEntry | undefined> {
    return this.memories.get(id);
  }

  // ─── Query Operations ───────────────────────────────

  /**
   * Queries memory entries for a specific agent with optional filters.
   * Supports filtering by category, importance, source, and text search on title/content.
   */
  async queryMemories(opts: MemoryQueryOptions): Promise<AgentMemoryEntry[]> {
    let results = this.getAgentMemories(opts.agentId);

    if (opts.category) {
      results = results.filter((m) => m.category === opts.category);
    }

    if (opts.importance) {
      results = results.filter((m) => m.importance === opts.importance);
    }

    if (opts.source) {
      results = results.filter((m) => m.source === opts.source);
    }

    if (opts.query) {
      // Use the pre-built inverted index for BM25F search
      const candidateIds = new Set(results.map((m) => m.id));
      const searchResults = this.searchIndex.search(opts.query, candidateIds);

      if (searchResults.length > 0) {
        // Combine BM25F relevance with importance weight
        const scored = searchResults
          .map((r) => {
            const entry = this.memories.get(r.id);
            return entry ? { entry, score: r.score * IMPORTANCE_WEIGHT[entry.importance] } : null;
          })
          .filter((r): r is { entry: AgentMemoryEntry; score: number } => r !== null);

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, opts.limit || 100).map((d) => d.entry);
      }
    }

    // No query — sort by importance weight descending, then by creation date descending
    results.sort((a, b) => {
      const weightDiff = IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance];
      if (weightDiff !== 0) return weightDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const limit = opts.limit || 100;
    return results.slice(0, limit);
  }

  /**
   * Returns memories created within the last N hours for an agent.
   */
  async getRecentMemories(agentId: string, hours: number = 24): Promise<AgentMemoryEntry[]> {
    const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
    return this.getAgentMemories(agentId)
      .filter((m) => m.createdAt >= cutoff)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // ─── Access Tracking ────────────────────────────────

  /**
   * Increments the access count and updates lastAccessedAt for a memory entry.
   * Used to track frequently referenced knowledge.
   */
  async recordAccess(memoryId: string): Promise<void> {
    const entry = this.memories.get(memoryId);
    if (!entry) return;

    const now = new Date().toISOString();
    entry.accessCount += 1;
    entry.lastAccessedAt = now;
    entry.updatedAt = now;

    await this.engineDb?.execute(
      `UPDATE agent_memory SET access_count = ?, last_accessed_at = ?, updated_at = ? WHERE id = ?`,
      [entry.accessCount, entry.lastAccessedAt, entry.updatedAt, memoryId]
    ).catch((err) => {
      console.error('[agent-memory] Failed to record access:', err);
    });
  }

  // ─── Context Generation ─────────────────────────────

  /**
   * Generates a markdown context string suitable for injection into an agent's system prompt.
   *
   * Ranking strategy:
   * 1. Critical importance entries always come first
   * 2. Remaining entries scored by: confidence * accessWeight * recencyWeight
   * 3. If a query is provided, entries matching query terms get a relevance boost
   * 4. Output is grouped by category with markdown headers
   * 5. Truncated to maxTokens (estimated at ~4 chars per token)
   */
  async generateMemoryContext(
    agentId: string,
    query?: string,
    maxTokens: number = 1500,
  ): Promise<string> {
    const entries = this.getAgentMemories(agentId)
      .filter((m) => m.confidence >= 0.1);

    if (entries.length === 0) return '';

    const now = Date.now();

    // Pre-compute BM25F relevance scores via the inverted index if query provided
    let relevanceMap: Map<string, number> | undefined;
    if (query) {
      const candidateIds = new Set(entries.map((e) => e.id));
      const searchResults = this.searchIndex.search(query, candidateIds);
      if (searchResults.length > 0) {
        relevanceMap = new Map();
        // Normalize scores: divide by max so top result = 1.0
        const maxScore = searchResults[0].score;
        for (const r of searchResults) {
          relevanceMap.set(r.id, maxScore > 0 ? r.score / maxScore : 0);
        }
      }
    }

    // Score each entry for ranking: combines recency, access, confidence, importance, and BM25F relevance
    const scored = entries.map((entry) => {
      // Access weight: logarithmic scaling of access count
      const accessWeight = 1 + Math.log1p(entry.accessCount) * 0.3;

      // Recency weight: entries accessed/created more recently score higher
      const lastTouch = entry.lastAccessedAt || entry.createdAt;
      const ageHours = Math.max(1, (now - new Date(lastTouch).getTime()) / 3600_000);
      const recencyWeight = 1 / (1 + Math.log1p(ageHours / 24) * 0.2);

      // Base score from confidence, access weight, and recency
      let score = entry.confidence * accessWeight * recencyWeight;

      // Importance multiplier
      score *= IMPORTANCE_WEIGHT[entry.importance];

      // BM25F query relevance boost (from pre-built inverted index)
      if (relevanceMap) {
        const relevance = relevanceMap.get(entry.id) || 0;
        if (relevance > 0) {
          // Normalized relevance (0–1) → multiplier (1x–4x boost)
          score *= 1 + relevance * 3;
        }
      }

      return { entry, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Group by category preserving score order
    const grouped = new Map<MemoryCategory, AgentMemoryEntry[]>();
    for (const { entry } of scored) {
      const group = grouped.get(entry.category) || [];
      group.push(entry);
      grouped.set(entry.category, group);
    }

    // Build markdown output
    const maxChars = maxTokens * 4;
    const lines: string[] = ['## Agent Memory', ''];
    let charCount = lines.join('\n').length;

    for (const [category, categoryEntries] of Array.from(grouped.entries())) {
      const meta = MEMORY_CATEGORIES[category];
      if (!meta) continue;

      const header = `### ${meta.label}`;
      if (charCount + header.length + 2 > maxChars) break;

      lines.push(header);
      lines.push('');
      charCount += header.length + 2;

      for (const entry of categoryEntries) {
        const badge = entry.importance === 'critical' ? '[CRITICAL] '
          : entry.importance === 'high' ? '[HIGH] '
          : '';
        const entryLine = `- **${badge}${entry.title}**: ${entry.content}`;

        if (charCount + entryLine.length + 1 > maxChars) break;

        lines.push(entryLine);
        charCount += entryLine.length + 1;
      }

      lines.push('');
      charCount += 1;
    }

    return lines.join('\n').trim();
  }

  // ─── Memory Lifecycle ───────────────────────────────

  /**
   * Decays confidence scores for entries that have not been accessed in 7+ days.
   * Critical importance entries are exempt from decay.
   *
   * @param agentId - The agent whose memories to decay
   * @param decayRate - How much to reduce confidence (default 0.05)
   * @returns Number of entries that were decayed
   */
  async decayConfidence(agentId: string, decayRate: number = 0.05): Promise<number> {
    const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const now = new Date().toISOString();
    const decayed: { id: string; confidence: number }[] = [];

    for (const entry of this.getAgentMemories(agentId)) {
      if (entry.importance === 'critical') continue;

      const lastTouch = entry.lastAccessedAt || entry.createdAt;
      if (lastTouch >= cutoff) continue;

      const newConfidence = Math.max(0, entry.confidence - decayRate);
      if (newConfidence === entry.confidence) continue;

      entry.confidence = parseFloat(newConfidence.toFixed(4));
      entry.updatedAt = now;
      decayed.push({ id: entry.id, confidence: entry.confidence });
    }

    // Batch DB update — single statement per entry but without await-per-row overhead
    if (decayed.length > 0 && this.engineDb) {
      await Promise.all(
        decayed.map((d) =>
          this.engineDb!.execute(
            'UPDATE agent_memory SET confidence = ?, updated_at = ? WHERE id = ?',
            [d.confidence, now, d.id]
          ).catch((err) => console.error('[agent-memory] Failed to decay confidence:', err))
        )
      );
    }

    return decayed.length;
  }

  /**
   * Prunes (deletes) memory entries that are expired or have very low confidence.
   * An entry is pruned if:
   * - confidence < 0.1, OR
   * - expiresAt is set and has passed
   *
   * @param agentId - Optional: limit pruning to a specific agent. If omitted, prunes all.
   * @returns Number of entries pruned
   */
  async pruneExpired(agentId?: string): Promise<number> {
    const now = new Date().toISOString();
    const toDelete: { id: string; agentId: string }[] = [];

    const entries = agentId
      ? this.getAgentMemories(agentId)
      : Array.from(this.memories.values());

    for (const entry of entries) {
      const isLowConfidence = entry.confidence < 0.1;
      const isExpired = entry.expiresAt && entry.expiresAt <= now;

      if (isLowConfidence || isExpired) {
        toDelete.push({ id: entry.id, agentId: entry.agentId });
      }
    }

    // Delete from Map + agent index + search index
    for (const item of toDelete) {
      this.memories.delete(item.id);
      this.indexRemove(item.agentId, item.id);
      this.searchIndex.removeDocument(item.id);
    }

    // Batch DB deletes
    if (toDelete.length > 0 && this.engineDb) {
      await Promise.all(
        toDelete.map((item) =>
          this.engineDb!.execute('DELETE FROM agent_memory WHERE id = ?', [item.id])
            .catch((err) => console.error('[agent-memory] Failed to prune memory entry:', err))
        )
      );
    }

    return toDelete.length;
  }

  // ─── Statistics ─────────────────────────────────────

  /**
   * Returns aggregate statistics for a specific agent's memory entries.
   */
  async getStats(agentId: string): Promise<MemoryStats> {
    return this.computeStats(this.getAgentMemories(agentId));
  }

  /**
   * Returns per-agent memory statistics for all agents in an organization.
   */
  async getStatsByOrg(orgId: string): Promise<Array<{ agentId: string; stats: MemoryStats }>> {
    // Group entries by agentId for the given org
    const agentMap = new Map<string, AgentMemoryEntry[]>();

    for (const entry of this.memories.values()) {
      if (entry.orgId !== orgId) continue;
      const group = agentMap.get(entry.agentId) || [];
      group.push(entry);
      agentMap.set(entry.agentId, group);
    }

    const results: Array<{ agentId: string; stats: MemoryStats }> = [];
    for (const [agentId, entries] of Array.from(agentMap.entries())) {
      results.push({ agentId, stats: this.computeStats(entries) });
    }

    return results;
  }

  /**
   * Computes statistics from a set of memory entries.
   */
  private computeStats(entries: AgentMemoryEntry[]): MemoryStats {
    const byCategory: Record<string, number> = {};
    const byImportance: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let totalConfidence = 0;

    for (const entry of entries) {
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
      byImportance[entry.importance] = (byImportance[entry.importance] || 0) + 1;
      bySource[entry.source] = (bySource[entry.source] || 0) + 1;
      totalConfidence += entry.confidence;
    }

    return {
      totalEntries: entries.length,
      byCategory,
      byImportance,
      bySource,
      avgConfidence: entries.length > 0
        ? parseFloat((totalConfidence / entries.length).toFixed(4))
        : 0,
    };
  }

  // ─── Policy Integration ─────────────────────────────

  /**
   * Creates a memory entry from an organization policy.
   * Used during onboarding to seed agent memory with policy knowledge.
   *
   * Importance is derived from policy enforcement level:
   * - mandatory  -> critical
   * - recommended -> high
   * - informational / other -> normal
   */
  async createFromPolicy(agentId: string, policy: PolicyForMemory): Promise<AgentMemoryEntry> {
    const importance: MemoryImportance =
      policy.enforcement === 'mandatory' ? 'critical'
      : policy.enforcement === 'recommended' ? 'high'
      : 'normal';

    return this.createMemory({
      agentId,
      orgId: policy.orgId,
      category: 'org_knowledge',
      title: policy.name,
      content: policy.content,
      source: 'onboarding',
      importance,
      confidence: 1.0,
      lastAccessedAt: undefined,
      expiresAt: undefined,
      tags: ['policy', policy.category],
      metadata: {
        policyId: policy.id,
        enforcement: policy.enforcement,
      },
    });
  }

  // ─── Row Mapper ─────────────────────────────────────

  /**
   * Converts a database row into an AgentMemoryEntry.
   */
  private rowToEntry(row: any): AgentMemoryEntry {
    return {
      id: row.id,
      agentId: row.agent_id,
      orgId: row.org_id,
      category: row.category as MemoryCategory,
      title: row.title,
      content: row.content,
      source: row.source as MemorySource,
      importance: row.importance as MemoryImportance,
      confidence: row.confidence,
      accessCount: row.access_count || 0,
      lastAccessedAt: row.last_accessed_at || undefined,
      expiresAt: row.expires_at || undefined,
      tags: JSON.parse(row.tags || '[]'),
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
