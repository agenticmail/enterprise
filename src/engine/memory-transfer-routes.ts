/**
 * Memory Transfer Routes
 * Mounted at /memory-transfer/* on the engine sub-app.
 */

import { Hono } from 'hono';
import type { AgentMemoryManager, AgentMemoryEntry } from './agent-memory.js';
import type { EngineDatabase } from './db-adapter.js';

interface TransferFilters {
  categories?: string[];
  dateRange?: { from: string; to: string };
  importance?: string;
  query?: string;
  tags?: string[];
}

function generateId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

async function getFilteredMemories(memory: AgentMemoryManager, sourceAgentId: string, filters?: TransferFilters): Promise<AgentMemoryEntry[]> {
  let memories = await memory.queryMemories({
    agentId: sourceAgentId,
    category: filters?.categories?.length === 1 ? filters.categories[0] : undefined,
    importance: filters?.importance || undefined,
    query: filters?.query || undefined,
    limit: 10000,
  });

  if (filters?.categories && filters.categories.length > 1) {
    const catSet = new Set(filters.categories);
    memories = memories.filter(m => catSet.has(m.category));
  }

  if (filters?.dateRange) {
    const from = filters.dateRange.from ? new Date(filters.dateRange.from).getTime() : 0;
    const to = filters.dateRange.to ? new Date(filters.dateRange.to).getTime() : Infinity;
    memories = memories.filter(m => {
      const t = new Date(m.createdAt).getTime();
      return t >= from && t <= to;
    });
  }

  if (filters?.tags?.length) {
    const tagSet = new Set(filters.tags);
    memories = memories.filter(m => m.tags?.some((t: string) => tagSet.has(t)));
  }

  return memories;
}

