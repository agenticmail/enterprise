/**
 * Visual Similarity Search
 * 
 * Implements fast similarity search using perceptual hashes and filtering.
 */

import { VisualObservation, SimilarityMatch } from './types.js';
import { calculateSimilarity } from './phash.js';
import { queryObservations } from './storage.js';

/**
 * Find visually similar observations using perceptual hash comparison.
 */
export async function findSimilarObservations(
  agentId: string,
  targetPhash: string,
  options: {
    minSimilarity?: number;
    maxResults?: number;
    excludeIds?: number[];
    sessionId?: number;
    timeRange?: { start: number; end: number };
  } = {}
): Promise<SimilarityMatch[]> {
  const {
    minSimilarity = 0.7,
    maxResults = 20,
    excludeIds = [],
    sessionId,
    timeRange,
  } = options;

  // Get candidate observations with basic filtering
  const observations = await queryObservations(agentId, {
    sessionId,
    timeRange,
    limit: 1000, // Reasonable limit for hash comparison
  });

  // Calculate similarities using perceptual hashes
  const matches: SimilarityMatch[] = [];
  
  for (const obs of observations) {
    // Skip excluded observations
    if (excludeIds.includes(obs.id)) {
      continue;
    }

    try {
      const similarity = calculateSimilarity(targetPhash, obs.phash);
      
      if (similarity >= minSimilarity) {
        matches.push({
          id: obs.id,
          similarity,
        });
      }
    } catch (error) {
      // Skip observations with invalid hashes
      console.warn(`Skipping observation ${obs.id} due to hash comparison error:`, error);
      continue;
    }
  }

  // Sort by similarity (highest first) and limit results
  matches.sort((a, b) => b.similarity - a.similarity);
  return matches.slice(0, maxResults);
}

/**
 * Find the most similar observation to a given observation.
 */
export async function findMostSimilar(
  agentId: string,
  observationId: number,
  excludeSelf = true
): Promise<SimilarityMatch | null> {
  // Get all observations to find the target
  const allObservations = await queryObservations(agentId);
  const targetObs = allObservations.find(obs => obs.id === observationId);
  
  if (!targetObs) {
    return null;
  }

  const excludeIds = excludeSelf ? [observationId] : [];
  const matches = await findSimilarObservations(agentId, targetObs.phash, {
    maxResults: 1,
    excludeIds,
    minSimilarity: 0.1, // Very low threshold to find the best match
  });

  return matches.length > 0 ? matches[0] : null;
}

/**
 * Find duplicate or near-duplicate observations.
 */
export async function findDuplicates(
  agentId: string,
  similarityThreshold = 0.95
): Promise<Array<{ original: number; duplicates: SimilarityMatch[] }>> {
  const observations = await queryObservations(agentId);
  const duplicateGroups: Array<{ original: number; duplicates: SimilarityMatch[] }> = [];
  const processed = new Set<number>();

  for (const obs of observations) {
    if (processed.has(obs.id)) {
      continue;
    }

    // Find similar observations
    const similar = await findSimilarObservations(agentId, obs.phash, {
      minSimilarity: similarityThreshold,
      excludeIds: [obs.id],
    });

    if (similar.length > 0) {
      duplicateGroups.push({
        original: obs.id,
        duplicates: similar,
      });

      // Mark all as processed to avoid duplicate groups
      processed.add(obs.id);
      similar.forEach(match => processed.add(match.id));
    }
  }

  return duplicateGroups;
}

/**
 * Cluster observations by visual similarity.
 */
export async function clusterBySimilarity(
  agentId: string,
  similarityThreshold = 0.8
): Promise<Array<{ representative: number; members: number[]; avgSimilarity: number }>> {
  const observations = await queryObservations(agentId);
  const clusters: Array<{ representative: number; members: number[]; avgSimilarity: number }> = [];
  const assigned = new Set<number>();

  for (const obs of observations) {
    if (assigned.has(obs.id)) {
      continue;
    }

    // Find similar observations for this cluster
    const similar = await findSimilarObservations(agentId, obs.phash, {
      minSimilarity: similarityThreshold,
      excludeIds: Array.from(assigned),
    });

    const members = [obs.id, ...similar.map(match => match.id)];
    const avgSimilarity = similar.length > 0 
      ? similar.reduce((sum, match) => sum + match.similarity, 0) / similar.length
      : 1.0;

    clusters.push({
      representative: obs.id,
      members,
      avgSimilarity,
    });

    // Mark all members as assigned
    members.forEach(id => assigned.add(id));
  }

  // Sort clusters by size (largest first)
  clusters.sort((a, b) => b.members.length - a.members.length);
  
  return clusters;
}

/**
 * Fast approximate search using Hamming distance buckets.
 * Groups observations by similar hash patterns for faster searching.
 */
export class HashIndex {
  private buckets = new Map<string, number[]>();
  private observations = new Map<number, VisualObservation>();

