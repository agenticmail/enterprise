/**
 * BM25F Full-Text Search Engine
 *
 * Comprehensive text relevance scoring with zero dependencies.
 * Extracted as a shared module for use by both the engine memory
 * system and the agent tool memory.
 *
 * Features:
 * - Pre-built inverted index maintained incrementally (no re-indexing on query)
 * - Lightweight Porter-style stemmer (suffix stripping for English)
 * - Field weighting via BM25F: title x3, tags x2, content x1
 * - Pre-computed IDF values updated on index mutations
 * - Prefix matching: "deploy" matches "deployment", "deployments"
 * - Per-agent partitioning for scoped searches
 * - Bigram proximity boost: terms appearing adjacent score higher
 */

// ── BM25 Parameters ──

export const BM25_K1 = 1.2;   // Term frequency saturation
export const BM25_B = 0.75;    // Document length normalization
export const FIELD_WEIGHT_TITLE = 3.0;
export const FIELD_WEIGHT_TAGS = 2.0;
export const FIELD_WEIGHT_CONTENT = 1.0;
export const PREFIX_MATCH_PENALTY = 0.7; // Prefix matches score 70% of exact matches

// ── Stop Words ──

export const STOP_WORDS = new Set([
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

export function stem(word: string): string {
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
export function tokenize(text: string): string[] {
  return text.toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .map(stem);
}

/** Tokenize preserving original (unstemmed) forms alongside stems. */
export function tokenizeWithOriginals(text: string): { stem: string; original: string }[] {
  return text.toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .map((t) => ({ stem: stem(t), original: t }));
}

// ── Inverted Index Data Structures ──

export interface DocRecord {
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
export class MemorySearchIndex {
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
