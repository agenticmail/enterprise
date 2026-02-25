/**
 * AgenticMail Enterprise — Visual Memory & Browser Intelligence
 * 
 * Inspired by agentralabs/agentic-vision (Rust + CLIP ViT-B/32).
 * Rewritten in TypeScript for native enterprise integration.
 * 
 * Core differences from upstream:
 * - TypeScript instead of Rust (no cargo/ONNX dependency)
 * - Perceptual hashing instead of CLIP embeddings (zero ML deps, sub-ms speed)
 * - Database-backed storage instead of binary .avis files (works with Postgres/SQLite)
 * - Per-agent isolation (multi-tenant visual memory)
 * - Browser intelligence tools (page_actions, smart_navigate, batch_actions)
 * - Integrated with enterprise permission engine
 * 
 * Credits: https://github.com/agentralabs/agentic-vision (MIT License)
 */

export { VisualMemoryStore } from './store.js';
export type { StoreOptions } from './store.js';

export { computeDiff } from './diff.js';

export {
  perceptualHash,
  averageHash,
  differenceHash,
  hashSimilarity,
  hammingDistance,
  generateThumbnail,
  getImageDimensions,
} from './phash.js';

export { createVisionTools } from './tools.js';
export type { VisionToolsConfig } from './tools.js';

export { PAGE_EXTRACTOR_SCRIPT, PAGE_META_SCRIPT } from './page-extractor.js';

export type {
  VisualObservation,
  VisualDiff,
  CaptureSource,
  ObservationMeta,
  SimilarityMatch,
  VisionQuery,
  PageAction,
  Rect,
} from './types.js';
