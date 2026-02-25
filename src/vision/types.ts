/**
 * Visual Memory — Core types
 * Inspired by agentralabs/agentic-vision, rewritten in TypeScript for enterprise.
 */

export interface VisualObservation {
  id: number;
  agentId: string;
  sessionId?: string;
  timestamp: number;          // epoch ms
  source: CaptureSource;
  thumbnail: Buffer;          // JPEG thumbnail (max 320px)
  phash: string;              // 64-bit perceptual hash (hex)
  metadata: ObservationMeta;
  description?: string;
  labels: string[];
  memoryLink?: string;        // link to agent memory ID
}

export type CaptureSource =
  | { type: 'screenshot'; url?: string; region?: Rect }
  | { type: 'file'; path: string }
  | { type: 'base64'; mime: string }
  | { type: 'browser'; targetId?: string; url?: string };

export interface ObservationMeta {
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  qualityScore: number;       // 0.0 - 1.0
  pageTitle?: string;
  pageUrl?: string;
}

export interface VisualDiff {
  beforeId: number;
  afterId: number;
  similarity: number;         // 0.0 - 1.0 (1 = identical)
  changedRegions: Rect[];
  pixelDiffRatio: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SimilarityMatch {
  id: number;
  similarity: number;
  observation: VisualObservation;
}

export interface VisionQuery {
  agentId: string;
  sessionId?: string;
  description?: string;
  timeRange?: { start: number; end: number };
  limit?: number;
  minQuality?: number;
}

export interface PageAction {
  type: 'button' | 'link' | 'input' | 'select' | 'checkbox';
  label: string;
  selector: string;
  risk: 'safe' | 'caution' | 'destructive';
  visible: boolean;
  bbox?: Rect;
}
