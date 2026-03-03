/**
 * AgenticMail Agent Tools — Memory (DB-backed)
 *
 * Persistent, evolving memory system for agents. Uses the enterprise
 * AgentMemoryManager (Postgres-backed) when available, with file-based
 * fallback for local/dev environments.
 *
 * Designed so agents can build expertise over time — like a human
 * employee who learns from every interaction, correction, and reflection.
 *
 * Tools:
 *   memory          — CRUD: set/get/search/list/delete key-value memories
 *   memory_reflect  — Record a self-reflection or lesson learned
 *   memory_context  — Get relevant memories for a topic (for prompt injection)
 *   memory_stats    — View memory statistics and health
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, jsonResult, textResult, errorResult } from '../common.js';
import { MemorySearchIndex } from '../../lib/text-search.js';
import type { AgentMemoryManager, MemoryCategory, MemoryImportance, MemorySource, AgentMemoryEntry } from '../../engine/agent-memory.js';

// ── Types ──

const MEMORY_ACTIONS = ['set', 'get', 'search', 'list', 'delete'] as const;
type MemoryAction = (typeof MEMORY_ACTIONS)[number];

const DEFAULT_MAX_ENTRIES = 2000;
const DEFAULT_MAX_VALUE_SIZE = 100 * 1024;
const DEFAULT_MAX_STORE_SIZE = 10 * 1024 * 1024;

type MemoryEntry = {
  key: string;
  value: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type MemoryStore = { entries: Record<string, MemoryEntry> };

// ── File-based fallback (for local/dev) ──

async function loadMemoryStore(storePath: string): Promise<MemoryStore> {
  try {
    var content = await fs.readFile(storePath, 'utf-8');
    return JSON.parse(content) as MemoryStore;
  } catch { return { entries: {} }; }
}

async function saveMemoryStore(storePath: string, store: MemoryStore): Promise<void> {
  var dir = path.dirname(storePath);
  await fs.mkdir(dir, { recursive: true });
  var data = JSON.stringify(store, null, 2);
  var storeSize = Buffer.byteLength(data, 'utf-8');
  if (storeSize > DEFAULT_MAX_STORE_SIZE) {
    throw new Error('Memory store exceeds maximum size (' + Math.round(storeSize / 1024 / 1024) + 'MB). Delete some entries first.');
  }
  var tmpPath = storePath + '.tmp.' + crypto.randomBytes(4).toString('hex');
  try {
    await fs.writeFile(tmpPath, data, 'utf-8');
    await fs.rename(tmpPath, storePath);
  } catch (err) {
    try { await fs.unlink(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

var searchIndexCache = new Map<string, MemorySearchIndex>();

function getSearchIndex(storePath: string, entries: Record<string, MemoryEntry>): MemorySearchIndex {
  var cached = searchIndexCache.get(storePath);
  if (!cached || cached.docCount !== Object.keys(entries).length) {
    var index = new MemorySearchIndex();
    for (var entry of Object.values(entries)) {
      index.addDocument(entry.key, { title: entry.key, content: entry.value, tags: entry.tags });
    }
    searchIndexCache.set(storePath, index);
    return index;
  }
  return cached;
}

// ── Category inference ──

const CATEGORY_KEYWORDS: Record<MemoryCategory, string[]> = {
  org_knowledge: ['policy', 'procedure', 'rule', 'guideline', 'standard', 'protocol', 'compliance', 'regulation'],
  interaction_pattern: ['user prefers', 'they like', 'communication style', 'when asked', 'pattern', 'usually', 'tends to'],
  preference: ['prefer', 'favorite', 'always use', 'default', 'likes', 'dislikes', 'avoid'],
  correction: ['wrong', 'mistake', 'corrected', 'actually', 'not that', 'should have', 'fix', 'error', 'learned that'],
  skill: ['how to', 'technique', 'method', 'approach', 'workflow', 'process', 'tool', 'api'],
  context: ['background', 'history', 'context', 'situation', 'project', 'team', 'department'],
  reflection: ['realized', 'insight', 'lesson', 'takeaway', 'going forward', 'next time', 'reflection', 'learned'],
  session_learning: ['session', 'conversation', 'learned from', 'during chat'],
  system_notice: ['system', 'notice', 'configuration', 'removed', 'deleted', 'disabled'],
};

function inferCategory(title: string, content: string): MemoryCategory {
  var text = (title + ' ' + content).toLowerCase();
  var bestCategory: MemoryCategory = 'context';
  var bestScore = 0;
  for (var [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    var score = 0;
    for (var kw of keywords) {
      if (text.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat as MemoryCategory;
    }
  }
  return bestCategory;
}

function inferImportance(content: string, category: MemoryCategory): MemoryImportance {
  if (category === 'correction') return 'high'; // corrections are always important — don't repeat mistakes
  if (category === 'org_knowledge') return 'high';
  var text = content.toLowerCase();
  if (text.includes('critical') || text.includes('never') || text.includes('always') || text.includes('must')) return 'high';
  if (text.includes('important') || text.includes('remember') || text.includes('key')) return 'normal';
  return 'normal';
}

// ── Options interface ──

export interface MemoryToolOptions extends ToolCreationOptions {
  /** DB-backed memory manager (enterprise) */
  agentMemoryManager?: AgentMemoryManager;
  /** Agent ID for DB-backed memory */
  agentId?: string;
  /** Org ID for DB-backed memory */
  orgId?: string;
}

