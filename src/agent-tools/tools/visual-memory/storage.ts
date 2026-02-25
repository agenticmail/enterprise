/**
 * Visual Memory Storage — Enterprise Centralized Backend
 *
 * Stores visual observations in the enterprise AgentMemoryManager (Postgres + BM25F)
 * alongside textual memories. Visual observations are first-class memory entries
 * with category='visual', searchable by description, labels, and page context.
 *
 * Architecture mirrors the human visual system:
 *
 *   EYES (capture.ts)           → Sensory input: raw pixels from screen/file/camera
 *   RETINA (phash.ts)           → Feature extraction: perceptual hash = visual fingerprint
 *   VISUAL CORTEX (diff.ts)     → Processing: change detection, pattern recognition
 *   HIPPOCAMPUS (this file)     → Memory consolidation: store, index, recall, forget
 *   PREFRONTAL (tools/index.ts) → Executive function: decide what to capture, when to recall
 *
 * Human visual memory characteristics we emulate:
 *   - Selective attention: not everything seen is stored (quality threshold)
 *   - Consolidation: observations link to semantic memory (BM25F searchable)
 *   - Decay: unused visual memories lose confidence over time (same as text memories)
 *   - Recognition: fast visual matching via perceptual hash (like human pattern recognition)
 *   - Context binding: visual memories are bound to context (URL, page title, task, time)
 *   - Gist extraction: thumbnails + descriptions = compressed representation (like human gist memory)
 *
 * Storage is NOT local files. Everything flows through the centralized Postgres DB
 * via AgentMemoryManager, ensuring:
 *   - Multi-agent shared visual knowledge (org-wide visual memory)
 *   - BM25F search across visual descriptions + labels
 *   - Confidence decay + pruning (same lifecycle as text memories)
 *   - Access tracking (frequently recalled visuals stay sharp)
 *   - Audit trail (who saw what, when)
 */

import type { AgentMemoryManager } from '../../../engine/agent-memory.js';
import type { EngineDatabase } from '../../../engine/db-adapter.js';
import type { VisualObservation, VisualMemoryStore, Rect } from './types.js';

// ── In-Memory Cache (Hot Visual Memory — like iconic/working memory) ──

/**
 * Hot cache of recent observations per agent.
 * Mirrors human iconic memory: very recent visual input is instantly available.
 * Older observations are loaded from DB on demand (like long-term memory recall).
 * Max 200 per agent in hot cache (working memory capacity).
 */
const hotCache = new Map<string, Map<number, VisualObservation>>();
const HOT_CACHE_MAX = 200;

function getHotCache(agentId: string): Map<number, VisualObservation> {
  let cache = hotCache.get(agentId);
  if (!cache) { cache = new Map(); hotCache.set(agentId, cache); }
  return cache;
}

function cacheObservation(agentId: string, obs: VisualObservation): void {
  const cache = getHotCache(agentId);
  cache.set(obs.id, obs);
  // Evict oldest if over capacity (like iconic memory fading)
  if (cache.size > HOT_CACHE_MAX) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
}

// ── Next ID tracking (per-agent) ──
const nextIds = new Map<string, number>();

// ── Database Integration ──

let _db: EngineDatabase | null = null;
let _memoryManager: AgentMemoryManager | null = null;
let _migrated = false;

/**
 * Initialize the visual memory storage with enterprise database.
 * Called once during system startup.
 */
export function initVisualStorage(db: EngineDatabase, memoryManager?: AgentMemoryManager): void {
  _db = db;
  _memoryManager = memoryManager || null;
}

/**
 * Ensure the visual_observations table exists.
 * Separate table from agent_memory for binary data (thumbnails, phashes)
 * but linked via memory_link for BM25F search integration.
 */
