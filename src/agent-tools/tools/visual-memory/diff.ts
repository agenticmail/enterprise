/**
 * Visual Diff and Change Detection
 * 
 * Implements pixel-level comparison and 8x8 grid region detection.
 */

import sharp from 'sharp';
import { VisualDiff, Rect, VisionError } from './types.js';
import { resizeImage, convertToGrayscale } from './capture.js';

/** Pixel difference threshold (0-255) for considering a pixel "changed" */
const DIFF_THRESHOLD = 30;

/** Minimum region size (pixels) to report as a changed region */
const MIN_REGION_SIZE = 10;

/** Grid size for region detection */
const GRID_SIZE = 8;

/**
 * Compute a visual diff between two images.
 * Images are provided as base64 thumbnail strings.
 */
export async function computeVisualDiff(
  beforeId: number,
  afterId: number,
  beforeThumbnail: string,
  afterThumbnail: string
): Promise<VisualDiff> {
  try {
    // Convert base64 to buffers
    const beforeBuffer = Buffer.from(beforeThumbnail, 'base64');
    const afterBuffer = Buffer.from(afterThumbnail, 'base64');

    // Get dimensions of both images
    const beforeMeta = await sharp(beforeBuffer).metadata();
    const afterMeta = await sharp(afterBuffer).metadata();

    if (!beforeMeta.width || !beforeMeta.height || !afterMeta.width || !afterMeta.height) {
      throw new VisionError('Unable to determine image dimensions for diff');
    }

    // Resize to common dimensions for comparison
    const targetWidth = Math.min(beforeMeta.width, afterMeta.width);
    const targetHeight = Math.min(beforeMeta.height, afterMeta.height);

    const resizedBefore = await resizeImage(beforeBuffer, targetWidth, targetHeight, 'fill');
    const resizedAfter = await resizeImage(afterBuffer, targetWidth, targetHeight, 'fill');

    // Convert to grayscale
    const grayBefore = await convertToGrayscale(resizedBefore);
    const grayAfter = await convertToGrayscale(resizedAfter);

    // Get raw pixel data
    const beforePixels = await sharp(grayBefore).raw().toBuffer();
    const afterPixels = await sharp(grayAfter).raw().toBuffer();

    if (beforePixels.length !== afterPixels.length) {
      throw new VisionError('Pixel buffer length mismatch');
    }

    // Compute per-pixel absolute difference
    const diffBuffer = Buffer.alloc(beforePixels.length);
    let changedPixels = 0;
    const totalPixels = beforePixels.length;

    for (let i = 0; i < beforePixels.length; i++) {
      const diff = Math.abs(beforePixels[i] - afterPixels[i]);
      diffBuffer[i] = diff;
      
      if (diff > DIFF_THRESHOLD) {
        changedPixels++;
      }
    }

    const pixelDiffRatio = totalPixels > 0 ? changedPixels / totalPixels : 0;
    const similarity = 1.0 - pixelDiffRatio;

    // Find changed regions using grid-based detection
    const changedRegions = findChangedRegions(diffBuffer, targetWidth, targetHeight);

    return {
      beforeId,
      afterId,
      similarity,
      changedRegions,
      pixelDiffRatio,
    };
  } catch (error: any) {
    if (error instanceof VisionError) {
      throw error;
    }
    throw new VisionError(`Failed to compute visual diff: ${error.message}`);
  }
}

/**
 * Find bounding boxes of changed regions using grid-based detection.
 */