// ── Main memory tool ──

export function createMemoryTools(options?: MemoryToolOptions): AnyAgentTool[] {
  var memoryConfig = options?.config?.memory;
  if (memoryConfig?.enabled === false) return [];

  var mgr = options?.agentMemoryManager;
  var agentId = options?.agentId || 'default';
  var orgId = options?.orgId || 'default';
  var useDb = !!mgr;

  // File-based fallback path
  var storePath = path.join(
    options?.workspaceDir || process.cwd(),
    '.agenticmail',
    'agent-memory.json',
  );

  var tools: AnyAgentTool[] = [];

  // ─── memory (CRUD) ───
  tools.push({
    name: 'memory',
    label: 'Memory',
    description: 'Persistent memory for storing and retrieving knowledge across conversations. Use this to remember facts, preferences, lessons, corrections, and insights. Memories survive restarts and deployments.\n\nActions:\n- set: Store a memory (key + value + optional tags + optional category + optional importance)\n- get: Retrieve a memory by key\n- search: Full-text search across all memories (BM25F ranking)\n- list: List all memories (with optional category/importance filter)\n- delete: Remove a memory',
    category: 'memory',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action: set, get, search, list, or delete.',
          enum: MEMORY_ACTIONS as unknown as string[],
        },
        key: { type: 'string', description: 'Memory key/title (for set/get/delete). Use descriptive keys like "user-prefers-concise-responses" or "api-endpoint-for-billing".' },
        value: { type: 'string', description: 'Content to store (for set). Be detailed — future you needs to understand this without context.' },
        tags: { type: 'string', description: 'Comma-separated tags (for set). E.g. "user-preference,communication"' },
        category: { type: 'string', description: 'Category (for set/list filter). One of: org_knowledge, interaction_pattern, preference, correction, skill, context, reflection. Auto-inferred if omitted.', enum: ['org_knowledge', 'interaction_pattern', 'preference', 'correction', 'skill', 'context', 'reflection'] },
        importance: { type: 'string', description: 'Importance (for set/list filter). One of: critical, high, normal, low. Auto-inferred if omitted.', enum: ['critical', 'high', 'normal', 'low'] },
        query: { type: 'string', description: 'Search query (for search). Natural language works well.' },
        limit: { type: 'number', description: 'Max results for search/list (default: 20).' },
      },
      required: ['action'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var action = readStringParam(params, 'action', { required: true }) as MemoryAction;

      // ── DB-backed path ──
      if (useDb) {
        switch (action) {
          case 'set': {
            var key = readStringParam(params, 'key', { required: true });
            var value = readStringParam(params, 'value', { required: true, trim: false });
            var tagsRaw = readStringParam(params, 'tags') || '';
            var tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
            var category = (readStringParam(params, 'category') || inferCategory(key, value)) as MemoryCategory;
            var importance = (readStringParam(params, 'importance') || inferImportance(value, category)) as MemoryImportance;

            // Check if entry with same title exists (update instead of duplicate)
            var existing = await mgr!.queryMemories({ agentId, category, query: key, limit: 5 });
            var exactMatch = existing.find(e => e.title === key);

            if (exactMatch) {
              await mgr!.updateMemory(exactMatch.id, {
                content: value,
                tags,
                category,
                importance,
                confidence: Math.min(1.0, exactMatch.confidence + 0.1), // boost confidence on update
              });
              return textResult('Updated memory: ' + key + ' [' + category + '/' + importance + '] (confidence: ' + Math.min(1.0, exactMatch.confidence + 0.1).toFixed(2) + ')');
            }

            await mgr!.createMemory({
              agentId,
              orgId,
              category,
              title: key,
              content: value,
              source: 'interaction' as MemorySource,
              importance,
              confidence: 0.8,
              tags,
              metadata: {},
            });
            return textResult('Stored memory: ' + key + ' [' + category + '/' + importance + ']');
          }

          case 'get': {
            var key = readStringParam(params, 'key', { required: true });
            var results = await mgr!.queryMemories({ agentId, query: key, limit: 5 });
            var match = results.find(e => e.title === key) || results[0];
            if (!match) return textResult('Memory not found: ' + key);
            await mgr!.recordAccess(match.id);
            return jsonResult({
              key: match.title,
              value: match.content,
              category: match.category,
              importance: match.importance,
              confidence: match.confidence,
              tags: match.tags,
              accessCount: match.accessCount + 1,
              createdAt: match.createdAt,
              updatedAt: match.updatedAt,
            });
          }

          case 'search': {
            var query = readStringParam(params, 'query', { required: true });
            var limit = readNumberParam(params, 'limit', { integer: true }) ?? 20;
            var categoryFilter = readStringParam(params, 'category');
            var importanceFilter = readStringParam(params, 'importance');
            var results = await mgr!.queryMemories({
              agentId,
              query,
              limit,
              category: categoryFilter || undefined,
              importance: importanceFilter || undefined,
            });
            if (results.length === 0) return textResult('No memories matching: ' + query);
            // Record access for top results
            for (var r of results.slice(0, 3)) { await mgr!.recordAccess(r.id); }
            return jsonResult({
              count: results.length,
              results: results.map(e => ({
                key: e.title,
                value: e.content,
                category: e.category,
                importance: e.importance,
                confidence: e.confidence,
                tags: e.tags,
                accessCount: e.accessCount,
                updatedAt: e.updatedAt,
              })),
            });
          }

          case 'list': {
            var limit = readNumberParam(params, 'limit', { integer: true }) ?? 20;
            var categoryFilter = readStringParam(params, 'category');
            var importanceFilter = readStringParam(params, 'importance');
            var results = await mgr!.queryMemories({
              agentId,
              limit,
              category: categoryFilter || undefined,
              importance: importanceFilter || undefined,
            });
            var stats = await mgr!.getStats(agentId);
            return jsonResult({
              totalMemories: stats.totalEntries,
              showing: results.length,
              avgConfidence: stats.avgConfidence,
              byCategory: stats.byCategory,
              byImportance: stats.byImportance,
              entries: results.map(e => ({
                key: e.title,
                category: e.category,
                importance: e.importance,
                confidence: e.confidence,
                tags: e.tags,
                accessCount: e.accessCount,
                updatedAt: e.updatedAt,
                preview: e.content.length > 120 ? e.content.slice(0, 120) + '...' : e.content,
              })),
            });
          }

          case 'delete': {
            var key = readStringParam(params, 'key', { required: true });
            var results = await mgr!.queryMemories({ agentId, query: key, limit: 5 });
            var dbMatch = results.find(e => e.title === key);
            if (!dbMatch) return textResult('Memory not found: ' + key);
            await mgr!.deleteMemory(dbMatch.id);
            return textResult('Deleted memory: ' + key);
          }

          default:
            return errorResult('Unknown memory action: ' + action);
        }
      }

      // ── File-based fallback ──
      var store = await loadMemoryStore(storePath);

      switch (action) {
        case 'set': {
          var key = readStringParam(params, 'key', { required: true });
          var value = readStringParam(params, 'value', { required: true, trim: false });
          var tagsRaw = readStringParam(params, 'tags') || '';
          var tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
          var now = new Date().toISOString();
          var valueSize = Buffer.byteLength(value, 'utf-8');
          if (valueSize > DEFAULT_MAX_VALUE_SIZE) return errorResult('Value too large: ' + Math.round(valueSize / 1024) + 'KB. Maximum is 100KB per entry.');
          var existingEntry = store.entries[key];
          if (!existingEntry && Object.keys(store.entries).length >= DEFAULT_MAX_ENTRIES) return errorResult('Memory store full: ' + DEFAULT_MAX_ENTRIES + ' entries maximum.');
          store.entries[key] = { key, value, tags, createdAt: existingEntry?.createdAt || now, updatedAt: now };
          await saveMemoryStore(storePath, store);
          var idx = getSearchIndex(storePath, store.entries);
          idx.addDocument(key, { title: key, content: value, tags });
          return textResult('Stored memory: ' + key);
        }
        case 'get': {
          var key = readStringParam(params, 'key', { required: true });
          var entry = store.entries[key];
          if (!entry) return textResult('Memory not found: ' + key);
          return jsonResult(entry);
        }
        case 'search': {
          var query = readStringParam(params, 'query', { required: true });
          var limit = readNumberParam(params, 'limit', { integer: true }) ?? 10;
          var index = getSearchIndex(storePath, store.entries);
          var searchResults = index.search(query);
          var out: MemoryEntry[] = [];
          for (var i = 0; i < Math.min(searchResults.length, limit); i++) {
            var entry = store.entries[searchResults[i].id];
            if (entry) out.push(entry);
          }
          if (out.length === 0) return textResult('No memories matching: ' + query);
          return jsonResult({ count: out.length, results: out });
        }
        case 'list': {
          var limit = readNumberParam(params, 'limit', { integer: true }) ?? 20;
          var keys = Object.keys(store.entries);
          var limited = keys.slice(0, limit);
          var entries = limited.map(k => { var e = store.entries[k]; return { key: e.key, tags: e.tags, updatedAt: e.updatedAt }; });
          return jsonResult({ count: keys.length, showing: limited.length, entries });
        }
        case 'delete': {
          var key = readStringParam(params, 'key', { required: true });
          if (!store.entries[key]) return textResult('Memory not found: ' + key);
          delete store.entries[key];
          await saveMemoryStore(storePath, store);
          var cachedIdx = searchIndexCache.get(storePath);
          if (cachedIdx) cachedIdx.removeDocument(key);
          return textResult('Deleted memory: ' + key);
        }
        default:
          return errorResult('Unknown memory action: ' + action);
      }
    },
  });

  // ─── memory_reflect (self-reflection tool) ───
  tools.push({
    name: 'memory_reflect',
    label: 'Self-Reflect',
    description: 'Record a self-reflection, lesson learned, or insight from the current interaction. Use this after completing a task, receiving feedback, making a mistake, or discovering something useful. These reflections compound over time — they are how you grow and become an expert.\n\nExamples:\n- After a correction: "User prefers bullet points over paragraphs for reports"\n- After learning: "The billing API requires ISO 8601 dates, not Unix timestamps"\n- After a mistake: "Always confirm before sending emails to external addresses"\n- After success: "Breaking complex tasks into subtasks with status updates works well for this user"',
    category: 'memory',
    risk: 'low',
    parameters: {
      type: 'object',
      properties: {
        insight: { type: 'string', description: 'What you learned or realized. Be specific and actionable — future you needs to apply this.' },
        category: { type: 'string', description: 'Type of insight.', enum: ['correction', 'skill', 'preference', 'interaction_pattern', 'reflection'] },
        importance: { type: 'string', description: 'How important is this?', enum: ['critical', 'high', 'normal', 'low'] },
        trigger: { type: 'string', description: 'What prompted this reflection? (optional — helps with future recall)' },
      },
      required: ['insight'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var insight = readStringParam(params, 'insight', { required: true });
      var category = (readStringParam(params, 'category') || inferCategory('reflection', insight)) as MemoryCategory;
      var importance = (readStringParam(params, 'importance') || inferImportance(insight, category)) as MemoryImportance;
      var trigger = readStringParam(params, 'trigger') || '';

      // Generate a descriptive title from the insight
      var title = insight.length > 80 ? insight.slice(0, 77) + '...' : insight;
      var content = insight;
      if (trigger) content += '\n\nTrigger: ' + trigger;

      if (useDb) {
        await mgr!.createMemory({
          agentId,
          orgId,
          category,
          title,
          content,
          source: 'self_reflection' as MemorySource,
          importance,
          confidence: 0.9, // reflections start high — agent chose to record this
          tags: ['reflection', category],
          metadata: { trigger: trigger || undefined },
        });
      } else {
        // File-based fallback
        var store = await loadMemoryStore(storePath);
        var now = new Date().toISOString();
        var key = 'reflection-' + now.slice(0, 10) + '-' + crypto.randomBytes(3).toString('hex');
        store.entries[key] = { key, value: content, tags: ['reflection', category], createdAt: now, updatedAt: now };
        await saveMemoryStore(storePath, store);
      }

      return textResult('Reflection recorded [' + category + '/' + importance + ']: ' + title);
    },
  });

  // ─── memory_context (get relevant context for a topic) ───
  if (useDb) {
    tools.push({
      name: 'memory_context',
      label: 'Memory Context',
      description: 'Retrieve relevant memories for a given topic or task. Returns a curated, ranked summary of your most relevant knowledge — corrections, preferences, skills, and context. Use this at the start of complex tasks to recall what you know.\n\nThis is your "expertise retrieval" — the accumulated knowledge that makes you better at your job over time.',
      category: 'memory',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'What topic or task do you need context for? Natural language works best.' },
          maxTokens: { type: 'number', description: 'Maximum token budget for context (default: 1500). Higher = more complete but uses more prompt space.' },
        },
        required: ['topic'],
      },
      execute: async function(_toolCallId, args) {
        var params = args as Record<string, unknown>;
        var topic = readStringParam(params, 'topic', { required: true });
        var maxTokens = readNumberParam(params, 'maxTokens', { integer: true }) ?? 1500;

        var context = await mgr!.generateMemoryContext(agentId, topic, maxTokens);
        if (!context) return textResult('No relevant memories found for: ' + topic);
        return textResult(context);
      },
    });
  }

  // ─── memory_stats ───
  if (useDb) {
    tools.push({
      name: 'memory_stats',
      label: 'Memory Stats',
      description: 'View statistics about your memory: total entries, category breakdown, average confidence, and health metrics. Use this to understand what you know and identify gaps.',
      category: 'memory',
      risk: 'low',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async function() {
        var stats = await mgr!.getStats(agentId);
        var recent = await mgr!.getRecentMemories(agentId, 24);
        return jsonResult({
          ...stats,
          recentEntries24h: recent.length,
          recentTopics: recent.slice(0, 5).map(e => e.title),
          healthTips: generateHealthTips(stats),
        });
      },
    });
  }

  return tools;
}

