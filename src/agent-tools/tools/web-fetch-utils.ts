/**
 * AgenticMail Agent Tools — Web Fetch Utilities
 *
 * HTML to markdown conversion, readability extraction, text truncation.
 */

export type ExtractMode = 'markdown' | 'text';

const READABILITY_MAX_HTML_CHARS = 1_000_000;
const READABILITY_MAX_ESTIMATED_NESTING_DEPTH = 3_000;

let readabilityDepsPromise:
  | Promise<{
      Readability: typeof import('@mozilla/readability').Readability;
      parseHTML: typeof import('linkedom').parseHTML;
    }>
  | undefined;

async function loadReadabilityDeps(): Promise<{
  Readability: typeof import('@mozilla/readability').Readability;
  parseHTML: typeof import('linkedom').parseHTML;
}> {
  if (!readabilityDepsPromise) {
    readabilityDepsPromise = Promise.all([import('@mozilla/readability'), import('linkedom')]).then(
      function([readability, linkedom]) {
        return {
          Readability: readability.Readability,
          parseHTML: linkedom.parseHTML,
        };
      },
    );
  }
  try {
    return await readabilityDepsPromise;
  } catch (error) {
    readabilityDepsPromise = undefined;
    throw error;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, function(_, hex) { return String.fromCharCode(Number.parseInt(hex, 16)); })
    .replace(/&#(\d+);/gi, function(_, dec) { return String.fromCharCode(Number.parseInt(dec, 10)); });
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ''));
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function htmlToMarkdown(html: string): { text: string; title?: string } {
  var titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  var title = titleMatch ? normalizeWhitespace(stripTags(titleMatch[1])) : undefined;
  var text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  text = text.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, function(_, href, body) {
    var label = normalizeWhitespace(stripTags(body));
    if (!label) return href;
    return '[' + label + '](' + href + ')';
  });
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, function(_, level, body) {
    var prefix = '#'.repeat(Math.max(1, Math.min(6, Number.parseInt(level, 10))));
    var label = normalizeWhitespace(stripTags(body));
    return '\n' + prefix + ' ' + label + '\n';
  });
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, function(_, body) {
    var label = normalizeWhitespace(stripTags(body));
    return label ? '\n- ' + label : '';
  });
  text = text
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|header|footer|table|tr|ul|ol)>/gi, '\n');
  text = stripTags(text);
  text = normalizeWhitespace(text);
  return { text, title };
}

export function markdownToText(markdown: string): string {
  var text = markdown;
  text = text.replace(/!\[[^\]]*]\([^)]+\)/g, '');
  text = text.replace(/\[([^\]]+)]\([^)]+\)/g, '$1');
  text = text.replace(/```[\s\S]*?```/g, function(block) {
    return block.replace(/```[^\n]*\n?/g, '').replace(/```/g, '');
  });
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');
  return normalizeWhitespace(text);
}

export function truncateText(
  value: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  if (value.length <= maxChars) return { text: value, truncated: false };
  return { text: value.slice(0, maxChars), truncated: true };
}

function exceedsEstimatedHtmlNestingDepth(html: string, maxDepth: number): boolean {
  var voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
  ]);

  var depth = 0;
  var len = html.length;
  for (var i = 0; i < len; i++) {
    if (html.charCodeAt(i) !== 60) continue; // '<'
    var next = html.charCodeAt(i + 1);
    if (next === 33 || next === 63) continue; // <! or <?

    var j = i + 1;
    var closing = false;
    if (html.charCodeAt(j) === 47) { closing = true; j += 1; }
    while (j < len && html.charCodeAt(j) <= 32) j += 1;

    var nameStart = j;
    while (j < len) {
      var c = html.charCodeAt(j);
      var isNameChar = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) ||
        (c >= 48 && c <= 57) || c === 58 || c === 45;
      if (!isNameChar) break;
      j += 1;
    }

    var tagName = html.slice(nameStart, j).toLowerCase();
    if (!tagName) continue;

    if (closing) { depth = Math.max(0, depth - 1); continue; }
    if (voidTags.has(tagName)) continue;

    var selfClosing = false;
    for (var k = j; k < len && k < j + 200; k++) {
      var ch = html.charCodeAt(k);
      if (ch === 62) {
        if (html.charCodeAt(k - 1) === 47) selfClosing = true;
        break;
      }
    }
    if (selfClosing) continue;

    depth += 1;
    if (depth > maxDepth) return true;
  }
  return false;
}

export async function extractReadableContent(params: {
  html: string;
  url: string;
  extractMode: ExtractMode;
}): Promise<{ text: string; title?: string } | null> {
  var fallback = function(): { text: string; title?: string } {
    var rendered = htmlToMarkdown(params.html);
    if (params.extractMode === 'text') {
      var text = markdownToText(rendered.text) || normalizeWhitespace(stripTags(params.html));
      return { text, title: rendered.title };
    }
    return rendered;
  };
  if (
    params.html.length > READABILITY_MAX_HTML_CHARS ||
    exceedsEstimatedHtmlNestingDepth(params.html, READABILITY_MAX_ESTIMATED_NESTING_DEPTH)
  ) {
    return fallback();
  }
  try {
    var deps = await loadReadabilityDeps();
    var doc = deps.parseHTML(params.html);
    try { (doc.document as { baseURI?: string }).baseURI = params.url; } catch { /* ignore */ }
    var reader = new deps.Readability(doc.document, { charThreshold: 0 });
    var parsed = reader.parse();
    if (!parsed?.content) return fallback();
    var title = parsed.title || undefined;
    if (params.extractMode === 'text') {
      var text = normalizeWhitespace(parsed.textContent ?? '');
      return text ? { text, title } : fallback();
    }
    var rendered = htmlToMarkdown(parsed.content);
    return { text: rendered.text, title: title ?? rendered.title };
  } catch {
    return fallback();
  }
}
