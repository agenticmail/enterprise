/**
 * Visual Memory Types
 * 
 * TypeScript implementation inspired by agentic-vision Rust codebase.
 * Core types for persistent visual memory for agents.
 */

/** A captured visual observation stored in visual memory */
export interface VisualObservation {
  id: number;
  timestamp: number;
  sessionId: number;
  source: CaptureSource;
  /** Perceptual hash as hex string (64-bit) */
  phash: string;
  /** JPEG thumbnail as base64 string */
  thumbnail: string;
  metadata: ObservationMeta;
  memoryLink?: number;
}

/** How the image was captured */
export type CaptureSource = 
  | { type: 'file'; path: string }
  | { type: 'base64'; mime: string }
  | { type: 'screenshot'; region?: Rect }
  | { type: 'clipboard' };

/** Metadata about a visual observation */
export interface ObservationMeta {
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  labels: string[];
  description?: string;
  /** Signal quality score in [0.0, 1.0] */
  qualityScore: number;
}

/** Pixel-level diff between two captures */
export interface VisualDiff {
  beforeId: number;
  afterId: number;
  similarity: number;
  changedRegions: Rect[];
  pixelDiffRatio: number;
}

/** A rectangle region */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A similarity match result */
export interface SimilarityMatch {
  id: number;
  similarity: number;
}

/** In-memory container for all visual observations */
export interface VisualMemoryStore {
  observations: VisualObservation[];
  nextId: number;
  sessionCount: number;
  createdAt: number;
  updatedAt: number;
}

/** Errors that can occur in the vision system */
export class VisionError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'VisionError';
  }
}

/** Result type for vision operations */
export type VisionResult<T> = Promise<T>;

/** Query parameters for visual memory search */
export interface VisualQuery {
  sessionId?: number;
  timeRange?: { start: number; end: number };
  description?: string;
  limit?: number;
  similarity?: number;
}

/** Visual session context */
export interface VisualSession {
  id: number;
  name?: string;
  startTime: number;
  endTime?: number;
  observationIds: number[];
}