export function createMemoryTransferRoutes(memory: AgentMemoryManager, engineDb: EngineDatabase | null) {
  const router = new Hono();

  // Ensure transfer tables exist
  let tablesReady = false;
  async function ensureTables() {
    if (tablesReady || !engineDb) return;
    try {
      await engineDb.execute(`CREATE TABLE IF NOT EXISTS memory_transfer_history (
        id TEXT PRIMARY KEY,
        source_agent_id TEXT NOT NULL,
        target_agent_ids TEXT NOT NULL,
        mode TEXT NOT NULL,
        conflict_strategy TEXT NOT NULL,
        total_transferred INTEGER DEFAULT 0,
        total_skipped INTEGER DEFAULT 0,
        total_conflicts INTEGER DEFAULT 0,
        filters TEXT,
        results TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
      await engineDb.execute(`CREATE TABLE IF NOT EXISTS memory_transfer_schedules (
        id TEXT PRIMARY KEY,
        source_agent_id TEXT NOT NULL,
        target_agent_ids TEXT NOT NULL,
        filters TEXT,
        mode TEXT NOT NULL,
        conflict_strategy TEXT NOT NULL,
        schedule_type TEXT NOT NULL,
        schedule_time TEXT,
        schedule_day TEXT,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
      tablesReady = true;
    } catch (_) { /* tables may already exist */ tablesReady = true; }
  }

  // ─── Preview ──────────────────────────────────────────

  router.post('/preview', async (c) => {
    try {
      const { sourceAgentId, filters } = await c.req.json();
      if (!sourceAgentId) return c.json({ error: 'sourceAgentId required' }, 400);

      const memories = await getFilteredMemories(memory, sourceAgentId, filters);

      const byCategory: Record<string, number> = {};
      let minDate = '', maxDate = '';
      for (const m of memories) {
        byCategory[m.category] = (byCategory[m.category] || 0) + 1;
        if (!minDate || m.createdAt < minDate) minDate = m.createdAt;
        if (!maxDate || m.createdAt > maxDate) maxDate = m.createdAt;
      }

      // Return memories with content for preview (truncate content for large sets)
      const previewMemories = memories.map(m => ({
        id: m.id,
        title: m.title,
        content: m.content.length > 300 ? m.content.slice(0, 300) + '...' : m.content,
        category: m.category,
        importance: m.importance,
        source: m.source,
        confidence: m.confidence,
        tags: m.tags,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }));

      return c.json({
        count: memories.length,
        categories: byCategory,
        dateRange: memories.length ? { from: minDate, to: maxDate } : null,
        memories: previewMemories,
      });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Execute Transfer ─────────────────────────────────

  router.post('/execute', async (c) => {
    try {
      const body = await c.req.json();
      const { sourceAgentId, targetAgentIds, mode, conflictStrategy, filters, preserveMetadata, orgScope } = body;

      if (!sourceAgentId || !targetAgentIds?.length) return c.json({ error: 'sourceAgentId and targetAgentIds required' }, 400);
      if (targetAgentIds.includes(sourceAgentId)) return c.json({ error: 'Cannot transfer memories to the same agent' }, 400);

      const memories = await getFilteredMemories(memory, sourceAgentId, filters);
      if (!memories.length) return c.json({ error: 'No memories match the given filters' }, 400);

      const transferId = generateId();
      const results: Array<{ targetAgentId: string; transferred: number; skipped: number; conflicts: number }> = [];

      for (const targetId of targetAgentIds) {
        let transferred = 0, skipped = 0, conflicts = 0;

        // Get target memories for conflict detection
        const targetMemories = await memory.queryMemories({ agentId: targetId, limit: 10000 });
        const targetIndex = new Map<string, AgentMemoryEntry>();
        for (const tm of targetMemories) {
          targetIndex.set(`${tm.category}::${tm.title}`, tm);
        }

        for (const mem of memories) {
          const key = `${mem.category}::${mem.title}`;
          const existing = targetIndex.get(key);

          if (existing) {
            conflicts++;
            switch (conflictStrategy) {
              case 'skip':
                skipped++;
                continue;
              case 'overwrite':
                await memory.updateMemory(existing.id, {
                  content: mem.content,
                  importance: mem.importance,
                  confidence: mem.confidence,
                  tags: mem.tags,
                  metadata: preserveMetadata ? { ...mem.metadata, transferredFrom: sourceAgentId, transferId } : undefined,
                });
                transferred++;
                break;
              case 'merge':
                await memory.updateMemory(existing.id, {
                  content: existing.content + '\n\n---\n\n' + mem.content,
                  tags: [...new Set([...(existing.tags || []), ...(mem.tags || [])])],
                  metadata: preserveMetadata ? { ...existing.metadata, ...mem.metadata, transferredFrom: sourceAgentId, transferId } : undefined,
                });
                transferred++;
                break;
              case 'append':
                await memory.createMemory({
                  agentId: targetId,
                  orgId: orgScope || mem.orgId,
                  category: mem.category,
                  title: mem.title + ' (transferred)',
                  content: mem.content,
                  source: 'transfer',
                  importance: mem.importance,
                  confidence: mem.confidence,
                  tags: [...(mem.tags || []), 'transferred'],
                  metadata: preserveMetadata ? { ...mem.metadata, transferredFrom: sourceAgentId, transferId } : { transferredFrom: sourceAgentId, transferId },
                });
                transferred++;
                break;
            }
          } else {
            await memory.createMemory({
              agentId: targetId,
              orgId: orgScope || mem.orgId,
              category: mem.category,
              title: mem.title,
              content: mem.content,
              source: 'transfer',
              importance: mem.importance,
              confidence: mem.confidence,
              tags: mem.tags,
              metadata: preserveMetadata ? { ...mem.metadata, transferredFrom: sourceAgentId, transferId } : { transferredFrom: sourceAgentId, transferId },
            });
            transferred++;
          }
        }

        // If move mode, delete source memories
        if (mode === 'move') {
          for (const mem of memories) {
            await memory.deleteMemory(mem.id);
          }
        }

        results.push({ targetAgentId: targetId, transferred, skipped, conflicts });
      }

      // Log to history
      await ensureTables();
      if (engineDb) {
        const totals = results.reduce((a, r) => ({ t: a.t + r.transferred, s: a.s + r.skipped, c: a.c + r.conflicts }), { t: 0, s: 0, c: 0 });
        await engineDb.execute(
          `INSERT INTO memory_transfer_history (id, source_agent_id, target_agent_ids, mode, conflict_strategy, total_transferred, total_skipped, total_conflicts, filters, results) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [transferId, sourceAgentId, JSON.stringify(targetAgentIds), mode, conflictStrategy, totals.t, totals.s, totals.c, JSON.stringify(filters || {}), JSON.stringify(results)]
        );
      }

      return c.json({ transferId, results });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── History ──────────────────────────────────────────

  router.get('/history', async (c) => {
    try {
      await ensureTables();
      const limit = parseInt(c.req.query('limit') || '20');
      const offset = parseInt(c.req.query('offset') || '0');
      if (!engineDb) return c.json({ history: [], total: 0 });

      const rows = await engineDb.query<any>(`SELECT * FROM memory_transfer_history ORDER BY created_at DESC LIMIT ? OFFSET ?`, [limit, offset]);
      const countRows = await engineDb.query<any>(`SELECT COUNT(*) as cnt FROM memory_transfer_history`, []);
      const total = countRows[0]?.cnt || 0;

      const history = rows.map((r: any) => ({
        id: r.id,
        sourceAgentId: r.source_agent_id,
        targetAgentIds: JSON.parse(r.target_agent_ids || '[]'),
        mode: r.mode,
        conflictStrategy: r.conflict_strategy,
        totalTransferred: r.total_transferred,
        totalSkipped: r.total_skipped,
        totalConflicts: r.total_conflicts,
        filters: JSON.parse(r.filters || '{}'),
        results: JSON.parse(r.results || '[]'),
        createdAt: r.created_at,
      }));

      return c.json({ history, total });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ─── Schedules ────────────────────────────────────────

  router.post('/schedule', async (c) => {
    try {
      await ensureTables();
      const body = await c.req.json();
      const { sourceAgentId, targetAgentIds, filters, mode, conflictStrategy, schedule } = body;
      if (!sourceAgentId || !targetAgentIds?.length || !schedule?.type) return c.json({ error: 'Missing required fields' }, 400);

      const id = generateId();
      if (engineDb) {
        await engineDb.execute(
          `INSERT INTO memory_transfer_schedules (id, source_agent_id, target_agent_ids, filters, mode, conflict_strategy, schedule_type, schedule_time, schedule_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, sourceAgentId, JSON.stringify(targetAgentIds), JSON.stringify(filters || {}), mode || 'copy', conflictStrategy || 'skip', schedule.type, schedule.time || null, schedule.dayOfWeek || null]
        );
      }

      return c.json({ id, created: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.get('/schedules', async (c) => {
    try {
      await ensureTables();
      if (!engineDb) return c.json({ schedules: [] });

      const rows = await engineDb.query<any>(`SELECT * FROM memory_transfer_schedules WHERE enabled = 1 ORDER BY created_at DESC`, []);
      const schedules = rows.map((r: any) => ({
        id: r.id,
        sourceAgentId: r.source_agent_id,
        targetAgentIds: JSON.parse(r.target_agent_ids || '[]'),
        filters: JSON.parse(r.filters || '{}'),
        mode: r.mode,
        conflictStrategy: r.conflict_strategy,
        schedule: { type: r.schedule_type, time: r.schedule_time, dayOfWeek: r.schedule_day },
        createdAt: r.created_at,
      }));

      return c.json({ schedules });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  router.delete('/schedules/:id', async (c) => {
    try {
      await ensureTables();
      const id = c.req.param('id');
      if (engineDb) {
        await engineDb.execute(`DELETE FROM memory_transfer_schedules WHERE id = ?`, [id]);
      }
      return c.json({ deleted: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  return router;
}
