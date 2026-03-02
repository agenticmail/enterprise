/**
 * Knowledge Search Tools
 *
 * Three-tier knowledge retrieval for agents:
 *   1. knowledge_base_search — Search org's knowledge bases (docs, FAQs, processes)
 *   2. knowledge_hub_search  — Search shared hub (all agents' contributions/learnings)
 *   3. knowledge_search_log  — View search history & efficiency metrics
 *
 * Search priority (baked into agent prompts):
 *   Own memory → Org Knowledge Base → Knowledge Hub → External (Drive/Gmail)
 */

import crypto from 'node:crypto';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, jsonResult, textResult, errorResult } from '../common.js';
import type { KnowledgeBaseEngine, SearchResult } from '../../engine/knowledge.js';

// ─── Search Tracking ─────────────────────────────────────

interface SearchLogEntry {
  id: string;
  agentId: string;
  searchType: 'knowledge_base' | 'knowledge_hub';
  query: string;
  resultsCount: number;
  topScore: number;
  kbIds?: string[];
  durationMs: number;
  wasHelpful: boolean; // Did we find results above threshold?
  timestamp: string;
}

// ─── Tool Creation ───────────────────────────────────────

export function createKnowledgeSearchTools(opts: ToolCreationOptions): AnyAgentTool[] {
  const knowledgeEngine: KnowledgeBaseEngine | undefined = (opts as any).knowledgeEngine;
  const engineDb = opts.engineDb;
  const agentId = opts.agentId || 'unknown';
  const orgId = (opts as any).orgId || '';

  const tools: AnyAgentTool[] = [];

  // ── 1. knowledge_base_search ─────────────────────────

  tools.push({
    name: 'knowledge_base_search',
    description: 'Search organization knowledge bases for documents, FAQs, processes, and product info.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        kb_id: { type: 'string', description: 'Specific knowledge base ID (omit to search all)' },
        max_results: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['query'],
    },
    async execute(_id: string, input: Record<string, unknown>) {
      const query = readStringParam(input, 'query');
      if (!query) return errorResult('query is required');

      if (!knowledgeEngine) {
        return errorResult('Knowledge base engine not available');
      }

      const start = Date.now();
      const kbId = readStringParam(input, 'kb_id');
      const maxResults = readNumberParam(input, 'max_results') || 5;

      try {
        const results = await knowledgeEngine.search(agentId, query, {
          kbIds: kbId ? [kbId] : undefined,
          maxResults,
          minScore: 0.3, // Lower threshold for keyword search
        });

        const durationMs = Date.now() - start;
        const wasHelpful = results.length > 0 && results[0].score >= 0.5;

        // Track the search
        await logSearch(engineDb, {
          id: crypto.randomUUID(),
          agentId,
          searchType: 'knowledge_base',
          query,
          resultsCount: results.length,
          topScore: results.length > 0 ? results[0].score : 0,
          kbIds: kbId ? [kbId] : undefined,
          durationMs,
          wasHelpful,
          timestamp: new Date().toISOString(),
        });

        if (results.length === 0) {
          return textResult(`No results found in knowledge bases for: "${query}". Try the knowledge_hub_search to check if other agents have encountered this.`);
        }

        const formatted = results.map((r, i) => ({
          rank: i + 1,
          score: Math.round(r.score * 100) / 100,
          document: r.document.name,
          section: r.chunk.metadata.section || null,
          content: r.chunk.content.slice(0, 500),
          highlight: r.highlight,
          source: r.document.sourceUrl || r.document.sourceType,
        }));

        return jsonResult({
          query,
          results: formatted,
          totalFound: results.length,
          searchTimeMs: durationMs,
        });
      } catch (err: any) {
        return errorResult(`Knowledge base search failed: ${err.message}`);
      }
    },
  });

  // ── 2. knowledge_hub_search ──────────────────────────

  tools.push({
    name: 'knowledge_hub_search',
    description: 'Search shared knowledge hub — learnings, solutions, and insights from ALL agents in the organization.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        category: { type: 'string', description: 'Filter by category (e.g. org_knowledge, skill, insight)' },
        agent_id: { type: 'string', description: 'Filter by contributing agent' },
        max_results: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
    async execute(_id: string, input: Record<string, unknown>) {
      const query = readStringParam(input, 'query');
      if (!query) return errorResult('query is required');

      if (!engineDb) {
        return errorResult('Database not available');
      }

      const start = Date.now();
      const category = readStringParam(input, 'category');
      const filterAgentId = readStringParam(input, 'agent_id');
      const maxResults = readNumberParam(input, 'max_results') || 10;

      try {
        // Search agent_memory table (org_knowledge + skill entries from ALL agents)
        // Uses keyword matching since we don't have embeddings on agent_memory
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

        let sql = `SELECT id, agent_id, category, content, importance, confidence, source, tags, created_at 
                    FROM agent_memory 
                    WHERE category IN ('org_knowledge', 'skill', 'insight', 'lesson', 'process')`;
        const params: any[] = [];

        if (category) {
          sql += ` AND category = $${params.length + 1}`;
          params.push(category);
        }
        if (filterAgentId) {
          sql += ` AND agent_id = $${params.length + 1}`;
          params.push(filterAgentId);
        }

        sql += ` ORDER BY created_at DESC LIMIT 200`;

        const rows = await engineDb.query(sql, params);

        // Score results by keyword relevance
        const scored = rows
          .map((row: any) => {
            const content = (row.content || '').toLowerCase();
            const tags = (row.tags || '').toLowerCase();
            const matchCount = queryWords.filter(w => content.includes(w) || tags.includes(w)).length;
            const score = queryWords.length > 0 ? matchCount / queryWords.length : 0;
            return { ...row, score };
          })
          .filter((r: any) => r.score > 0)
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, maxResults);

        const durationMs = Date.now() - start;
        const wasHelpful = scored.length > 0 && scored[0].score >= 0.5;

        // Track the search
        await logSearch(engineDb, {
          id: crypto.randomUUID(),
          agentId,
          searchType: 'knowledge_hub',
          query,
          resultsCount: scored.length,
          topScore: scored.length > 0 ? scored[0].score : 0,
          durationMs,
          wasHelpful,
          timestamp: new Date().toISOString(),
        });

        if (scored.length === 0) {
          return textResult(`No results in knowledge hub for: "${query}". No agent has documented a solution for this yet. Consider using knowledge_base_search or searching Drive/Gmail.`);
        }

        const formatted = scored.map((r: any, i: number) => ({
          rank: i + 1,
          relevance: Math.round(r.score * 100) + '%',
          agentId: r.agent_id,
          category: r.category,
          content: r.content.slice(0, 400),
          importance: r.importance,
          confidence: r.confidence,
          source: r.source,
          date: r.created_at,
        }));

        return jsonResult({
          query,
          results: formatted,
          totalFound: scored.length,
          searchTimeMs: durationMs,
          tip: 'If a result solves your problem, consider adding your own solution via memory_reflect for future reference.',
        });
      } catch (err: any) {
        return errorResult(`Knowledge hub search failed: ${err.message}`);
      }
    },
  });

  // ── 3. knowledge_search_stats ────────────────────────

  tools.push({
    name: 'knowledge_search_stats',
    description: 'View knowledge search history and efficiency metrics for agents.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'Look back N days (default 7)' },
        agent_id: { type: 'string', description: 'Filter by agent (omit for all)' },
      },
      required: [],
    },
    async execute(_id: string, input: Record<string, unknown>) {
      if (!engineDb) return errorResult('Database not available');

      const days = readNumberParam(input, 'days') || 7;
      const filterAgent = readStringParam(input, 'agent_id');

      try {
        const since = new Date(Date.now() - days * 86400000).toISOString();
        let sql = `SELECT * FROM knowledge_search_log WHERE timestamp >= $1`;
        const params: any[] = [since];

        if (filterAgent) {
          sql += ` AND agent_id = $2`;
          params.push(filterAgent);
        }
        sql += ` ORDER BY timestamp DESC LIMIT 100`;

        const rows = await engineDb.query(sql, params);

        // Compute metrics
        const totalSearches = rows.length;
        const kbSearches = rows.filter((r: any) => r.search_type === 'knowledge_base').length;
        const hubSearches = rows.filter((r: any) => r.search_type === 'knowledge_hub').length;
        const helpfulSearches = rows.filter((r: any) => r.was_helpful).length;
        const hitRate = totalSearches > 0 ? Math.round((helpfulSearches / totalSearches) * 100) : 0;
        const avgDuration = totalSearches > 0
          ? Math.round(rows.reduce((s: number, r: any) => s + (r.duration_ms || 0), 0) / totalSearches)
          : 0;

        // By agent breakdown
        const byAgent: Record<string, { total: number; helpful: number }> = {};
        for (const r of rows) {
          if (!byAgent[r.agent_id]) byAgent[r.agent_id] = { total: 0, helpful: 0 };
          byAgent[r.agent_id].total++;
          if (r.was_helpful) byAgent[r.agent_id].helpful++;
        }

        return jsonResult({
          period: `${days} days`,
          totalSearches,
          kbSearches,
          hubSearches,
          helpfulSearches,
          hitRate: hitRate + '%',
          avgDurationMs: avgDuration,
          byAgent,
          recentSearches: rows.slice(0, 10).map((r: any) => ({
            agent: r.agent_id,
            type: r.search_type,
            query: r.query,
            results: r.results_count,
            helpful: r.was_helpful,
            time: r.timestamp,
          })),
        });
      } catch (err: any) {
        return errorResult(`Failed to get search stats: ${err.message}`);
      }
    },
  });

  return tools;
}

// ─── Search Log Helper ───────────────────────────────────

async function logSearch(engineDb: any, entry: SearchLogEntry): Promise<void> {
  if (!engineDb) return;
  try {
    await engineDb.run(
      `INSERT INTO knowledge_search_log (id, agent_id, search_type, query, results_count, top_score, kb_ids, duration_ms, was_helpful, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [entry.id, entry.agentId, entry.searchType, entry.query, entry.resultsCount, entry.topScore, entry.kbIds ? JSON.stringify(entry.kbIds) : null, entry.durationMs, entry.wasHelpful, entry.timestamp]
    );
  } catch {
    // Don't let logging failures block search
  }
}
