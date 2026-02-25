/**
 * Visual Diff Engine — detect changes between two screenshots/captures.
 * 
 * Port of agentralabs/agentic-vision diff.rs to TypeScript.
 * Uses sharp for image processing, grid-based region detection.
 */

import { VisualDiff, Rect } from './types.js';

let sharp: any = null;
async function getSharp() {
  if (!sharp) sharp = (await import('sharp')).default;
  return sharp;
}

const DIFF_THRESHOLD = 30;    // pixel difference threshold (0-255)
const MIN_REGION_SIZE = 10;   // minimum region size to report
const GRID_SIZE = 8;          // grid cells per dimension
const CHANGE_RATIO = 0.10;    // 10% of cell pixels must change

/**
 * Compute a visual diff between two images.
 * Returns similarity score, changed regions, and pixel diff ratio.
 */
export async function computeDiff(
  beforeId: number,
  afterId: number,
  imgA: Buffer,
  imgB: Buffer,
  targetSize = 256
): Promise<VisualDiff> {
  const s = await getSharp();

  // Resize both to same dimensions and convert to grayscale raw pixels
  const [rawA, rawB] = await Promise.all([
    s(imgA).resize(targetSize, targetSize, { fit: 'fill' }).grayscale().raw().toBuffer(),
    s(imgB).resize(targetSize, targetSize, { fit: 'fill' }).grayscale().raw().toBuffer(),
  ]);

  const totalPixels = targetSize * targetSize;
  let changedPixels = 0;
  const diffMap = new Uint8Array(totalPixels);

  // Per-pixel absolute difference
  for (let i = 0; i < totalPixels; i++) {
    const d = Math.abs(rawA[i] - rawB[i]);
    diffMap[i] = d;
    if (d > DIFF_THRESHOLD) changedPixels++;
  }

  const pixelDiffRatio = totalPixels > 0 ? changedPixels / totalPixels : 0;
  const similarity = 1 - pixelDiffRatio;

  // Grid-based region detection
  const changedRegions = findChangedRegions(diffMap, targetSize, targetSize);

  return { beforeId, afterId, similarity, changedRegions, pixelDiffRatio };
}

function findChangedRegions(diffMap: Uint8Array, w: number, h: number): Rect[] {
  if (w === 0 || h === 0) return [];

  const cellW = Math.max(Math.floor(w / GRID_SIZE), 1);
  const cellH = Math.max(Math.floor(h / GRID_SIZE), 1);
  const regions: Rect[] = [];

  for (let gy = 0; gy < GRID_SIZE; gy++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      const x0 = gx * cellW;
      const y0 = gy * cellH;
      const x1 = Math.min((gx + 1) * cellW, w);
      const y1 = Math.min((gy + 1) * cellH, h);
      const total = (x1 - x0) * (y1 - y0);

      let changed = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (diffMap[y * w + x] > DIFF_THRESHOLD) changed++;
        }
      }

      if (total > 0 && changed > total * CHANGE_RATIO && (x1 - x0) >= MIN_REGION_SIZE) {
        regions.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
    }
  }

  mergeAdjacentRegions(regions);
  return regions;
}

function mergeAdjacentRegions(regions: Rect[]): void {
  if (regions.length < 2) return;
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        if (rectsAdjacent(regions[i], regions[j])) {
          regions[i] = mergeRects(regions[i], regions[j]);
          regions.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }
}

function rectsAdjacent(a: Rect, b: Rect): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

function mergeRects(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
