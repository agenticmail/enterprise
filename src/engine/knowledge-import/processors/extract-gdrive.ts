/**
 * Layer 1: EXTRACT — Google Drive / Google Sites Content Extractor
 *
 * Handles: Google Docs (HTML export), Google Sites pages, Google Slides (text export).
 * Strips: Google-specific wrapper divs, suggested edits, comment markers,
 *         revision metadata, Google Sites navigation/chrome.
 */

import type { ContentExtractor, ExtractResult } from './types.js';

export class GoogleDriveContentExtractor implements ContentExtractor {
  extract(raw: string, sourceUrl?: string): ExtractResult {
    const isGoogleSites = sourceUrl?.includes('sites.google.com') || raw.includes('tyJCtd');
    const isGoogleDoc = raw.includes('docs-internal-guid') || raw.includes('kix-');

    let content = raw;
    let title = 'Untitled';

    if (isGoogleSites) {
      ({ content, title } = this.extractGoogleSites(raw));
    } else if (isGoogleDoc) {
      ({ content, title } = this.extractGoogleDoc(raw));
    } else {
      // Generic: might be a plain text/markdown file from Drive
      title = this.extractTitle(raw);
    }

    // Convert any remaining HTML to text
    if (content.includes('<') && content.includes('>')) {
      content = this.htmlToText(content);
    }

    return { title, content: content.trim(), contentType: 'text' };
  }

  private extractGoogleSites(html: string): { content: string; title: string } {
    // Google Sites wraps content in divs with specific classes
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || 'Untitled')
      .replace(/<[^>]+>/g, '').replace(/\s*-\s*Google Sites\s*$/i, '').trim();

    // Remove Google Sites navigation, header, footer
    let content = html
      .replace(/<[^>]*class="[^"]*(?:navigation|yp5lHe|MnRGSb|VsJjTc|QxVDse|dR43Bb)[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi, '')
      // Remove edit buttons, share buttons
      .replace(/<[^>]*class="[^"]*(?:edit-button|share-button|fab-container)[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi, '');

    // Try to extract main content area
    const mainContent = this.extractByClass(content, 'tyJCtd') || this.extractByClass(content, 'IFjolb');
    if (mainContent) content = mainContent;

    return { content, title };
  }

  private extractGoogleDoc(html: string): { content: string; title: string } {
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || 'Untitled')
      .replace(/<[^>]+>/g, '').trim();

    let content = html
      // Remove Google Docs internal GUIDs
      .replace(/\s*id="docs-internal-guid-[^"]*"/gi, '')
      // Remove kix-* markers
      .replace(/<[^>]*class="[^"]*kix-[^"]*"[^>]*>/gi, '')
      // Remove suggested edits
      .replace(/<[^>]*class="[^"]*(?:docos-suggestion|docos-rewrite)[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi, '')
      // Remove comment anchors
      .replace(/<[^>]*class="[^"]*docos-comment[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi, '')
      // Remove Google font imports
      .replace(/<link[^>]*fonts\.googleapis[^>]*>/gi, '')
      // Clean empty styled spans
      .replace(/<span\s+style="[^"]*(?:font-weight:\s*400|font-style:\s*normal)[^"]*">([\s\S]*?)<\/span>/gi, '$1');

    return { content, title };
  }

  private extractTitle(raw: string): string {
    const h1 = raw.match(/^#\s+(.+)/m);
    if (h1) return h1[1].trim();
    const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (title) return title[1].replace(/<[^>]+>/g, '').trim();
    return 'Untitled';
  }

  private extractByClass(html: string, className: string): string | null {
    const regex = new RegExp(`<([a-z][a-z0-9]*)\\s[^>]*class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/\\1>`, 'i');
    const match = regex.exec(html);
    return match ? match[2] : null;
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, l, t) => '\n\n' + '#'.repeat(parseInt(l)) + ' ' + t.replace(/<[^>]+>/g, '').trim() + '\n\n')
      .replace(/<\/p>/gi, '\n\n').replace(/<p[^>]*>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ').replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
