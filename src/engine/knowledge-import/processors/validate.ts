/**
 * Layer 3: VALIDATE — Quality Gates & Scoring
 *
 * Runs quality checks on cleaned content before it enters the knowledge base.
 * Rejects junk, scores quality, flags warnings.
 *
 * Quality checks:
 *   1. Minimum content length (reject if too short)
 *   2. Language coherence (reject gibberish)
 *   3. Information density (reject navigation-only pages)
 *   4. Duplication ratio (reject if mostly repeated)
 *   5. Code-to-text ratio (flag if mostly code)
 *   6. Readability score
 */

import type { QualityReport, QualityCheck } from './types.js';

const MIN_CONTENT_LENGTH = 50;    // chars
const MIN_WORD_COUNT = 15;
const MIN_SENTENCE_COUNT = 2;
const MAX_DUPLICATE_RATIO = 0.4;
const MIN_QUALITY_SCORE = 30;     // out of 100

export function validateContent(content: string, _title?: string): QualityReport {
  const checks: QualityCheck[] = [];
  const warnings: string[] = [];

  // ─── Check 1: Content Length ──────────────────────

  const length = content.length;
  const lengthPassed = length >= MIN_CONTENT_LENGTH;
  checks.push({
    name: 'content_length',
    passed: lengthPassed,
    score: Math.min(100, Math.round((length / 200) * 100)),
    detail: `${length} chars (min ${MIN_CONTENT_LENGTH})`,
  });

  // ─── Check 2: Word Count & Coherence ─────────────

  const words = content.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const avgWordLength = wordCount > 0 ? words.reduce((s, w) => s + w.length, 0) / wordCount : 0;
  const wordsPassed = wordCount >= MIN_WORD_COUNT;

  // Detect gibberish: too many very short or very long words
  const shortWords = words.filter(w => w.length <= 1).length;
  const longWords = words.filter(w => w.length > 25).length;
  const gibberishRatio = (shortWords + longWords) / Math.max(wordCount, 1);
  const coherent = gibberishRatio < 0.3 && avgWordLength > 2 && avgWordLength < 20;

  checks.push({
    name: 'word_count',
    passed: wordsPassed,
    score: Math.min(100, Math.round((wordCount / 50) * 100)),
    detail: `${wordCount} words (min ${MIN_WORD_COUNT})`,
  });

  checks.push({
    name: 'coherence',
    passed: coherent,
    score: coherent ? Math.round((1 - gibberishRatio) * 100) : 10,
    detail: `avg word length ${avgWordLength.toFixed(1)}, gibberish ratio ${(gibberishRatio * 100).toFixed(0)}%`,
  });
  if (!coherent) warnings.push('Content may contain gibberish or encoded data');

  // ─── Check 3: Information Density ────────────────

  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const sentenceCount = sentences.length;
  const hasSentences = sentenceCount >= MIN_SENTENCE_COUNT;

  // Check if it's mostly links/navigation (high ratio of [] or http://)
  const linkMatches = content.match(/\[|\]|\(http|https?:\/\//g) || [];
  const linkDensity = linkMatches.length / Math.max(wordCount, 1);
  const notJustLinks = linkDensity < 0.15;

  // Check for actual informational content (has verbs, explanations)
  const hasSubstance = /\b(?:is|are|was|were|will|can|should|must|how|when|where|what|why|because|therefore|means|allows|enables|provides|requires|includes)\b/i.test(content);

  const densityScore = Math.round(
    ((hasSentences ? 40 : 0) + (notJustLinks ? 30 : 0) + (hasSubstance ? 30 : 0))
  );

  checks.push({
    name: 'information_density',
    passed: densityScore >= 40,
    score: densityScore,
    detail: `${sentenceCount} sentences, link density ${(linkDensity * 100).toFixed(0)}%, substance: ${hasSubstance}`,
  });
  if (linkDensity >= 0.15) warnings.push('High link density — may be a navigation/index page');
  if (!hasSubstance) warnings.push('Content may lack substantive information');

  // ─── Check 4: Duplication Ratio ──────────────────

  const lines = content.split('\n').filter(l => l.trim().length > 0);
  const uniqueLines = new Set(lines.map(l => l.trim().toLowerCase()));
  const dupRatio = lines.length > 0 ? 1 - (uniqueLines.size / lines.length) : 0;
  const noDuplication = dupRatio <= MAX_DUPLICATE_RATIO;

  checks.push({
    name: 'duplication',
    passed: noDuplication,
    score: Math.round((1 - dupRatio) * 100),
    detail: `${(dupRatio * 100).toFixed(0)}% duplicate lines (max ${MAX_DUPLICATE_RATIO * 100}%)`,
  });
  if (!noDuplication) warnings.push('High content duplication detected');

  // ─── Check 5: Code-to-Text Ratio ─────────────────

  const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
  const codeLength = codeBlocks.reduce((s, b) => s + b.length, 0);
  const codeRatio = length > 0 ? codeLength / length : 0;
  const notMostlyCode = codeRatio < 0.8;

  checks.push({
    name: 'code_ratio',
    passed: notMostlyCode,
    score: Math.round((1 - codeRatio) * 100),
    detail: `${(codeRatio * 100).toFixed(0)}% code blocks`,
  });
  if (codeRatio >= 0.5) warnings.push('Content is mostly code — may need context text');

  // ─── Check 6: Readability ────────────────────────

  // Simplified readability: based on sentence length and word length
  const avgSentenceLength = sentenceCount > 0 ? wordCount / sentenceCount : wordCount;
  const readabilityScore = Math.min(100, Math.max(0,
    100 - Math.abs(avgSentenceLength - 15) * 3 - Math.abs(avgWordLength - 5) * 5
  ));

  checks.push({
    name: 'readability',
    passed: readabilityScore >= 30,
    score: Math.round(readabilityScore),
    detail: `avg sentence ${avgSentenceLength.toFixed(0)} words, avg word ${avgWordLength.toFixed(1)} chars`,
  });

  // ─── Overall Score ───────────────────────────────

  const totalScore = Math.round(checks.reduce((s, c) => s + c.score, 0) / checks.length);
  const allCriticalPassed = checks.filter(c => ['content_length', 'word_count', 'coherence'].includes(c.name)).every(c => c.passed);
  const passed = allCriticalPassed && totalScore >= MIN_QUALITY_SCORE;

  if (!passed && totalScore < MIN_QUALITY_SCORE) {
    warnings.unshift(`Quality score ${totalScore}/100 below threshold ${MIN_QUALITY_SCORE}`);
  }

  return { score: totalScore, passed, checks, warnings };
}
