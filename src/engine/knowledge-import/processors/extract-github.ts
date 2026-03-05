/**
 * Layer 1: EXTRACT — GitHub Content Extractor
 *
 * Handles: README.md, docs/, wiki, markdown files, RST, AsciiDoc.
 * Strips GitHub-specific artifacts: badges, CI status, contribution guides,
 * auto-generated TOCs, sponsor sections, PR templates.
 */

import type { ContentExtractor, ExtractResult } from './types.js';

export class GitHubContentExtractor implements ContentExtractor {
  extract(raw: string, sourceUrl?: string): ExtractResult {
    let content = raw;
    const _isReadme = sourceUrl?.toLowerCase().includes('readme') || false;

    // Remove GitHub badge images at top of README
    content = content.replace(/^\s*(\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)\s*)+/gm, '');
    // Remove inline badge images
    content = content.replace(/!\[(?:build|ci|test|coverage|license|npm|version|downloads|stars|forks|issues|badge)[^\]]*\]\([^)]*\)/gi, '');

    // Remove auto-generated TOC markers
    content = content.replace(/<!--\s*(?:TOC|toc|table-of-contents)\s*-->/gi, '');
    content = content.replace(/<!--\s*(?:START|END)\s+(?:TOC|toc|doctoc)[^-]*-->/gi, '');
    // Remove doctoc-generated TOC blocks
    content = content.replace(/<!--\s*START doctoc[\s\S]*?END doctoc\s*-->/gi, '');

    // Remove HTML comments entirely
    content = content.replace(/<!--[\s\S]*?-->/g, '');

    // Remove sponsor/funding sections
    content = content.replace(/#{1,3}\s*(?:Sponsors?|Funding|Support(?:ers)?|Backers?|Donate|Patron)\s*\n[\s\S]*?(?=\n#{1,3}\s|\n*$)/gi, '');

    // Remove contributing section if it's just a link
    content = content.replace(/#{1,3}\s*Contributing\s*\n+(?:(?:Please\s+)?(?:see|read|check)\s+.*CONTRIBUTING.*\n?)+/gi, '');

    // Remove license section if short
    content = content.replace(/#{1,3}\s*License\s*\n+(?:(?:MIT|Apache|BSD|ISC|GPL)[^\n]*\n?){1,3}/gi, '');

    // Remove "Table of Contents" sections with only links
    content = content.replace(/#{1,3}\s*(?:Table of Contents|Contents|TOC)\s*\n(?:\s*[-*]\s*\[.*?\]\(#.*?\)\s*\n?)+/gi, '');

    // Remove GitHub-specific action prompts
    content = content.replace(/^\s*> \[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/gm, '');

    // Extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : this.titleFromPath(sourceUrl || '');

    // Clean up excessive blank lines
    content = content.replace(/\n{4,}/g, '\n\n\n');

    return {
      title,
      content: content.trim(),
      contentType: 'markdown',
      sections: this.extractSections(content),
    };
  }

  private titleFromPath(path: string): string {
    const filename = path.split('/').pop() || path;
    return filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  }

  private extractSections(content: string): string[] {
    const sections: string[] = [];
    const headingRegex = /^#{1,3}\s+(.+)/gm;
    let match;
    while ((match = headingRegex.exec(content)) !== null) {
      sections.push(match[1].trim());
    }
    return sections;
  }
}