function findChangedRegions(diffBuffer: Buffer, width: number, height: number): Rect[] {
  if (width === 0 || height === 0) {
    return [];
  }

  // Divide image into a grid and find cells with significant changes
  const cellWidth = Math.max(1, Math.floor(width / GRID_SIZE));
  const cellHeight = Math.max(1, Math.floor(height / GRID_SIZE));
  const regions: Rect[] = [];

  const gridRows = Math.max(1, Math.floor(height / cellHeight));
  const gridCols = Math.max(1, Math.floor(width / cellWidth));

  for (let gridY = 0; gridY < gridRows; gridY++) {
    for (let gridX = 0; gridX < gridCols; gridX++) {
      const x0 = gridX * cellWidth;
      const y0 = gridY * cellHeight;
      const x1 = Math.min((gridX + 1) * cellWidth, width);
      const y1 = Math.min((gridY + 1) * cellHeight, height);

      let changedPixels = 0;
      let totalPixels = 0;

      // Check pixels in this cell
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const pixelIndex = y * width + x;
          if (pixelIndex < diffBuffer.length) {
            totalPixels++;
            if (diffBuffer[pixelIndex] > DIFF_THRESHOLD) {
              changedPixels++;
            }
          }
        }
      }

      // If more than 10% of cell pixels changed and cell is large enough, mark this region
      const changeRatio = totalPixels > 0 ? changedPixels / totalPixels : 0;
      if (changeRatio > 0.1 && (x1 - x0) >= MIN_REGION_SIZE && (y1 - y0) >= MIN_REGION_SIZE) {
        regions.push({
          x: x0,
          y: y0,
          w: x1 - x0,
          h: y1 - y0,
        });
      }
    }
  }

  // Merge overlapping regions
  return mergeOverlappingRegions(regions);
}

/**
 * Merge overlapping or adjacent regions.
 */
function mergeOverlappingRegions(regions: Rect[]): Rect[] {
  if (regions.length <= 1) {
    return regions;
  }

  const merged: Rect[] = [];
  const used = new Set<number>();

  for (let i = 0; i < regions.length; i++) {
    if (used.has(i)) continue;

    let currentRegion = { ...regions[i] };
    used.add(i);

    // Look for overlapping regions to merge
    let foundMerge = true;
    while (foundMerge) {
      foundMerge = false;
      for (let j = 0; j < regions.length; j++) {
        if (used.has(j)) continue;

        if (regionsOverlap(currentRegion, regions[j])) {
          // Merge regions
          const merged_region = mergeRegions(currentRegion, regions[j]);
          currentRegion = merged_region;
          used.add(j);
          foundMerge = true;
        }
      }
    }

    merged.push(currentRegion);
  }

  return merged;
}

/**
 * Check if two regions overlap or are adjacent.
 */
function regionsOverlap(a: Rect, b: Rect): boolean {
  // Allow small gap for merging adjacent regions
  const gap = 5;
  
  const aRight = a.x + a.w;
  const aBottom = a.y + a.h;
  const bRight = b.x + b.w;
  const bBottom = b.y + b.h;

  return !(
    aRight + gap < b.x ||
    a.x > bRight + gap ||
    aBottom + gap < b.y ||
    a.y > bBottom + gap
  );
}

/**
 * Merge two regions into one bounding box.
 */
function mergeRegions(a: Rect, b: Rect): Rect {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w);
  const bottom = Math.max(a.y + a.h, b.y + b.h);

  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  };
}

/**
 * Calculate the area of a rectangle.
 */
export function calculateRegionArea(region: Rect): number {
  return region.w * region.h;
}

/**
 * Calculate the total area of multiple regions.
 */
export function calculateTotalChangedArea(regions: Rect[]): number {
  return regions.reduce((total, region) => total + calculateRegionArea(region), 0);
}

/**
 * Fast similarity comparison using just pixel difference ratio.
 * Useful when you don't need detailed region information.
 */
export async function quickSimilarityCheck(
  thumbnail1: string,
  thumbnail2: string,
  threshold = 0.85
): Promise<{ similar: boolean; similarity: number }> {
  try {
    const buffer1 = Buffer.from(thumbnail1, 'base64');
    const buffer2 = Buffer.from(thumbnail2, 'base64');

    // Resize to small common size for fast comparison
    const size = 32;
    const resized1 = await resizeImage(buffer1, size, size, 'fill');
    const resized2 = await resizeImage(buffer2, size, size, 'fill');

    const gray1 = await convertToGrayscale(resized1);
    const gray2 = await convertToGrayscale(resized2);

    const pixels1 = await sharp(gray1).raw().toBuffer();
    const pixels2 = await sharp(gray2).raw().toBuffer();

    let diffPixels = 0;
    for (let i = 0; i < pixels1.length; i++) {
      if (Math.abs(pixels1[i] - pixels2[i]) > DIFF_THRESHOLD) {
        diffPixels++;
      }
    }

    const similarity = 1.0 - (diffPixels / pixels1.length);
    return {
      similar: similarity >= threshold,
      similarity,
    };
  } catch (error: any) {
    throw new VisionError(`Failed to perform quick similarity check: ${error.message}`);
  }
}