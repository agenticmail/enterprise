/**
 * Processing Pipeline — Orchestrator
 *
 * Chains the three processing layers:
 *   Layer 1: EXTRACT — Source-specific content extraction
 *   Layer 2: CLEAN   — Deep cleaning & normalization (3 passes)
 *   Layer 3: VALIDATE — Quality gates & scoring
 *
 * Then splits into sections for chunking.
 */

import type { ImportDocument } from '../types.js';
import type { ProcessedDocument, DocumentSection, LayerReport, ContentExtractor } from './types.js';
import { WebContentExtractor } from './extract-web.js';
import { GitHubContentExtractor } from './extract-github.js';
import { SharePointContentExtractor } from './extract-sharepoint.js';
import { GoogleDriveContentExtractor } from './extract-gdrive.js';
import { cleanContent } from './clean.js';
import { validateContent } from './validate.js';

// ─── Extractor Registry ──────────────────────────────

const EXTRACTORS: Record<string, ContentExtractor> = {
  'github': new GitHubContentExtractor(),
  'sharepoint': new SharePointContentExtractor(),
  'google-sites': new GoogleDriveContentExtractor(),
  'url': new WebContentExtractor(),
  'file-upload': new GitHubContentExtractor(),  // markdown/text files use same extractor
  'confluence': new WebContentExtractor(),
  'notion': new WebContentExtractor(),
};

// ─── Pipeline ────────────────────────────────────────

export function processDocument(doc: ImportDocument): ProcessedDocument | null {
  const pipelineStart = Date.now();
  const layers: LayerReport[] = [];

  // ─── Layer 1: EXTRACT ──────────────────────────

  const extractStart = Date.now();
  const extractor = EXTRACTORS[doc.sourceType] || new WebContentExtractor();

  const extracted = extractor.extract(doc.content, doc.sourceUrl);
  const extractOps: string[] = [`extractor: ${doc.sourceType}`, `contentType: ${extracted.contentType}`];

  if (extracted.contentType === 'html' || doc.contentType === 'html') {
    extractOps.push('converted HTML to text');
  }

  layers.push({
    name: 'extract',
    inputSize: doc.content.length,
    outputSize: extracted.content.length,
    removedBytes: doc.content.length - extracted.content.length,
    operations: extractOps,
    durationMs: Date.now() - extractStart,
  });

  // ─── Layer 2: CLEAN ───────────────────────────

  const { content: cleaned, report: cleanReport } = cleanContent(extracted.content);
  layers.push(cleanReport);

  // ─── Layer 3: VALIDATE ────────────────────────

  const validateStart = Date.now();
  const quality = validateContent(cleaned, extracted.title || doc.title);

  layers.push({
    name: 'validate',
    inputSize: cleaned.length,
    outputSize: cleaned.length,
    removedBytes: 0,
    operations: quality.checks.map(c => `${c.name}: ${c.passed ? 'PASS' : 'FAIL'} (${c.score})`),
    durationMs: Date.now() - validateStart,
  });

  // Reject if quality gate fails
  if (!quality.passed) {
    console.log(`[knowledge-import] Rejected "${extracted.title || doc.title}": score ${quality.score}/100, warnings: ${quality.warnings.join('; ')}`);
    return null;
  }

  // ─── Split into sections ──────────────────────

  const sections = splitIntoSections(cleaned);

  const totalMs = Date.now() - pipelineStart;
  const compressionRatio = doc.content.length > 0 ? 1 - (cleaned.length / doc.content.length) : 0;

  return {
    id: doc.id,
    title: extracted.title || doc.title,
    content: cleaned,
    contentType: 'text',
    sections,
    metadata: {
      sourceType: doc.sourceType,
      sourcePath: doc.sourcePath,
      sourceUrl: doc.sourceUrl,
      author: extracted.author,
      lastModified: doc.lastModified,
      extractedTitle: extracted.title,
      originalSize: doc.content.length,
      cleanedSize: cleaned.length,
      compressionRatio,
      processingMs: totalMs,
      layers,
    },
    quality,
  };
}

// ─── Section Splitter ────────────────────────────────

function splitIntoSections(content: string): DocumentSection[] {
  const lines = content.split('\n');
  const sections: DocumentSection[] = [];
  let currentTitle = '';
  let currentLevel = 0;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      // Flush current section
      if (currentLines.length > 0) {
        const text = currentLines.join('\n').trim();
        if (text.length > 0) {
          sections.push({
            title: currentTitle || 'Introduction',
            content: text,
            level: currentLevel,
            wordCount: text.split(/\s+/).length,
          });
        }
      }
      currentTitle = headingMatch[2].trim();
      currentLevel = headingMatch[1].length;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Flush last section
  if (currentLines.length > 0) {
    const text = currentLines.join('\n').trim();
    if (text.length > 0) {
      sections.push({
        title: currentTitle || 'Content',
        content: text,
        level: currentLevel,
        wordCount: text.split(/\s+/).length,
      });
    }
  }

  // If no sections found, treat entire content as one section
  if (sections.length === 0 && content.trim().length > 0) {
    sections.push({
      title: 'Content',
      content: content.trim(),
      level: 0,
      wordCount: content.trim().split(/\s+/).length,
    });
  }

  return sections;
}
