/**
 * Layer 2: CLEAN — Deep Content Cleaning & Normalization
 *
 * Source-agnostic. Takes extracted text and applies multiple cleaning passes:
 *   Pass 1: Structural — Remove boilerplate patterns, navigation, UI artifacts
 *   Pass 2: Content   — Normalize formatting, fix encoding, deduplicate content
 *   Pass 3: Quality   — Remove low-value content, trim noise, normalize whitespace
 *
 * Every pass reports what it removed for auditability.
 */

import type { LayerReport } from './types.js';

export interface CleanResult {
  content: string;
  report: LayerReport;
}

export function cleanContent(input: string): CleanResult {
  const start = Date.now();
  const operations: string[] = [];
  const inputSize = input.length;

  let text = input;

  // ─── Pass 1: Structural Cleaning ──────────────────

  const beforePass1 = text.length;

  // Remove anchor references (#section-id)
  text = text.replace(/\(#[a-zA-Z0-9_-]+\)/g, '');
  // Remove empty markdown links
  text = text.replace(/\[([^\]]*)\]\(\s*\)/g, '$1');
  // Remove empty anchor tags leftovers
  text = text.replace(/\[\s*\]\([^)]*\)/g, '');
  // Remove "Skip to main content", "Skip to navigation", etc.
  text = text.replace(/^.*skip\s+to\s+(?:main\s+)?(?:content|navigation|search).*$/gim, '');
  // Remove breadcrumb trails (Home > Section > Page)
  text = text.replace(/^(?:Home|Main)\s*(?:>|›|»|→)\s*(?:\w[\w\s]*(?:>|›|»|→)\s*)+\w[\w\s]*$/gm, '');
  // Remove breadcrumbs with < style (< "Page" < "Section")
  text = text.replace(/(?:<\s*"[^"]*"\s*)+/g, '');
  // Remove "Table of contents" headers + their content (list of # links)
  text = text.replace(/#{1,3}\s*(?:Table of Contents|Contents|In this (?:article|page|guide))\s*\n(?:\s*[-*]\s*\[.*?\].*\n?)*/gi, '');
  text = text.replace(/^(?:Table of [Cc]ontents|On this page|In this article)\s*$/gm, '');
  // Remove standalone "- - - -" separators
  text = text.replace(/^[\s\-–—*=]{4,}$/gm, '');
  // Remove page numbers
  text = text.replace(/^(?:Page\s+)?\d+\s*(?:of\s+\d+)?\s*$/gm, '');

  if (text.length < beforePass1) operations.push(`pass1:structural removed ${beforePass1 - text.length} chars`);

  // ─── Pass 2: Content Normalization ────────────────

  const beforePass2 = text.length;

  // Fix broken UTF-8 / mojibake
  text = text.replace(/â€™/g, "'").replace(/â€œ/g, '"').replace(/â€\u009D/g, '"');
  text = text.replace(/â€"/g, '—').replace(/â€"/g, '–').replace(/Â /g, ' ');
  text = text.replace(/Ã©/g, 'é').replace(/Ã¨/g, 'è').replace(/Ã¼/g, 'ü').replace(/Ã¶/g, 'ö');

  // Normalize quotes and dashes
  text = text.replace(/[\u2018\u2019\u201A\u201B]/g, "'");
  text = text.replace(/[\u201C\u201D\u201E\u201F]/g, '"');
  text = text.replace(/[\u2013\u2014]/g, '-');
  text = text.replace(/\u2026/g, '...');

  // Normalize bullet points
  text = text.replace(/^[\s]*[•●○◦▪▸►▹‣⁃]\s*/gm, '- ');

  // Remove zero-width characters
  text = text.replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, '');

  // Remove excessive markdown emphasis (****text****)
  text = text.replace(/\*{3,}([^*]+)\*{3,}/g, '**$1**');

  // Normalize markdown headings (ensure space after #)
  text = text.replace(/^(#{1,6})([^ #\n])/gm, '$1 $2');

  // Remove duplicate headings (same heading appearing twice in a row)
  text = text.replace(/(^#{1,6}\s+.+$)\n+\1/gm, '$1');

  // Remove repeated content blocks (paragraphs appearing multiple times)
  const paragraphs = text.split(/\n{2,}/);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const p of paragraphs) {
    const normalized = p.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalized.length < 10 || !seen.has(normalized)) {
      deduped.push(p);
      if (normalized.length >= 10) seen.add(normalized);
    }
  }
  text = deduped.join('\n\n');

  if (text.length < beforePass2) operations.push(`pass2:normalize removed ${beforePass2 - text.length} chars, deduped ${paragraphs.length - deduped.length} blocks`);

  // ─── Pass 3: Quality Trim ────────────────────────

  const beforePass3 = text.length;

  // Remove "Written by..." bylines
  text = text.replace(/(?:written|authored|published|posted)\s+by\s+[\w\s.]+(?:updated|modified|edited)?\s*[\w\s]*(?:ago)?/gi, '');
  // Remove "Did this answer your question?" type feedback
  text = text.replace(/(?:did\s+this\s+(?:answer\s+your\s+question|help)|was\s+this\s+(?:article\s+)?helpful|rate\s+this\s+article|thumbs\s+up|thumbs\s+down|yes\s+no)[^.]*[.?]?\s*[😞😐😃🙁😊👍👎☹️🙂😀\s]*/gi, '');
  // Remove "Share this article" / social sharing prompts
  text = text.replace(/(?:share\s+(?:this\s+)?(?:article|page|post)|tweet\s+this|share\s+on\s+(?:facebook|twitter|linkedin|x))[^.]*[.?]?/gi, '');
  // Remove "Subscribe to newsletter" prompts
  text = text.replace(/(?:subscribe\s+to\s+(?:our|the)?\s*(?:newsletter|updates|blog)|sign\s+up\s+for\s+(?:updates|our))[^.]*[.?]?/gi, '');
  // Remove cookie/privacy notices
  text = text.replace(/(?:we\s+use\s+cookies|cookie\s+(?:policy|preferences|settings)|accept\s+(?:all\s+)?cookies|by\s+continuing\s+to\s+(?:use|browse))[^.]*\.?/gi, '');
  // Remove "Copyright ©" lines
  text = text.replace(/^.*(?:copyright|©|\(c\))\s*\d{4}.*$/gim, '');
  // Remove "All rights reserved"
  text = text.replace(/all\s+rights?\s+reserved\.?/gi, '');
  // Remove "Last updated/modified on..."
  text = text.replace(/(?:last\s+)?(?:updated|modified|edited|reviewed)\s+(?:on\s+)?(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4}|\d+\s+\w+\s+ago)/gi, '');
  // Remove "Print this page" / "Download PDF"
  text = text.replace(/(?:print\s+this\s+(?:page|article)|download\s+(?:as\s+)?pdf|export\s+to\s+pdf)/gi, '');
  // Remove standalone URLs on their own line
  text = text.replace(/^\s*https?:\/\/[^\s]+\s*$/gm, '');
  // Remove emoji-only lines
  text = text.replace(/^\s*[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\s]+\s*$/gmu, '');
  // Remove navigation prompts ("Back to top", "Next article", "Previous page")
  text = text.replace(/^.*(?:back\s+to\s+top|next\s+(?:article|page|step)|previous\s+(?:article|page|step)|go\s+(?:back|to\s+top)).*$/gim, '');

  // Final whitespace normalization
  text = text
    .split('\n')
    .map(line => line.trimEnd())    // trim trailing spaces per line
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')  // max 2 blank lines
    .replace(/^\n+/, '')            // no leading blank lines
    .replace(/\n+$/, '')            // no trailing blank lines
    .trim();

  if (text.length < beforePass3) operations.push(`pass3:quality removed ${beforePass3 - text.length} chars`);

  return {
    content: text,
    report: {
      name: 'clean',
      inputSize,
      outputSize: text.length,
      removedBytes: inputSize - text.length,
      operations,
      durationMs: Date.now() - start,
    },
  };
}
