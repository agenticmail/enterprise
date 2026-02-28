/**
 * Knowledge Import — Document Chunker
 *
 * Splits large documents into meaningful chunks for knowledge base entries.
 * Respects heading boundaries, paragraph breaks, and code blocks.
 */

import type { ImportDocument, ImportChunk } from './types.js';

interface ChunkOptions {
  maxChunkSize?: number;       // max chars per chunk (default 1500)
  minChunkSize?: number;       // min chars to form a chunk (default 100)
  overlapSize?: number;        // overlap between chunks for context (default 100)
  categoryId?: string;         // default category for chunks
  confidence?: number;         // default confidence (default 0.85)
}

/** Split a document into knowledge-base-ready chunks. */
export function chunkDocument(doc: ImportDocument, opts: ChunkOptions = {}): ImportChunk[] {
  const maxSize = opts.maxChunkSize ?? 1500;
  const minSize = opts.minChunkSize ?? 100;
  const categoryId = opts.categoryId ?? 'best-practices';
  const confidence = opts.confidence ?? 0.85;

  const content = doc.contentType === 'html' ? htmlToText(doc.content) : doc.content;
  if (!content || content.trim().length < minSize) return [];

  const sections = splitBySections(content);
  const chunks: ImportChunk[] = [];

  for (const section of sections) {
    if (section.content.trim().length < minSize) continue;

    // If section fits in one chunk, use it directly
    if (section.content.length <= maxSize) {
      chunks.push(makeChunk(doc, section.title || doc.title, section.content, categoryId, confidence));
      continue;
    }

    // Split large sections by paragraphs
    const paragraphs = splitByParagraphs(section.content);
    let buffer = '';
    let bufferTitle = section.title || doc.title;

    for (const para of paragraphs) {
      if (buffer.length + para.length > maxSize && buffer.length >= minSize) {
        chunks.push(makeChunk(doc, bufferTitle, buffer.trim(), categoryId, confidence));
        // Keep overlap
        const words = buffer.split(/\s+/);
        const overlapWords = words.slice(-Math.ceil(words.length * 0.1));
        buffer = overlapWords.join(' ') + '\n\n' + para;
      } else {
        buffer += (buffer ? '\n\n' : '') + para;
      }
    }

    if (buffer.trim().length >= minSize) {
      chunks.push(makeChunk(doc, bufferTitle, buffer.trim(), categoryId, confidence));
    }
  }

  return chunks;
}

function makeChunk(
  doc: ImportDocument,
  title: string,
  content: string,
  categoryId: string,
  confidence: number
): ImportChunk {
  return {
    documentId: doc.id,
    title: title.slice(0, 200),
    content,
    summary: content.slice(0, 200).replace(/\s+\S*$/, '') + (content.length > 200 ? '...' : ''),
    tags: extractTags(content),
    categoryId,
    confidence,
    sourceUrl: doc.sourceUrl,
    sourcePath: doc.sourcePath,
  };
}

/** Split markdown/text by headings (# ## ### etc.) */
function splitBySections(text: string): Array<{ title: string; content: string }> {
  const lines = text.split('\n');
  const sections: Array<{ title: string; content: string }> = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      // Flush current section
      if (currentLines.length > 0) {
        sections.push({ title: currentTitle, content: currentLines.join('\n') });
      }
      currentTitle = headingMatch[2].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Flush last section
  if (currentLines.length > 0) {
    sections.push({ title: currentTitle, content: currentLines.join('\n') });
  }

  // If no sections found (no headings), return whole doc as one section
  if (sections.length === 0) {
    sections.push({ title: '', content: text });
  }

  return sections;
}

/** Split text by double newlines (paragraph boundaries). */
function splitByParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).filter(p => p.trim().length > 0);
}

/** Extract relevant tags from content. */
function extractTags(content: string): string[] {
  const tags: Set<string> = new Set();
  const lower = content.toLowerCase();

  // Detect common knowledge categories from content
  const patterns: Array<[RegExp, string]> = [
    [/\b(api|endpoint|rest|graphql)\b/i, 'api'],
    [/\b(install|setup|getting.?started|quickstart)\b/i, 'setup'],
    [/\b(config|configuration|settings|env)\b/i, 'configuration'],
    [/\b(deploy|deployment|ci.?cd|pipeline)\b/i, 'deployment'],
    [/\b(auth|authentication|oauth|jwt|token)\b/i, 'authentication'],
    [/\b(debug|troubleshoot|error|fix|issue)\b/i, 'troubleshooting'],
    [/\b(test|testing|spec|jest|mocha)\b/i, 'testing'],
    [/\b(security|vulnerability|cve|encrypt)\b/i, 'security'],
    [/\b(database|sql|postgres|mysql|mongo)\b/i, 'database'],
    [/\b(architecture|design|pattern|structure)\b/i, 'architecture'],
  ];

  for (const [pattern, tag] of patterns) {
    if (pattern.test(lower)) tags.add(tag);
  }

  return Array.from(tags).slice(0, 5);
}

