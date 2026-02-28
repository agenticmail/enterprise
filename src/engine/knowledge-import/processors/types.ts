/**
 * Processing Pipeline — Types
 *
 * Three-layer processing:
 *   Layer 1: EXTRACT — Source-specific raw content extraction
 *   Layer 2: CLEAN   — Deep cleaning, normalization, deduplication
 *   Layer 3: VALIDATE — Quality gates, scoring, rejection
 */

export interface ProcessedDocument {
  id: string;
  title: string;
  content: string;           // fully cleaned content
  contentType: 'markdown' | 'text';
  sections: DocumentSection[];
  metadata: DocumentMetadata;
  quality: QualityReport;
}

export interface DocumentSection {
  title: string;
  content: string;
  level: number;              // heading level (1-6, 0 = no heading)
  wordCount: number;
  language?: string;
}

export interface DocumentMetadata {
  sourceType: string;
  sourcePath: string;
  sourceUrl?: string;
  author?: string;
  lastModified?: string;
  extractedTitle: string;     // title as extracted (before cleaning)
  originalSize: number;
  cleanedSize: number;
  compressionRatio: number;   // how much junk was removed
  processingMs: number;
  layers: LayerReport[];
}

export interface LayerReport {
  name: string;
  inputSize: number;
  outputSize: number;
  removedBytes: number;
  operations: string[];       // what this layer did
  durationMs: number;
}

export interface QualityReport {
  score: number;              // 0-100
  passed: boolean;
  checks: QualityCheck[];
  warnings: string[];
}

export interface QualityCheck {
  name: string;
  passed: boolean;
  score: number;              // 0-100
  detail?: string;
}

/** Source-specific extractor interface. */
export interface ContentExtractor {
  /** Extract clean text from raw source content. */
  extract(raw: string, sourceUrl?: string): ExtractResult;
}

export interface ExtractResult {
  title: string;
  content: string;
  contentType: 'markdown' | 'html' | 'text';
  author?: string;
  publishedDate?: string;
  sections?: string[];        // detected section titles
}
