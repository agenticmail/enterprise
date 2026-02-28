/**
 * Layer 1: EXTRACT — Web/URL Content Extractor
 *
 * Handles: Intercom, Zendesk, Freshdesk, GitBook, ReadTheDocs, Docusaurus,
 *          MkDocs, generic help centers, blogs, docs sites.
 *
 * Strategy: Detect the platform → use platform-specific selectors → fallback to generic.
 */

import type { ContentExtractor, ExtractResult } from './types.js';

interface PlatformRule {
  detect: (html: string, url?: string) => boolean;
  name: string;
  // CSS-style selectors to find main content (checked in order)
  contentSelectors: string[];
  // Elements to remove before extraction
  removeSelectors: string[];
  // Title extraction
  titleSelector?: string;
}

const PLATFORM_RULES: PlatformRule[] = [
  {
    name: 'intercom',
    detect: (html, url) => !!(url?.includes('intercom.help') || html.includes('intercom-container') || html.includes('intercom')),
    contentSelectors: ['article__body', 'article-body', 'c__2GA', 'article__content'],
    removeSelectors: ['intercom-reaction', 'article__actions', 'article-footer', 'article__footer', 'related-articles', 'feedback'],
    titleSelector: 'article__title',
  },
  {
    name: 'zendesk',
    detect: (html, url) => !!(url?.includes('zendesk.com') || html.includes('zd-') || html.includes('zendesk')),
    contentSelectors: ['article-body', 'article_body', 'zd-article-body'],
    removeSelectors: ['article-votes', 'article-footer', 'article-sidebar', 'share-', 'follow-article'],
  },
  {
    name: 'freshdesk',
    detect: (html, url) => !!(url?.includes('freshdesk.com') || html.includes('freshdesk')),
    contentSelectors: ['article-body', 'solution-article-body', 'fr-element-'],
    removeSelectors: ['article-feedback', 'article-footer', 'article-tools'],
  },
  {
    name: 'gitbook',
    detect: (html, url) => !!(url?.includes('gitbook.io') || html.includes('gitbook') || html.includes('BookBody')),
    contentSelectors: ['page-inner', 'page-body', 'markdown-section', 'page-content-wrapper'],
    removeSelectors: ['page-footer', 'navigation', 'header', 'search-'],
  },
  {
    name: 'docusaurus',
    detect: (html) => html.includes('docusaurus') || html.includes('docs-doc-id'),
    contentSelectors: ['markdown', 'docMainContainer', 'docs-doc-page'],
    removeSelectors: ['pagination-nav', 'table-of-contents', 'theme-doc-sidebar', 'navbar', 'footer'],
  },
  {
    name: 'readthedocs',
    detect: (html, url) => !!(url?.includes('readthedocs') || html.includes('rst-content') || html.includes('wy-')),
    contentSelectors: ['rst-content', 'document', 'body-content'],
    removeSelectors: ['wy-nav-side', 'wy-nav-top', 'rst-footer', 'footer'],
  },
  {
    name: 'mkdocs',
    detect: (html) => html.includes('mkdocs') || html.includes('md-content'),
    contentSelectors: ['md-content', 'md-main', 'content'],
    removeSelectors: ['md-sidebar', 'md-header', 'md-footer', 'md-tabs'],
  },
  {
    name: 'notion',
    detect: (html, url) => !!(url?.includes('notion.so') || url?.includes('notion.site') || html.includes('notion-')),
    contentSelectors: ['notion-page-content', 'layout-content', 'notion-frame'],
    removeSelectors: ['notion-topbar', 'notion-sidebar', 'notion-overlay-container'],
  },
  {
    name: 'confluence',
    detect: (html, url) => !!(url?.includes('atlassian.net/wiki') || html.includes('confluence') || html.includes('wiki-content')),
    contentSelectors: ['wiki-content', 'confluence-information-macro', 'page-content-body'],
    removeSelectors: ['page-metadata', 'likes-section', 'content-navigation', 'page-restrictions'],
  },
  {
    name: 'medium',
    detect: (html, url) => !!(url?.includes('medium.com') || html.includes('Medium') || html.includes('graf--')),
    contentSelectors: ['postArticle-content', 'section-content', 'story-body'],
    removeSelectors: ['metabar', 'postActions', 'js-postShareWidget', 'response'],
  },
];

export class WebContentExtractor implements ContentExtractor {
  extract(raw: string, sourceUrl?: string): ExtractResult {
    // Detect platform
    const platform = PLATFORM_RULES.find(r => r.detect(raw, sourceUrl));

    // Extract title
    const title = this.extractTitle(raw, platform);

    // Extract main content
    let content = platform
      ? this.extractWithPlatformRules(raw, platform)
      : this.extractGeneric(raw);

    // Convert HTML to markdown-like text
    content = this.htmlToCleanText(content);

    // Extract author
    const author = this.extractAuthor(raw);

    return { title, content, contentType: 'text', author };
  }

