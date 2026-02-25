/**
 * Visual Memory Store — persistent storage for visual observations.
 * 
 * Per-agent visual memory backed by the database.
 * Each agent has its own observation history, queryable by time, similarity, session, or description.
 */

import { VisualObservation, VisionQuery, SimilarityMatch, CaptureSource, ObservationMeta } from './types.js';
import { perceptualHash, hashSimilarity, generateThumbnail, getImageDimensions } from './phash.js';

export interface StoreOptions {
  db: {
    run(sql: string, params?: any[]): Promise<void>;
    get<T = any>(sql: string, params?: any[]): Promise<T | undefined>;
    all<T = any>(sql: string, params?: any[]): Promise<T[]>;
  };
  maxObservationsPerAgent?: number;  // default 5000
}

export class VisualMemoryStore {
  private db: StoreOptions['db'];
  private maxPerAgent: number;
  private migrated = false;

  constructor(opts: StoreOptions) {
    this.db = opts.db;
    this.maxPerAgent = opts.maxObservationsPerAgent || 5000;
  }

  async migrate(): Promise<void> {
    if (this.migrated) return;
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS visual_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        session_id TEXT,
        timestamp BIGINT NOT NULL,
        source_type TEXT NOT NULL,
        source_json TEXT,
        thumbnail BLOB,
        phash TEXT,
        width INTEGER,
        height INTEGER,
        original_width INTEGER,
        original_height INTEGER,
        quality_score REAL DEFAULT 0,
        page_title TEXT,
        page_url TEXT,
        description TEXT,
        labels TEXT DEFAULT '[]',
        memory_link TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_vo_agent ON visual_observations(agent_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_vo_ts ON visual_observations(agent_id, timestamp DESC)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_vo_phash ON visual_observations(phash)`);
    this.migrated = true;
  }

  /**
   * Capture and store a visual observation from raw image data.
   */
  async capture(
    agentId: string,
    imageData: Buffer | string,
    opts: {
      source: CaptureSource;
      sessionId?: string;
      description?: string;
      labels?: string[];
      pageTitle?: string;
      pageUrl?: string;
      memoryLink?: string;
    }
  ): Promise<VisualObservation> {
    await this.migrate();

    const [phash, thumbnail, dims] = await Promise.all([
      perceptualHash(imageData),
      generateThumbnail(imageData),
      getImageDimensions(imageData),
    ]);

    const now = Date.now();
    const qualityScore = computeQuality(dims.width, dims.height, opts.description, opts.labels);

    const result = await this.db.get<{ id: number }>(
      `INSERT INTO visual_observations 
       (agent_id, session_id, timestamp, source_type, source_json, thumbnail, phash,
        width, height, original_width, original_height, quality_score,
        page_title, page_url, description, labels, memory_link)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        agentId, opts.sessionId || null, now,
        opts.source.type, JSON.stringify(opts.source),
        thumbnail, phash,
        Math.min(dims.width, 320), Math.min(dims.height, 320),
        dims.width, dims.height, qualityScore,
        opts.pageTitle || null, opts.pageUrl || null,
        opts.description || null, JSON.stringify(opts.labels || []),
        opts.memoryLink || null,
      ]
    );

    // Enforce max per agent
    await this.db.run(
      `DELETE FROM visual_observations WHERE agent_id = ? AND id NOT IN (
        SELECT id FROM visual_observations WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?
      )`,
      [agentId, agentId, this.maxPerAgent]
    );

    const obs: VisualObservation = {
      id: result?.id || 0,
      agentId,
      sessionId: opts.sessionId,
      timestamp: now,
      source: opts.source,
      thumbnail,
      phash,
      metadata: {
        width: Math.min(dims.width, 320),
        height: Math.min(dims.height, 320),
        originalWidth: dims.width,
        originalHeight: dims.height,
        qualityScore,
        pageTitle: opts.pageTitle,
        pageUrl: opts.pageUrl,
      },
      description: opts.description,
      labels: opts.labels || [],
      memoryLink: opts.memoryLink,
    };