/** Comprehensive HTML → clean text conversion. */
function htmlToText(html: string): string {
  let text = html
    // Remove script, style, nav, header, footer, aside, iframe
    .replace(/<(script|style|nav|header|footer|aside|iframe|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, '')
    // Remove hidden elements
    .replace(/<[^>]*(?:display\s*:\s*none|visibility\s*:\s*hidden|aria-hidden\s*=\s*"true")[^>]*>[\s\S]*?<\/[^>]+>/gi, '')
    // Remove skip-to-content links
    .replace(/<a[^>]*skip[^>]*>.*?<\/a>/gi, '')
    // Convert headings to markdown
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, t) => '\n\n' + '#'.repeat(parseInt(level)) + ' ' + t.replace(/<[^>]+>/g, '').trim() + '\n\n')
    // Convert paragraphs
    .replace(/<p[^>]*>/gi, '\n\n')
    .replace(/<\/p>/gi, '')
    // Convert line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    // Convert ordered lists
    .replace(/<ol[^>]*>/gi, '\n')
    .replace(/<\/ol>/gi, '\n')
    // Convert unordered lists
    .replace(/<ul[^>]*>/gi, '\n')
    .replace(/<\/ul>/gi, '\n')
    // Convert list items (numbered handled by position)
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    // Convert blockquotes
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t) => '\n> ' + t.replace(/<[^>]+>/g, '').trim() + '\n')
    // Convert links — keep text, drop URL unless it's useful
    .replace(/<a[^>]*href="(#[^"]*)"[^>]*>(.*?)<\/a>/gi, '$2')  // strip anchor-only links
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2')    // keep link text only
    // Convert code blocks
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    // Convert strong/em
    .replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)[^>]*>(.*?)<\/\1>/gi, '*$2*')
    // Strip all remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&[a-z]+;/gi, ' '); // catch-all for remaining entities

  // Post-processing: clean up junk
  text = cleanContent(text);
  return text;
}

/** Remove boilerplate, navigation junk, and normalize whitespace. */
function cleanContent(text: string): string {
  return text
    // Remove anchor references like (#h_abc123)
    .replace(/\(#[a-zA-Z0-9_-]+\)/g, '')
    // Remove "Skip to main content" and similar
    .replace(/skip\s+to\s+(main\s+)?content/gi, '')
    // Remove "Table of contents" standalone lines
    .replace(/^[\s]*table\s+of\s+contents[\s]*$/gim, '')
    // Remove "Written by ... Updated ..." bylines
    .replace(/written\s+by\s+[\w\s.]+updated\s+[\w\s]+ago/gi, '')
    // Remove "Did this answer your question?" feedback prompts
    .replace(/did\s+this\s+answer\s+your\s+question\s*[😞😐😃🙁😊👍👎\s]*/gi, '')
    // Remove emoji-only lines
    .replace(/^[\s]*[😞😐😃🙁😊👍👎🎉✅❌⭐️💡🔥\s]+[\s]*$/gm, '')
    // Remove breadcrumb-style navigation (< "Page" < "Section")
    .replace(/(?:<\s*"[^"]*"\s*)+/g, '')
    // Remove "- - - - -" separator lines
    .replace(/^[\s-]{5,}$/gm, '')
    // Remove cookie/privacy notices
    .replace(/(?:we\s+use\s+cookies|cookie\s+policy|accept\s+all\s+cookies|privacy\s+policy)[^.]*\./gi, '')
    // Remove "Share this article" / "Was this helpful"
    .replace(/(?:share\s+this\s+article|was\s+this\s+(?:article\s+)?helpful)[^.]*[.?]?/gi, '')
    // Remove standalone URLs on their own line
    .replace(/^https?:\/\/[^\s]+$/gm, '')
    // Collapse multiple blank lines
    .replace(/\n{3,}/g, '\n\n')
    // Collapse multiple spaces
    .replace(/[^\S\n]{2,}/g, ' ')
    // Trim lines
    .split('\n').map(l => l.trim()).join('\n')
    // Final trim
    .trim();
}
