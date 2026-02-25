/**
 * Visual Memory Storage
 * 
 * Handles persistence of visual observations to agent's data directory.
 * Uses JSON format for simplicity and speed (good enough for <10K observations).
 */

import fs from 'fs/promises';
import path from 'path';
import { VisualMemoryStore, VisualObservation, VisionError } from './types.js';

/** Cache to avoid reloading the same store multiple times */
const storeCache = new Map<string, VisualMemoryStore>();

/**
 * Get the storage path for an agent's visual memory.
 */
function getStoragePath(agentId: string): string {
  // Store in data/agents/{agentId}/visual-memory.json
  return path.join(process.cwd(), 'data', 'agents', agentId, 'visual-memory.json');
}

/**
 * Create a new empty visual memory store.
 */
function createEmptyStore(): VisualMemoryStore {
  const now = Date.now();
  return {
    observations: [],
    nextId: 1,
    sessionCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Load visual memory store for an agent.
 * Creates an empty store if none exists.
 */
export async function loadStore(agentId: string): Promise<VisualMemoryStore> {
  // Check cache first
  const cached = storeCache.get(agentId);
  if (cached) {
    return cached;
  }

  const storePath = getStoragePath(agentId);

  try {
    // Check if file exists
    await fs.access(storePath);
    
    // Load and parse existing store
    const data = await fs.readFile(storePath, 'utf8');
    const store: VisualMemoryStore = JSON.parse(data);
    
    // Validate structure
    if (!store.observations || !Array.isArray(store.observations)) {
      throw new VisionError('Invalid store format: missing observations array');
    }
    
    // Cache and return
    storeCache.set(agentId, store);
    return store;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, create new empty store
      const newStore = createEmptyStore();
      storeCache.set(agentId, newStore);
      return newStore;
    }
    
    if (error instanceof VisionError) {
      throw error;
    }
    
    throw new VisionError(`Failed to load visual memory store: ${error.message}`);
  }
}

/**
 * Save visual memory store for an agent.
 */
export async function saveStore(agentId: string, store: VisualMemoryStore): Promise<void> {
  const storePath = getStoragePath(agentId);

  try {
    // Ensure directory exists
    const dir = path.dirname(storePath);
    await fs.mkdir(dir, { recursive: true });

    // Update timestamp
    store.updatedAt = Date.now();

    // Write to temporary file first, then rename (atomic operation)
    const tempPath = storePath + '.tmp';
    const data = JSON.stringify(store, null, 2);
    await fs.writeFile(tempPath, data, 'utf8');
    await fs.rename(tempPath, storePath);

    // Update cache
    storeCache.set(agentId, store);
  } catch (error: any) {
    throw new VisionError(`Failed to save visual memory store: ${error.message}`);
  }
}

/**
 * Add an observation to the store and save it.
 */
export async function addObservation(agentId: string, observation: Omit<VisualObservation, 'id'>): Promise<number> {
  const store = await loadStore(agentId);
  
  // Assign ID and add to store
  const id = store.nextId;
  const fullObservation: VisualObservation = {
    ...observation,
    id,
  };
  
  store.observations.push(fullObservation);
  store.nextId++;
  
  // Save updated store
  await saveStore(agentId, store);
  
  return id;
}

/**
 * Get an observation by ID.
 */
export async function getObservation(agentId: string, id: number): Promise<VisualObservation | null> {
  const store = await loadStore(agentId);
  return store.observations.find(obs => obs.id === id) || null;
}

/**
 * Get observations filtered by criteria.
 */
export async function queryObservations(
  agentId: string,
  filters: {
    sessionId?: number;
    timeRange?: { start: number; end: number };
    description?: string;
    limit?: number;
  } = {}
): Promise<VisualObservation[]> {
  const store = await loadStore(agentId);
  let results = store.observations;

  // Apply filters
  if (filters.sessionId !== undefined) {
    results = results.filter(obs => obs.sessionId === filters.sessionId);
  }

  if (filters.timeRange) {
    const { start, end } = filters.timeRange;
    results = results.filter(obs => obs.timestamp >= start && obs.timestamp <= end);
  }

  if (filters.description) {
    const searchTerm = filters.description.toLowerCase();
    results = results.filter(obs => 
      obs.metadata.description?.toLowerCase().includes(searchTerm) ||
      obs.metadata.labels.some(label => label.toLowerCase().includes(searchTerm))
    );
  }

  // Sort by timestamp (newest first)
  results.sort((a, b) => b.timestamp - a.timestamp);

  // Apply limit
  if (filters.limit && filters.limit > 0) {
    results = results.slice(0, filters.limit);
  }

  return results;
}

/**
 * Get recent observations (newest first).
 */
export async function getRecentObservations(agentId: string, limit = 10): Promise<VisualObservation[]> {
  return queryObservations(agentId, { limit });
}

/**
 * Get observations for a specific session.
 */
export async function getSessionObservations(agentId: string, sessionId: number): Promise<VisualObservation[]> {
  return queryObservations(agentId, { sessionId });
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
  const store = await loadStore(agentId);
  const observations = store.observations;

  if (observations.length === 0) {
    return {
      totalObservations: 0,
      totalSessions: 0,
      oldestTimestamp: null,
      newestTimestamp: null,
      totalSize: 0,
      avgQualityScore: 0,
    };
  }

  const timestamps = observations.map(obs => obs.timestamp);
  const qualityScores = observations.map(obs => obs.metadata.qualityScore);
  const sessions = new Set(observations.map(obs => obs.sessionId));
  
  // Calculate total size (rough estimate based on JSON)
  const totalSize = JSON.stringify(store).length;

  return {
    totalObservations: observations.length,
    totalSessions: sessions.size,
    oldestTimestamp: Math.min(...timestamps),
    newestTimestamp: Math.max(...timestamps),
    totalSize,
    avgQualityScore: qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length,
  };
}

/**
 * Clear cache for an agent (useful for testing or after external modifications).
 */
export function clearCache(agentId?: string): void {
  if (agentId) {
    storeCache.delete(agentId);
  } else {
    storeCache.clear();
  }
}

/**
 * Delete all visual memory data for an agent.
 */
export async function deleteStore(agentId: string): Promise<void> {
  const storePath = getStoragePath(agentId);
  
  try {
    await fs.unlink(storePath);
    clearCache(agentId);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw new VisionError(`Failed to delete visual memory store: ${error.message}`);
    }
    // File doesn't exist, which is fine for deletion
  }
}