async function ensureMigrated(): Promise<void> {
  if (_migrated || !_db) return;
  try {
    await _db.execute(`
      CREATE TABLE IF NOT EXISTS visual_observations (
        id SERIAL PRIMARY KEY,
        agent_id TEXT NOT NULL,
        org_id TEXT DEFAULT 'default',
        session_id INTEGER DEFAULT 0,
        timestamp BIGINT NOT NULL,
        source_type TEXT NOT NULL,
        source_json JSONB,
        thumbnail BYTEA,
        phash TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        original_width INTEGER NOT NULL,
        original_height INTEGER NOT NULL,
        quality_score REAL DEFAULT 0.0,
        description TEXT,
        labels JSONB DEFAULT '[]',
        page_title TEXT,
        page_url TEXT,
        memory_link_id TEXT,
        access_count INTEGER DEFAULT 0,
        last_accessed_at TIMESTAMP,
        confidence REAL DEFAULT 0.8,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await _db.execute(`CREATE INDEX IF NOT EXISTS idx_vo_agent_ts ON visual_observations(agent_id, timestamp DESC)`);
    await _db.execute(`CREATE INDEX IF NOT EXISTS idx_vo_phash ON visual_observations(phash)`);
    await _db.execute(`CREATE INDEX IF NOT EXISTS idx_vo_session ON visual_observations(agent_id, session_id)`);
    await _db.execute(`CREATE INDEX IF NOT EXISTS idx_vo_quality ON visual_observations(agent_id, quality_score DESC)`);
    await _db.execute(`CREATE INDEX IF NOT EXISTS idx_vo_memory_link ON visual_observations(memory_link_id)`);
    _migrated = true;
  } catch (err: any) {
    console.error('[visual-memory] Migration failed:', err.message);
  }
}

// ── Core Storage Operations ──

/**
 * Store a visual observation.
 *
 * Two-phase write (mirrors human memory consolidation):
 *   1. Write visual data to visual_observations table (fast, binary-optimized)
 *   2. Create a linked entry in agent_memory (BM25F searchable by description/labels/context)
 *
 * The BM25F entry makes visual memories searchable by natural language queries
 * like "the login page I saw yesterday" or "that dashboard with the error".
 */
export async function addObservation(agentId: string, observation: Omit<VisualObservation, 'id'>, orgId?: string): Promise<number> {
  await ensureMigrated();

  const timestamp = observation.timestamp || Date.now();
  const labels = observation.metadata?.labels || [];
  const description = observation.metadata?.description || '';
  const pageTitle = (observation as any).pageTitle || '';
  const pageUrl = (observation as any).pageUrl || '';

  // Phase 1: Write visual data to dedicated table
  let id = 0;
  if (_db) {
    try {
      const rows = await _db.query<{ id: number }>(
        `INSERT INTO visual_observations
         (agent_id, org_id, session_id, timestamp, source_type, source_json,
          thumbnail, phash, width, height, original_width, original_height,
          quality_score, description, labels, page_title, page_url, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING id`,
        [
          agentId, orgId || 'default', observation.sessionId || 0,
          timestamp, observation.source?.type || 'unknown',
          JSON.stringify(observation.source),
          observation.thumbnail ? Buffer.from(observation.thumbnail, 'base64') : null,
          observation.phash, observation.metadata.width, observation.metadata.height,
          observation.metadata.originalWidth, observation.metadata.originalHeight,
          observation.metadata.qualityScore, description,
          JSON.stringify(labels), pageTitle, pageUrl, 0.8,
        ]
      );
      id = rows[0]?.id || 0;
    } catch (err: any) {
      console.error('[visual-memory] DB insert failed:', err.message);
      // Fallback: use in-memory counter
      const currentNext = nextIds.get(agentId) || 1;
      id = currentNext;
      nextIds.set(agentId, currentNext + 1);
    }
  } else {
    const currentNext = nextIds.get(agentId) || 1;
    id = currentNext;
    nextIds.set(agentId, currentNext + 1);
  }

  // Phase 2: Create linked semantic memory entry (BM25F searchable)
  // This is like the human brain linking a visual memory to semantic meaning.
  // "I saw a red error banner on the dashboard at 3pm" → searchable by "error", "dashboard", "banner"
  if (_memoryManager && (description || labels.length > 0 || pageTitle)) {
    try {
      const semanticContent = [
        description,
        pageTitle ? `Page: ${pageTitle}` : '',
        pageUrl ? `URL: ${pageUrl}` : '',
        labels.length > 0 ? `Tags: ${labels.join(', ')}` : '',
        `Visual observation #${id}`,
      ].filter(Boolean).join('\n');

      const semanticTitle = description
        ? description.slice(0, 80)
        : pageTitle
          ? `Visual: ${pageTitle.slice(0, 70)}`
          : `Visual capture #${id}`;

      const entry = await _memoryManager.createMemory({
        agentId,
        orgId: orgId || 'default',
        category: 'context' as any,
        title: semanticTitle,
        content: semanticContent,
        source: 'interaction' as any,
        importance: 'normal' as any,
        confidence: 0.8,
        tags: ['visual', 'observation', ...labels],
        metadata: {
          visualObservationId: id,
          phash: observation.phash,
          pageUrl,
          pageTitle,
          qualityScore: observation.metadata.qualityScore,
        },
      });

      // Link back: store the memory entry ID on the visual observation
      if (_db && entry.id) {
        await _db.execute(
          `UPDATE visual_observations SET memory_link_id = $1 WHERE id = $2`,
          [entry.id, id]
        ).catch(() => {});
      }
    } catch (err: any) {
      // Non-fatal: visual data is stored even if semantic link fails
      console.warn('[visual-memory] Semantic memory link failed:', err.message);
    }
  }

  // Phase 3: Cache in hot memory (working memory — instant recall)
  const fullObs: VisualObservation = { ...observation, id } as VisualObservation;
  cacheObservation(agentId, fullObs);

  return id;
}

