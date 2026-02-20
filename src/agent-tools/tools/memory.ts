/**
 * AgenticMail Agent Tools — Memory
 *
 * Persistent memory/notes system for agents with size limits,
 * atomic writes, and entry count protection.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AnyAgentTool, ToolCreationOptions } from '../types.js';
import { readStringParam, readNumberParam, jsonResult, textResult, errorResult } from '../common.js';
import { MemorySearchIndex } from '../../lib/text-search.js';

const MEMORY_ACTIONS = ['set', 'get', 'search', 'list', 'delete'] as const;
type MemoryAction = (typeof MEMORY_ACTIONS)[number];

const DEFAULT_MAX_ENTRIES = 1000;
const DEFAULT_MAX_VALUE_SIZE = 100 * 1024;    // 100KB per entry
const DEFAULT_MAX_STORE_SIZE = 10 * 1024 * 1024; // 10MB total

type MemoryEntry = {
  key: string;
  value: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type MemoryStore = {
  entries: Record<string, MemoryEntry>;
};

async function loadMemoryStore(storePath: string): Promise<MemoryStore> {
  try {
    var content = await fs.readFile(storePath, 'utf-8');
    return JSON.parse(content) as MemoryStore;
  } catch {
    return { entries: {} };
  }
}

async function saveMemoryStore(storePath: string, store: MemoryStore): Promise<void> {
  var dir = path.dirname(storePath);
  await fs.mkdir(dir, { recursive: true });
  var data = JSON.stringify(store, null, 2);

  // Check total store size
  var storeSize = Buffer.byteLength(data, 'utf-8');
  if (storeSize > DEFAULT_MAX_STORE_SIZE) {
    throw new Error('Memory store exceeds maximum size (' + Math.round(storeSize / 1024 / 1024) + 'MB). Delete some entries first.');
  }

  // Atomic write: write to temp file then rename
  var tmpPath = storePath + '.tmp.' + crypto.randomBytes(4).toString('hex');
  try {
    await fs.writeFile(tmpPath, data, 'utf-8');
    await fs.rename(tmpPath, storePath);
  } catch (err) {
    // Cleanup temp file on failure
    try { await fs.unlink(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

// ── Per-store BM25 search index (rebuilt on load, updated incrementally) ──

var searchIndexCache = new Map<string, MemorySearchIndex>();

function buildSearchIndex(storePath: string, entries: Record<string, MemoryEntry>): MemorySearchIndex {
  var index = new MemorySearchIndex();
  for (var entry of Object.values(entries)) {
    index.addDocument(entry.key, { title: entry.key, content: entry.value, tags: entry.tags });
  }
  searchIndexCache.set(storePath, index);
  return index;
}

function getSearchIndex(storePath: string, entries: Record<string, MemoryEntry>): MemorySearchIndex {
  var cached = searchIndexCache.get(storePath);
  // Rebuild if missing or entry count drifted (another process wrote the file)
  if (!cached || cached.docCount !== Object.keys(entries).length) {
    return buildSearchIndex(storePath, entries);
  }
  return cached;
}

function searchEntries(
  storePath: string,
  entries: Record<string, MemoryEntry>,
  query: string,
  limit: number,
): MemoryEntry[] {
  var index = getSearchIndex(storePath, entries);
  var results = index.search(query);
  var out: MemoryEntry[] = [];
  for (var i = 0; i < Math.min(results.length, limit); i++) {
    var entry = entries[results[i].id];
    if (entry) out.push(entry);
  }
  return out;
}

export function createMemoryTool(options?: ToolCreationOptions): AnyAgentTool | null {
  var memoryConfig = options?.config?.memory;
  if (memoryConfig?.enabled === false) return null;

  var storePath = path.join(
    options?.workspaceDir || process.cwd(),
    '.agenticmail',
    'agent-memory.json',
  );

  return {
    name: 'memory',
    label: 'Memory',
    description: 'Persistent memory for storing and retrieving notes, facts, and context across conversations. Supports set, get, search, list, and delete operations.',
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
        key: { type: 'string', description: 'Memory key (for set/get/delete).' },
        value: { type: 'string', description: 'Value to store (for set).' },
        tags: { type: 'string', description: 'Comma-separated tags (for set).' },
        query: { type: 'string', description: 'Search query (for search).' },
        limit: { type: 'number', description: 'Max results for search/list.' },
      },
      required: ['action'],
    },
    execute: async function(_toolCallId, args) {
      var params = args as Record<string, unknown>;
      var action = readStringParam(params, 'action', { required: true }) as MemoryAction;
      var store = await loadMemoryStore(storePath);

      switch (action) {
        case 'set': {
          var key = readStringParam(params, 'key', { required: true });
          var value = readStringParam(params, 'value', { required: true, trim: false });
          var tagsRaw = readStringParam(params, 'tags') || '';
          var tags = tagsRaw.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
          var now = new Date().toISOString();

          // Value size limit
          var valueSize = Buffer.byteLength(value, 'utf-8');
          if (valueSize > DEFAULT_MAX_VALUE_SIZE) {
            return errorResult('Value too large: ' + Math.round(valueSize / 1024) + 'KB. Maximum is 100KB per entry.');
          }

          // Entry count limit (only for new entries)
          var existing = store.entries[key];
          if (!existing && Object.keys(store.entries).length >= DEFAULT_MAX_ENTRIES) {
            return errorResult('Memory store full: ' + DEFAULT_MAX_ENTRIES + ' entries maximum. Delete some entries first.');
          }

          store.entries[key] = {
            key,
            value,
            tags,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
          };
          await saveMemoryStore(storePath, store);

          // Keep BM25 index in sync
          var idx = getSearchIndex(storePath, store.entries);
          idx.addDocument(key, { title: key, content: value, tags: tags });

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
          var results = searchEntries(storePath, store.entries, query, limit);
          if (results.length === 0) return textResult('No memories matching: ' + query);
          return jsonResult({ count: results.length, results });
        }

        case 'list': {
          var limit = readNumberParam(params, 'limit', { integer: true }) ?? 20;
          var keys = Object.keys(store.entries);
          var limited = keys.slice(0, limit);
          var entries = limited.map(function(k) {
            var e = store.entries[k];
            return { key: e.key, tags: e.tags, updatedAt: e.updatedAt };
          });
          return jsonResult({ count: keys.length, showing: limited.length, entries });
        }

        case 'delete': {
          var key = readStringParam(params, 'key', { required: true });
          if (!store.entries[key]) return textResult('Memory not found: ' + key);
          delete store.entries[key];
          await saveMemoryStore(storePath, store);

          // Keep BM25 index in sync
          var idx = searchIndexCache.get(storePath);
          if (idx) idx.removeDocument(key);

          return textResult('Deleted memory: ' + key);
        }

        default:
          return errorResult('Unknown memory action: ' + action);
      }
    },
  };
}
