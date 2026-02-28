/**
 * Layer 1: EXTRACT — SharePoint/OneDrive Content Extractor
 *
 * Handles: SharePoint pages, Word docs (HTML export), OneDrive files.
 * Strips: SharePoint chrome, metadata panels, version history, ribbon UI,
 *         Microsoft-specific markup (mso-*, o:p, v:shape).
 */

import type { ContentExtractor, ExtractResult } from './types.js';

export class SharePointContentExtractor implements ContentExtractor {
  extract(raw: string, sourceUrl?: string): ExtractResult {
    let content = raw;

    // If HTML (SharePoint page or Word export)
    if (content.includes('<html') || content.includes('<div') || content.includes('mso-')) {
      content = this.cleanSharePointHtml(content);
    }

    // Extract title
    const titleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      || content.match(/^#\s+(.+)/m);
    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s*[-–|]\s*SharePoint.*$/i, '').trim()
      : 'Untitled';

    // Convert remaining HTML to text
    content = this.htmlToText(content);

    return { title, content: content.trim(), contentType: 'text' };
  }

  private cleanSharePointHtml(html: string): string {
    return html
      // Remove Microsoft Office markup
      .replace(/<o:p>[\s\S]*?<\/o:p>/gi, '')
      .replace(/<v:[^>]*>[\s\S]*?<\/v:[^>]+>/gi, '')
      .replace(/<w:[^>]*>[\s\S]*?<\/w:[^>]+>/gi, '')
      // Remove mso-* styles (Word HTML export junk)
      .replace(/\s*mso-[^;:"']+:[^;:"']+;?/gi, '')
      .replace(/\s*style="[\s;]*"/gi, '')
      // Remove SharePoint UI elements
      .replace(/<[^>]*(?:class|id)="[^"]*(?:ms-rte|ms-webpart|ms-core|ms-srch|ms-nav|ms-menu|ExternalClass|MsoNormal)[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi, '')
      // Remove empty spans from Word export
      .replace(/<span[^>]*>\s*<\/span>/gi, '')
      // Remove conditional comments (IE-specific)
      .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
      // Remove SharePoint metadata tables
      .replace(/<table[^>]*(?:class|id)="[^"]*(?:propertysheet|metadata|versionTable)[^"]*"[^>]*>[\s\S]*?<\/table>/gi, '')
      // Remove ribbon/command bar
      .replace(/<[^>]*(?:class|id)="[^"]*(?:ribbon|commandBar|suiteBar|globalNav)[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi, '');
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, l, t) => '\n\n' + '#'.repeat(parseInt(l)) + ' ' + t.replace(/<[^>]+>/g, '').trim() + '\n\n')
      .replace(/<\/p>/gi, '\n\n').replace(/<p[^>]*>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ').replace(/<\/li>/gi, '\n')
      .replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
      .replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