function generateHealthTips(stats: { totalEntries: number; byCategory: Record<string, number>; avgConfidence: number }): string[] {
  var tips: string[] = [];
  if (stats.totalEntries === 0) tips.push('Your memory is empty! Start recording interactions, preferences, and lessons learned.');
  if (stats.totalEntries > 0 && !stats.byCategory['correction']) tips.push('No corrections recorded. When you make mistakes, use memory_reflect to learn from them.');
  if (stats.totalEntries > 0 && !stats.byCategory['preference']) tips.push('No preferences recorded. Notice how users like things done and record those patterns.');
  if (stats.totalEntries > 0 && !stats.byCategory['skill']) tips.push('No skills recorded. When you learn how to do something new, document the technique.');
  if (stats.avgConfidence < 0.5 && stats.totalEntries > 10) tips.push('Average confidence is low (' + stats.avgConfidence.toFixed(2) + '). Review and reinforce your memories by accessing them.');
  if (stats.totalEntries > 500) tips.push('Large memory (' + stats.totalEntries + ' entries). Consider reviewing and pruning outdated entries.');
  return tips;
}

/** Legacy single-tool export for backward compatibility */
export function createMemoryTool(options?: ToolCreationOptions): AnyAgentTool | null {
  var tools = createMemoryTools(options as MemoryToolOptions);
  return tools.length > 0 ? tools[0] : null;
}