  /**
   * Build index from observations.
   */
  async buildIndex(agentId: string): Promise<void> {
    const obs = await queryObservations(agentId);
    
    for (const observation of obs) {
      this.addObservation(observation);
    }
  }

  /**
   * Add an observation to the index.
   */
  addObservation(observation: VisualObservation): void {
    this.observations.set(observation.id, observation);
    
    // Create bucket key from hash prefix (first 4 chars)
    const bucketKey = observation.phash.substring(0, 4);
    
    if (!this.buckets.has(bucketKey)) {
      this.buckets.set(bucketKey, []);
    }
    
    this.buckets.get(bucketKey)!.push(observation.id);
  }

  /**
   * Fast approximate similarity search.
   */
  findSimilarFast(
    targetPhash: string,
    maxResults = 10,
    minSimilarity = 0.7
  ): SimilarityMatch[] {
    const bucketKey = targetPhash.substring(0, 4);
    const candidateIds = this.buckets.get(bucketKey) || [];
    
    const matches: SimilarityMatch[] = [];
    
    for (const id of candidateIds) {
      const obs = this.observations.get(id);
      if (!obs) continue;
      
      try {
        const similarity = calculateSimilarity(targetPhash, obs.phash);
        if (similarity >= minSimilarity) {
          matches.push({ id, similarity });
        }
      } catch {
        // Skip invalid hashes
        continue;
      }
    }

    // Also check nearby buckets for better recall
    const nearbyBuckets = this.getNearbyBuckets(bucketKey);
    for (const nearbyKey of nearbyBuckets) {
      const nearbyIds = this.buckets.get(nearbyKey) || [];
      for (const id of nearbyIds.slice(0, 50)) { // Limit to prevent explosion
        const obs = this.observations.get(id);
        if (!obs) continue;
        
        try {
          const similarity = calculateSimilarity(targetPhash, obs.phash);
          if (similarity >= minSimilarity && !matches.find(m => m.id === id)) {
            matches.push({ id, similarity });
          }
        } catch {
          continue;
        }
      }
    }

    matches.sort((a, b) => b.similarity - a.similarity);
    return matches.slice(0, maxResults);
  }

  /**
   * Get nearby bucket keys for improved recall.
   */
  private getNearbyBuckets(bucketKey: string): string[] {
    const nearby: string[] = [];
    const hex = '0123456789abcdef';
    
    // Generate variations by changing one character
    for (let pos = 0; pos < bucketKey.length; pos++) {
      for (const char of hex) {
        if (char !== bucketKey[pos]) {
          const variant = bucketKey.substring(0, pos) + char + bucketKey.substring(pos + 1);
          nearby.push(variant);
        }
      }
    }
    
    return nearby;
  }

  /**
   * Get statistics about the index.
   */
  getStats(): {
    totalObservations: number;
    totalBuckets: number;
    avgBucketSize: number;
    maxBucketSize: number;
  } {
    const bucketSizes = Array.from(this.buckets.values()).map(bucket => bucket.length);
    
    return {
      totalObservations: this.observations.size,
      totalBuckets: this.buckets.size,
      avgBucketSize: bucketSizes.length > 0 ? bucketSizes.reduce((a, b) => a + b, 0) / bucketSizes.length : 0,
      maxBucketSize: bucketSizes.length > 0 ? Math.max(...bucketSizes) : 0,
    };
  }
}

/**
 * Temporal similarity analysis - find similar images across time.
 */
export async function findTemporalSimilarity(
  agentId: string,
  observationId: number,
  timeWindowMs = 24 * 60 * 60 * 1000 // 24 hours
): Promise<Array<SimilarityMatch & { timeDelta: number }>> {
  // Get all observations to find the target
  const allObservations = await queryObservations(agentId);
  const targetObs = allObservations.find(obs => obs.id === observationId);
  
  if (!targetObs) {
    return [];
  }

  // Find observations within time window
  const timeStart = targetObs.timestamp - timeWindowMs;
  const timeEnd = targetObs.timestamp + timeWindowMs;
  
  const candidates = await queryObservations(agentId, {
    timeRange: { start: timeStart, end: timeEnd },
  });

  const matches: Array<SimilarityMatch & { timeDelta: number }> = [];
  
  for (const candidate of candidates) {
    if (candidate.id === observationId) continue;
    
    try {
      const similarity = calculateSimilarity(targetObs.phash, candidate.phash);
      if (similarity >= 0.5) { // Lower threshold for temporal analysis
        matches.push({
          id: candidate.id,
          similarity,
          timeDelta: Math.abs(candidate.timestamp - targetObs.timestamp),
        });
      }
    } catch {
      continue;
    }
  }

  // Sort by similarity, then by time proximity
  matches.sort((a, b) => {
    if (Math.abs(a.similarity - b.similarity) < 0.05) {
      return a.timeDelta - b.timeDelta;
    }
    return b.similarity - a.similarity;
  });

  return matches;
}