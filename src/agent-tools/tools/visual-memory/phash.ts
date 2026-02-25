/**
 * Perceptual Hashing (dHash)
 * 
 * Implements difference hash algorithm for fast visual similarity detection.
 * Much faster than CLIP embeddings and good enough for visual diff/similarity.
 */

import sharp from 'sharp';
import { VisionError } from './types.js';

/** 
 * Compute perceptual hash using difference hash (dHash) algorithm.
 * Returns 64-bit hash as hex string.
 */
export async function computePhash(imageBuffer: Buffer): Promise<string> {
  try {
    // Resize to 9x8 grayscale (dHash needs 9x8 to compute 8x8 differences)
    const { data } = await sharp(imageBuffer)
      .resize(9, 8, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let hash = BigInt(0);
    let bitIndex = 0;

    // Compare adjacent horizontal pixels
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const leftPixel = data[row * 9 + col];
        const rightPixel = data[row * 9 + col + 1];
        
        // If left pixel is brighter than right, set bit to 1
        if (leftPixel > rightPixel) {
          hash |= BigInt(1) << BigInt(bitIndex);
        }
        bitIndex++;
      }
    }

    // Convert to hex string, pad to 16 characters (64 bits)
    return hash.toString(16).padStart(16, '0');
  } catch (error) {
    throw new VisionError(`Failed to compute perceptual hash: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Calculate Hamming distance between two perceptual hashes.
 * Returns number of different bits (0-64).
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== 16 || hash2.length !== 16) {
    throw new VisionError('Invalid hash length. Expected 16 character hex strings.');
  }

  const big1 = BigInt('0x' + hash1);
  const big2 = BigInt('0x' + hash2);
  const xor = big1 ^ big2;

  // Count set bits in XOR result
  let count = 0;
  let n = xor;
  while (n > 0n) {
    count++;
    n = n & (n - 1n); // Remove the lowest set bit
  }

  return count;
}

/**
 * Calculate similarity between two perceptual hashes.
 * Returns similarity in [0.0, 1.0] where 1.0 = identical.
 */
export function calculateSimilarity(hash1: string, hash2: string): number {
  const distance = hammingDistance(hash1, hash2);
  return 1.0 - (distance / 64);
}

/**
 * Alternative hash computation using average hash (aHash).
 * Less sensitive to small changes but can be useful for certain use cases.
 */
export async function computeAverageHash(imageBuffer: Buffer): Promise<string> {
  try {
    // Resize to 8x8 grayscale
    const { data } = await sharp(imageBuffer)
      .resize(8, 8, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Calculate average pixel value
    const sum = Array.from(data).reduce((acc, val) => acc + val, 0);
    const average = sum / 64;

    let hash = BigInt(0);
    
    // Set bit if pixel is above average
    for (let i = 0; i < 64; i++) {
      if (data[i] > average) {
        hash |= BigInt(1) << BigInt(i);
      }
    }

    return hash.toString(16).padStart(16, '0');
  } catch (error) {
    throw new VisionError(`Failed to compute average hash: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Check if two hashes are considered similar based on a threshold.
 * Default threshold of 0.85 means 85% similarity.
 */
export function areHashesSimilar(hash1: string, hash2: string, threshold = 0.85): boolean {
  const similarity = calculateSimilarity(hash1, hash2);
  return similarity >= threshold;
}