  private extractTitle(html: string, platform?: PlatformRule): string {
    // Try platform-specific title
    if (platform?.titleSelector) {
      const match = this.extractByClassOrId(html, platform.titleSelector);
      if (match) return this.stripTags(match).trim();
    }

    // Try og:title
    const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]*?)"/i);
    if (ogTitle) return this.decodeEntities(ogTitle[1]);

    // Try <h1>
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) return this.stripTags(h1[1]).trim();

    // Try <title>
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (title) {
      return this.decodeEntities(title[1])
        .replace(/\s*[|–—-]\s*.+$/, '')  // remove site name suffix
        .trim();
    }

    return 'Untitled';
  }

  private extractWithPlatformRules(html: string, platform: PlatformRule): string {
    // Remove unwanted elements first
    let cleaned = html;
    for (const sel of platform.removeSelectors) {
      // Remove by class or id containing the selector
      const regex = new RegExp(`<[^>]*(?:class|id)="[^"]*${this.escRegex(sel)}[^"]*"[^>]*>[\\s\\S]*?<\\/[^>]+>`, 'gi');
      cleaned = cleaned.replace(regex, '');
    }

    // Try each content selector
    for (const sel of platform.contentSelectors) {
      const extracted = this.extractByClassOrId(cleaned, sel);
      if (extracted && extracted.length > 100) return extracted;
    }

    // Fallback to generic
    return this.extractGeneric(cleaned);
  }

  private extractGeneric(html: string): string {
    let content = html;

    // Remove definitely-not-content elements
    const removePatterns = [
      /<(script|style|noscript|iframe|svg|object|embed|applet|video|audio|canvas|map|form)[^>]*>[\s\S]*?<\/\1>/gi,
      /<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi,
      /<[^>]*(?:class|id)="[^"]*(?:nav|menu|sidebar|footer|header|cookie|banner|modal|popup|overlay|breadcrumb|pagination|social|share|comment|ad-|ads-|advert|promo|signup|newsletter|subscribe)[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi,
      /<[^>]*role="(?:navigation|banner|complementary|contentinfo|search)"[^>]*>[\s\S]*?<\/[^>]+>/gi,
      /<[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/[^>]+>/gi,
    ];

    for (const pattern of removePatterns) {
      content = content.replace(pattern, '');
    }

    // Try to find <main>, <article>, or role="main"
    const mainMatch = content.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i)
      || content.match(/<[^>]*role="main"[^>]*>([\s\S]*?)<\/[^>]+>/i);

    if (mainMatch) return mainMatch[1];

    // Try common content class names
    for (const cls of ['content', 'post-content', 'entry-content', 'article-content', 'page-content', 'main-content', 'doc-content', 'body-content']) {
      const extracted = this.extractByClassOrId(content, cls);
      if (extracted && extracted.length > 200) return extracted;
    }

    // Last resort: extract body
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return bodyMatch ? bodyMatch[1] : content;
  }

  private htmlToCleanText(html: string): string {
    return html
      // Headings → markdown
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, l, t) => '\n\n' + '#'.repeat(parseInt(l)) + ' ' + this.stripTags(t).trim() + '\n\n')
      // Paragraphs
      .replace(/<\/p>/gi, '\n\n').replace(/<p[^>]*>/gi, '')
      // Line breaks
      .replace(/<br\s*\/?>/gi, '\n')
      // Lists
      .replace(/<\/li>/gi, '\n').replace(/<li[^>]*>/gi, '- ')
      .replace(/<\/?[ou]l[^>]*>/gi, '\n')
      // Blockquotes
      .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t) => '\n> ' + this.stripTags(t).trim().replace(/\n/g, '\n> ') + '\n')
      // Code
      .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n')
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
      // Bold/italic
      .replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
      .replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*')
      // Tables → simple text
      .replace(/<tr[^>]*>/gi, '\n').replace(/<td[^>]*>/gi, ' | ').replace(/<th[^>]*>/gi, ' | ')
      .replace(/<\/?table[^>]*>/gi, '\n').replace(/<\/?t(?:head|body|foot|r|d|h)[^>]*>/gi, '')
      // Images → alt text
      .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '[$1]')
      .replace(/<img[^>]*>/gi, '')
      // Anchors → text only (drop href)
      .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
      // Strip all remaining tags
      .replace(/<[^>]+>/g, '')
      // Decode entities
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
      .replace(/&[a-z]+;/gi, ' ')
      .trim();
  }

  private extractByClassOrId(html: string, selector: string): string | null {
    // Match elements where class or id contains the selector
    const regex = new RegExp(`<([a-z][a-z0-9]*)\\s[^>]*(?:class|id)="[^"]*${this.escRegex(selector)}[^"]*"[^>]*>`, 'i');
    const match = regex.exec(html);
    if (!match) return null;

    const tag = match[1];
    const startIdx = match.index + match[0].length;
    // Find the matching closing tag (handle nesting)
    let depth = 1;
    let idx = startIdx;
    const openTag = new RegExp(`<${tag}[\\s>]`, 'gi');
    const closeTag = new RegExp(`</${tag}>`, 'gi');

    while (depth > 0 && idx < html.length) {
      openTag.lastIndex = idx;
      closeTag.lastIndex = idx;
      const nextOpen = openTag.exec(html);
      const nextClose = closeTag.exec(html);

      if (!nextClose) break;

      if (nextOpen && nextOpen.index < nextClose.index) {
        depth++;
        idx = nextOpen.index + nextOpen[0].length;
      } else {
        depth--;
        if (depth === 0) return html.slice(startIdx, nextClose.index);
        idx = nextClose.index + nextClose[0].length;
      }
    }
    return null;
  }

  private extractAuthor(html: string): string | undefined {
    const meta = html.match(/<meta\s+(?:name="author"|property="article:author")\s+content="([^"]*?)"/i);
    if (meta) return meta[1];
    const byline = html.match(/(?:by|author|written\s+by)\s*[:\s]*([A-Z][a-z]+\s+[A-Z][a-z]+)/i);
    return byline ? byline[1] : undefined;
  }

  private stripTags(html: string): string {
    return html.replace(/<[^>]+>/g, '');
  }

  private decodeEntities(text: string): string {
    return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }

  private escRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
