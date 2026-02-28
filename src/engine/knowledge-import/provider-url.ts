/**
 * Knowledge Import — URL / Web Crawler Provider
 *
 * Imports documentation from any public URL.
 * Supports: single pages, sitemaps, and shallow crawls.
 * No authentication required.
 */

import type { ImportProvider, ImportDocument, ImportConfigField } from './types.js';

const MAX_PAGES = 200;
const MAX_PAGE_SIZE = 2_000_000; // 2MB per page

export class UrlImportProvider implements ImportProvider {
  type = 'url' as const;

  getConfigFields(): ImportConfigField[] {
    return [
      { name: 'url', label: 'Documentation URL', type: 'url', placeholder: 'https://docs.example.com', required: true, helpText: 'Starting URL for the documentation site' },
      {
        name: 'crawlMode', label: 'Import Mode', type: 'select', required: true,
        options: [
          { value: 'single', label: 'Single Page — import just this URL' },
          { value: 'sitemap', label: 'Sitemap — find and import from sitemap.xml' },
          { value: 'crawl', label: 'Crawl — follow internal links (max 50 pages)' },
        ]
      },
      { name: 'maxPages', label: 'Max Pages', type: 'text', placeholder: '50', helpText: 'Maximum pages to import (default 50)' },
      { name: 'urlPattern', label: 'URL Pattern', type: 'text', placeholder: '/docs/', helpText: 'Only import pages whose URL contains this pattern (e.g. /docs/ or /api/)' },
    ];
  }

  async validate(config: Record<string, any>): Promise<{ valid: boolean; error?: string }> {
    if (!config.url) return { valid: false, error: 'URL is required' };
    try {
      new URL(config.url);
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }

    try {
      const resp = await fetch(config.url, { method: 'HEAD', redirect: 'follow' });
      if (!resp.ok) return { valid: false, error: `URL returned HTTP ${resp.status}. Ensure the page is publicly accessible.` };
      return { valid: true };
    } catch (e: any) {
      return { valid: false, error: `Cannot reach URL: ${e.message}` };
    }
  }

  async *discover(config: Record<string, any>): AsyncGenerator<ImportDocument> {
    const mode = config.crawlMode || 'single';
    const maxPages = Math.min(parseInt(config.maxPages) || 50, MAX_PAGES);
    const urlPattern = config.urlPattern || '';

    if (mode === 'single') {
      const doc = await fetchPage(config.url);
      if (doc) yield doc;
    } else if (mode === 'sitemap') {
      yield* this.discoverSitemap(config.url, maxPages, urlPattern);
    } else if (mode === 'crawl') {
      yield* this.crawlSite(config.url, maxPages, urlPattern);
    }
  }

  private async *discoverSitemap(baseUrl: string, maxPages: number, urlPattern: string): AsyncGenerator<ImportDocument> {
    const origin = new URL(baseUrl).origin;
    const sitemapUrls = [
      `${origin}/sitemap.xml`,
      `${origin}/sitemap_index.xml`,
      `${baseUrl.replace(/\/$/, '')}/sitemap.xml`,
    ];

    const pageUrls: string[] = [];

    for (const sitemapUrl of sitemapUrls) {
      try {
        const resp = await fetch(sitemapUrl);
        if (!resp.ok) continue;
        const xml = await resp.text();

        // Extract URLs from sitemap XML
        const urlMatches = xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi);
        for (const m of urlMatches) {
          const url = m[1].trim();
          // Check if it's a sub-sitemap
          if (url.endsWith('.xml')) {
            try {
              const subResp = await fetch(url);
              if (subResp.ok) {
                const subXml = await subResp.text();
                const subUrls = subXml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi);
                for (const su of subUrls) {
                  if (!su[1].endsWith('.xml')) pageUrls.push(su[1].trim());
                }
              }
            } catch { /* skip bad sub-sitemaps */ }
          } else {
            pageUrls.push(url);
          }
        }
        if (pageUrls.length > 0) break; // found a working sitemap
      } catch { continue; }
    }

    // Filter by pattern and limit
    let filtered = urlPattern
      ? pageUrls.filter(u => u.includes(urlPattern))
      : pageUrls;
    filtered = filtered.slice(0, maxPages);

    let count = 0;
    for (const url of filtered) {
      const doc = await fetchPage(url);
      if (doc) {
        yield doc;
        count++;
        if (count >= maxPages) break;
      }
      await sleep(200);
    }
  }

  private async *crawlSite(startUrl: string, maxPages: number, urlPattern: string): AsyncGenerator<ImportDocument> {
    const origin = new URL(startUrl).origin;
    const visited = new Set<string>();
    const queue: string[] = [startUrl];
    let count = 0;

    while (queue.length > 0 && count < maxPages) {
      const url = queue.shift()!;
      const normalized = url.split('#')[0].split('?')[0].replace(/\/$/, '');
      if (visited.has(normalized)) continue;
      visited.add(normalized);

      if (urlPattern && !url.includes(urlPattern)) continue;

      const doc = await fetchPage(url);
      if (!doc) continue;

      yield doc;
      count++;

      // Extract internal links from content
      const linkRegex = /href="([^"]*?)"/gi;
      let match;
      while ((match = linkRegex.exec(doc.content)) !== null) {
        let href = match[1];
        try {
          if (href.startsWith('/')) href = origin + href;
          else if (!href.startsWith('http')) continue;
          const hrefNorm = href.split('#')[0].split('?')[0].replace(/\/$/, '');
          if (hrefNorm.startsWith(origin) && !visited.has(hrefNorm)) {
            queue.push(href);
          }
        } catch { /* bad URL */ }
      }

      await sleep(200);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────

async function fetchPage(url: string): Promise<ImportDocument | null> {
  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'AgenticMail-KnowledgeImport/1.0' },
    });
    if (!resp.ok) return null;

    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('text/markdown')) {
      return null;
    }

    const html = await resp.text();
    if (html.length > MAX_PAGE_SIZE) return null;

    // Extract title
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/si);
    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/si);
    const title = (h1Match?.[1] || titleMatch?.[1] || url.split('/').pop() || 'Untitled')
      .replace(/<[^>]+>/g, '').trim();

    // Extract main content
    const mainContent = extractMainContent(html);

    if (!mainContent || mainContent.length < 50) return null;

    return {
      id: `url-${Buffer.from(url).toString('base64url').slice(0, 20)}`,
      sourceType: 'url',
      sourcePath: new URL(url).pathname,
      sourceUrl: url,
      title,
      content: contentType.includes('html') ? mainContent : html,
      contentType: contentType.includes('html') ? 'html' : contentType.includes('markdown') ? 'markdown' : 'text',
      metadata: { url, contentType },
      size: html.length,
    };
  } catch {
    return null;
  }
}

/** Extract main content, stripping nav/header/footer/scripts. */
function extractMainContent(html: string): string {
  return html
    .replace(/<(script|style|nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(main|article)[^>]*>([\s\S]*?)<\/\1>/gi, '$2')
    || html;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