    return obs;
  }

  /**
   * Find visually similar observations using perceptual hash.
   */
  async findSimilar(agentId: string, phash: string, limit = 5, minSimilarity = 0.75): Promise<SimilarityMatch[]> {
    await this.migrate();
    const rows = await this.db.all<any>(
      `SELECT * FROM visual_observations WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 500`,
      [agentId]
    );

    const matches: SimilarityMatch[] = [];
    for (const row of rows) {
      if (!row.phash) continue;
      const sim = hashSimilarity(phash, row.phash);
      if (sim >= minSimilarity) {
        matches.push({ id: row.id, similarity: sim, observation: this.mapRow(row) });
      }
    }

    matches.sort((a, b) => b.similarity - a.similarity);
    return matches.slice(0, limit);
  }

  /**
   * Query observations by time, session, description, etc.
   */
  async query(q: VisionQuery): Promise<VisualObservation[]> {
    await this.migrate();
    const where: string[] = ['agent_id = ?'];
    const params: any[] = [q.agentId];

    if (q.sessionId) { where.push('session_id = ?'); params.push(q.sessionId); }
    if (q.description) { where.push('description LIKE ?'); params.push(`%${q.description}%`); }
    if (q.timeRange) {
      where.push('timestamp >= ? AND timestamp <= ?');
      params.push(q.timeRange.start, q.timeRange.end);
    }
    if (q.minQuality) { where.push('quality_score >= ?'); params.push(q.minQuality); }

    const limit = q.limit || 20;
    const rows = await this.db.all<any>(
      `SELECT * FROM visual_observations WHERE ${where.join(' AND ')} ORDER BY timestamp DESC LIMIT ?`,
      [...params, limit]
    );

    return rows.map(r => this.mapRow(r));
  }

  /**
   * Get a single observation by ID.
   */
  async get(id: number): Promise<VisualObservation | null> {
    await this.migrate();
    const row = await this.db.get<any>(`SELECT * FROM visual_observations WHERE id = ?`, [id]);
    return row ? this.mapRow(row) : null;
  }

  /**
   * Get the most recent observations.
   */
  async recent(agentId: string, limit = 10): Promise<VisualObservation[]> {
    await this.migrate();
    const rows = await this.db.all<any>(
      `SELECT * FROM visual_observations WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?`,
      [agentId, limit]
    );
    return rows.map(r => this.mapRow(r));
  }

  /**
   * Link an observation to an agent memory node.
   */
  async linkToMemory(id: number, memoryLink: string): Promise<void> {
    await this.migrate();
    await this.db.run(`UPDATE visual_observations SET memory_link = ? WHERE id = ?`, [memoryLink, id]);
  }

  /**
   * Get stats for an agent.
   */
  async stats(agentId: string): Promise<{ total: number; sessions: number; oldest?: number; newest?: number }> {
    await this.migrate();
    const row = await this.db.get<any>(
      `SELECT COUNT(*) as total, COUNT(DISTINCT session_id) as sessions, 
       MIN(timestamp) as oldest, MAX(timestamp) as newest
       FROM visual_observations WHERE agent_id = ?`,
      [agentId]
    );
    return {
      total: row?.total || 0,
      sessions: row?.sessions || 0,
      oldest: row?.oldest || undefined,
      newest: row?.newest || undefined,
    };
  }

  private mapRow(r: any): VisualObservation {
    return {
      id: r.id,
      agentId: r.agent_id,
      sessionId: r.session_id,
      timestamp: r.timestamp,
      source: r.source_json ? JSON.parse(r.source_json) : { type: r.source_type },
      thumbnail: r.thumbnail,
      phash: r.phash,
      metadata: {
        width: r.width,
        height: r.height,
        originalWidth: r.original_width,
        originalHeight: r.original_height,
        qualityScore: r.quality_score || 0,
        pageTitle: r.page_title,
        pageUrl: r.page_url,
      },
      description: r.description,
      labels: r.labels ? JSON.parse(r.labels) : [],
      memoryLink: r.memory_link,
    };
  }
}

function computeQuality(w: number, h: number, desc?: string, labels?: string[]): number {
  let score = 0;
  // Resolution factor (0-0.4)
  const megapixels = (w * h) / 1_000_000;
  score += Math.min(megapixels / 5, 0.4);
  // Has description (0.3)
  if (desc && desc.length > 10) score += 0.3;
  // Has labels (0.2)
  if (labels && labels.length > 0) score += 0.2;
  // Base score (0.1)
  score += 0.1;
  return Math.min(score, 1.0);
}