/**
 * Get a single observation by ID.
 * Checks hot cache first (iconic memory), then DB (long-term memory).
 */
export async function getObservation(agentId: string, id: number): Promise<VisualObservation | null> {
  // Hot cache first (working memory — instant)
  const cached = getHotCache(agentId).get(id);
  if (cached) return cached;

  // Long-term recall from DB
  if (!_db) return null;
  await ensureMigrated();

  try {
    const rows = await _db.query<any>(
      `SELECT * FROM visual_observations WHERE id = $1 AND agent_id = $2`,
      [id, agentId]
    );
    if (rows.length === 0) return null;

    const obs = rowToObservation(rows[0]);

    // Record access (like human memory — accessing strengthens the trace)
    await _db.execute(
      `UPDATE visual_observations SET access_count = access_count + 1, last_accessed_at = NOW() WHERE id = $1`,
      [id]
    ).catch(() => {});

    // Bring into hot cache (recently recalled = easily accessible again)
    cacheObservation(agentId, obs);
    return obs;
  } catch (err: any) {
    console.error('[visual-memory] getObservation failed:', err.message);
    return null;
  }
}

/**
 * Query observations with filters.
 * Uses DB for complex queries (like human directed memory search).
 */
export async function queryObservations(
  agentId: string,
  filters: {
    sessionId?: number;
    timeRange?: { start: number; end: number };
    description?: string;
    limit?: number;
    minQuality?: number;
  } = {}
): Promise<VisualObservation[]> {
  if (!_db) {
    // Fallback: search hot cache only
    const cache = getHotCache(agentId);
    let results = Array.from(cache.values());
    if (filters.sessionId !== undefined) results = results.filter(o => o.sessionId === filters.sessionId);
    if (filters.description) {
      const term = filters.description.toLowerCase();
      results = results.filter(o =>
        o.metadata.description?.toLowerCase().includes(term) ||
        o.metadata.labels.some(l => l.toLowerCase().includes(term))
      );
    }
    results.sort((a, b) => b.timestamp - a.timestamp);
    return results.slice(0, filters.limit || 20);
  }

  await ensureMigrated();

  const where: string[] = ['agent_id = $1'];
  const params: any[] = [agentId];
  let paramIdx = 2;

  if (filters.sessionId !== undefined) {
    where.push(`session_id = $${paramIdx++}`);
    params.push(filters.sessionId);
  }
  if (filters.timeRange) {
    where.push(`timestamp >= $${paramIdx++} AND timestamp <= $${paramIdx++}`);
    params.push(filters.timeRange.start, filters.timeRange.end);
  }
  if (filters.description) {
    where.push(`(description ILIKE $${paramIdx} OR labels::text ILIKE $${paramIdx})`);
    params.push(`%${filters.description}%`);
    paramIdx++;
  }
  if (filters.minQuality) {
    where.push(`quality_score >= $${paramIdx++}`);
    params.push(filters.minQuality);
  }

  const limit = filters.limit || 20;
  where.push(`confidence > 0.1`); // Don't return decayed memories

  try {
    const rows = await _db.query<any>(
      `SELECT * FROM visual_observations
       WHERE ${where.join(' AND ')}
       ORDER BY timestamp DESC
       LIMIT $${paramIdx}`,
      [...params, limit]
    );
    return rows.map(rowToObservation);
  } catch (err: any) {
    console.error('[visual-memory] queryObservations failed:', err.message);
    return [];
  }
}

/**
 * Get recent observations (like human "what did I just see?" recall).
 */
export async function getRecentObservations(agentId: string, limit = 10): Promise<VisualObservation[]> {
  return queryObservations(agentId, { limit });
}

/**
 * Get session observations.
 */
export async function getSessionObservations(agentId: string, sessionId: number): Promise<VisualObservation[]> {
  return queryObservations(agentId, { sessionId });
}

/**
 * Get all observations with a specific phash (for similarity search).
 */
export async function getObservationsByPhash(agentId: string): Promise<Array<{ id: number; phash: string; timestamp: number }>> {
  if (!_db) {
    const cache = getHotCache(agentId);
    return Array.from(cache.values()).map(o => ({ id: o.id, phash: o.phash, timestamp: o.timestamp }));
  }

  await ensureMigrated();

  try {
    const rows = await _db.query<any>(
      `SELECT id, phash, timestamp FROM visual_observations
       WHERE agent_id = $1 AND confidence > 0.1
       ORDER BY timestamp DESC LIMIT 500`,
      [agentId]
    );
    return rows.map((r: any) => ({ id: r.id, phash: r.phash, timestamp: r.timestamp }));
  } catch {
    return [];
  }
}

/**
 * Get store statistics.
 */
export async function getStoreStats(agentId: string): Promise<{
  totalObservations: number;
  totalSessions: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
  totalSize: number;
  avgQualityScore: number;
}> {
  if (!_db) {
    const cache = getHotCache(agentId);
    const obs = Array.from(cache.values());
    return {
      totalObservations: obs.length,
      totalSessions: new Set(obs.map(o => o.sessionId)).size,
      oldestTimestamp: obs.length > 0 ? Math.min(...obs.map(o => o.timestamp)) : null,
      newestTimestamp: obs.length > 0 ? Math.max(...obs.map(o => o.timestamp)) : null,
      totalSize: 0,
      avgQualityScore: obs.length > 0 ? obs.reduce((s, o) => s + o.metadata.qualityScore, 0) / obs.length : 0,
    };
  }

  await ensureMigrated();

  try {
    const rows = await _db.query<any>(
      `SELECT
        COUNT(*) as total,
        COUNT(DISTINCT session_id) as sessions,
        MIN(timestamp) as oldest,
        MAX(timestamp) as newest,
        AVG(quality_score) as avg_quality,
        pg_total_relation_size('visual_observations') as table_size
       FROM visual_observations WHERE agent_id = $1 AND confidence > 0.1`,
      [agentId]
    );
    const r = rows[0] || {};
    return {
      totalObservations: parseInt(r.total) || 0,
      totalSessions: parseInt(r.sessions) || 0,
      oldestTimestamp: r.oldest ? parseInt(r.oldest) : null,
      newestTimestamp: r.newest ? parseInt(r.newest) : null,
      totalSize: parseInt(r.table_size) || 0,
      avgQualityScore: parseFloat(r.avg_quality) || 0,
    };
  } catch {
    return { totalObservations: 0, totalSessions: 0, oldestTimestamp: null, newestTimestamp: null, totalSize: 0, avgQualityScore: 0 };
  }
}

/**
 * Decay confidence of old unaccessed visual memories.
 * Like human visual memory fading — if you don't recall it, it weakens.
 */
export async function decayVisualConfidence(agentId: string, decayRate = 0.05): Promise<number> {
  if (!_db) return 0;
  await ensureMigrated();

  try {
    const result = await _db.query<{ count: number }>(
      `WITH decayed AS (
        UPDATE visual_observations
        SET confidence = GREATEST(0, confidence - $3),
            updated_at = NOW()
        WHERE agent_id = $1
          AND (last_accessed_at IS NULL OR last_accessed_at < NOW() - INTERVAL '7 days')
          AND confidence > 0.1
          AND quality_score < 0.8
        RETURNING 1
      ) SELECT COUNT(*) as count FROM decayed`,
      [agentId, /* unused */ null, decayRate]
    );
    return parseInt(String(result[0]?.count)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Load the store metadata for backward compatibility.
 * Returns a minimal VisualMemoryStore shape.
 */
export async function loadStore(agentId: string): Promise<VisualMemoryStore> {
  const stats = await getStoreStats(agentId);
  return {
    observations: [],
    nextId: stats.totalObservations + 1,
    sessionCount: stats.totalSessions,
    createdAt: stats.oldestTimestamp || Date.now(),
    updatedAt: stats.newestTimestamp || Date.now(),
  };
}

/**
 * Save store — no-op in enterprise (DB handles persistence).
 */
export async function saveStore(_agentId: string, store: VisualMemoryStore): Promise<void> {
  // DB-backed: no-op
}

/**
 * Clear hot cache.
 */
export function clearCache(agentId?: string): void {
  if (agentId) hotCache.delete(agentId);
  else hotCache.clear();
}

/**
 * Delete all visual memory for an agent.
 */
export async function deleteStore(agentId: string): Promise<void> {
  clearCache(agentId);
  if (_db) {
    await _db.execute(`DELETE FROM visual_observations WHERE agent_id = $1`, [agentId]).catch(() => {});
  }
}

// ── Row Mapper ──

function rowToObservation(row: any): VisualObservation {
  const source = typeof row.source_json === 'string' ? JSON.parse(row.source_json) : (row.source_json || { type: row.source_type });
  const labels = typeof row.labels === 'string' ? JSON.parse(row.labels) : (row.labels || []);
  return {
    id: row.id,
    timestamp: parseInt(row.timestamp),
    sessionId: row.session_id || 0,
    source,
    phash: row.phash,
    thumbnail: row.thumbnail ? (Buffer.isBuffer(row.thumbnail) ? row.thumbnail.toString('base64') : row.thumbnail) : '',
    metadata: {
      width: row.width,
      height: row.height,
      originalWidth: row.original_width,
      originalHeight: row.original_height,
      labels,
      description: row.description || undefined,
      qualityScore: parseFloat(row.quality_score) || 0,
    },
    memoryLink: row.memory_link_id ? parseInt(row.memory_link_id) : undefined,
  };
}
