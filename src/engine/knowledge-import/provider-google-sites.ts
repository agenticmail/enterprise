/**
 * Knowledge Import — Google Sites / Google Drive Provider
 *
 * Imports documentation from:
 *   - Google Sites (published site pages)
 *   - Google Drive folders (Docs, Sheets, PDF, Markdown files)
 *
 * Auth options:
 *   1. Service Account JSON key (for org-owned data)
 *   2. OAuth2 access token (from vault, user-consented)
 *   3. Public sites — no auth needed (crawl published URLs)
 */

import type { ImportProvider, ImportDocument, ImportConfigField } from './types.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const EXPORT_TYPES: Record<string, { mime: string; ext: string }> = {
  'application/vnd.google-apps.document': { mime: 'text/html', ext: 'html' },
  'application/vnd.google-apps.spreadsheet': { mime: 'text/csv', ext: 'csv' },
  'application/vnd.google-apps.presentation': { mime: 'text/plain', ext: 'txt' },
};
const DIRECT_TYPES = ['text/plain', 'text/html', 'text/markdown', 'application/pdf'];
const MAX_FILE_SIZE = 10_000_000;

export class GoogleSitesImportProvider implements ImportProvider {
  type = 'google-sites' as const;

  getConfigFields(): ImportConfigField[] {
    return [
      {
        name: 'sourceMode', label: 'Import From', type: 'select', required: true,
        options: [
          { value: 'drive', label: 'Google Drive Folder' },
          { value: 'site', label: 'Published Google Site (public URL)' },
        ],
        helpText: 'Choose where to import documentation from'
      },
      { name: 'driveUrl', label: 'Google Drive Folder URL', type: 'url', placeholder: 'https://drive.google.com/drive/folders/...', helpText: 'Share link to the Google Drive folder containing your docs' },
      { name: 'siteUrl', label: 'Google Site URL', type: 'url', placeholder: 'https://sites.google.com/view/your-site', helpText: 'URL of the published Google Site to crawl' },
      { name: 'accessToken', label: 'Access Token', type: 'password', helpText: 'OAuth2 access token with Drive read scope. Get this from Dashboard > Settings > Integrations > Google.' },
      { name: 'serviceAccountKey', label: 'Service Account Key (JSON)', type: 'textarea', helpText: 'Paste the full JSON key file content for a Google Cloud service account with Drive access.' },
      { name: 'maxPages', label: 'Max Pages to Import', type: 'text', placeholder: '100', helpText: 'Maximum number of pages/files to import (default 100)' },
    ];
  }

  async validate(config: Record<string, any>): Promise<{ valid: boolean; error?: string }> {
    const mode = config.sourceMode;
    if (!mode) return { valid: false, error: 'Select an import source (Google Drive or Google Site)' };

    if (mode === 'drive') {
      if (!config.driveUrl) return { valid: false, error: 'Google Drive folder URL is required' };
      const folderId = extractDriveFolderId(config.driveUrl);
      if (!folderId) return { valid: false, error: 'Invalid Google Drive URL. Use a folder share link.' };

      const token = await resolveToken(config);
      if (!token) return { valid: false, error: 'An access token or service account key is required for Google Drive.' };

      // Test API access
      try {
        const resp = await fetch(`${DRIVE_API}/files/${folderId}?fields=id,name`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (resp.status === 404) return { valid: false, error: 'Folder not found. Check the URL and ensure it is shared with the service account.' };
        if (resp.status === 401 || resp.status === 403) return { valid: false, error: 'Access denied. Ensure the token/service account has read access to this folder.' };
        if (!resp.ok) return { valid: false, error: `Google API error: ${resp.status}` };
        return { valid: true };
      } catch (e: any) {
        return { valid: false, error: `Failed to reach Google API: ${e.message}` };
      }
    }

    if (mode === 'site') {
      if (!config.siteUrl) return { valid: false, error: 'Google Site URL is required' };
      // For public sites, just verify the URL is reachable
      try {
        const resp = await fetch(config.siteUrl, { method: 'HEAD', redirect: 'follow' });
        if (!resp.ok) return { valid: false, error: `Site not reachable (HTTP ${resp.status}). Ensure it is published publicly.` };
        return { valid: true };
      } catch (e: any) {
        return { valid: false, error: `Cannot reach site: ${e.message}` };
      }
    }

    return { valid: false, error: 'Invalid source mode' };
  }

  async *discover(config: Record<string, any>): AsyncGenerator<ImportDocument> {
    const mode = config.sourceMode;
    const maxPages = parseInt(config.maxPages) || 100;

    if (mode === 'drive') {
      yield* this.discoverDrive(config, maxPages);
    } else if (mode === 'site') {
      yield* this.discoverSite(config, maxPages);
    }
  }

  private async *discoverDrive(config: Record<string, any>, maxPages: number): AsyncGenerator<ImportDocument> {
    const folderId = extractDriveFolderId(config.driveUrl);
    if (!folderId) return;

    const token = await resolveToken(config);
    if (!token) return;

    let count = 0;
    yield* this.listDriveFolder(token, folderId, '', 0, maxPages, { count: () => count++ });
  }

  private async *listDriveFolder(
    token: string,
    folderId: string,
    pathPrefix: string,
    depth: number,
    maxPages: number,
    counter: { count: () => number }
  ): AsyncGenerator<ImportDocument> {
    if (depth > 5 || counter.count() >= maxPages) return;

    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken,files(id,name,mimeType,size,webViewLink,modifiedTime,createdTime)',
        pageSize: '100',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const resp = await fetch(`${DRIVE_API}/files?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!resp.ok) break;

      const data = await resp.json() as { files: any[]; nextPageToken?: string };
      pageToken = data.nextPageToken;

      for (const file of data.files || []) {
        if (counter.count() >= maxPages) return;

        // Recurse into folders
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          yield* this.listDriveFolder(token, file.id, `${pathPrefix}${file.name}/`, depth + 1, maxPages, counter);
          continue;
        }

        // Google Workspace files — export
        const exportType = EXPORT_TYPES[file.mimeType];
        if (exportType) {
          try {
            const exportResp = await fetch(`${DRIVE_API}/files/${file.id}/export?mimeType=${encodeURIComponent(exportType.mime)}`, {
              headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!exportResp.ok) continue;
            const content = await exportResp.text();

            yield {
              id: `gdrive-${file.id}`,
              sourceType: 'google-sites',
              sourcePath: `${pathPrefix}${file.name}`,
              sourceUrl: file.webViewLink,
              title: file.name.replace(/\.[^.]+$/, ''),
              content,
              contentType: exportType.ext === 'html' ? 'html' : 'text',
              metadata: { driveId: file.id, mimeType: file.mimeType },
              lastModified: file.modifiedTime,
              size: content.length,
            };
            counter.count();
            await sleep(100);
          } catch { continue; }
          continue;
        }

        // Direct download for text/markdown/html/pdf
        if (!DIRECT_TYPES.includes(file.mimeType)) continue;
        if (file.size > MAX_FILE_SIZE) continue;

        try {
          const dlResp = await fetch(`${DRIVE_API}/files/${file.id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (!dlResp.ok) continue;
          const content = await dlResp.text();

          const ext = file.name.split('.').pop()?.toLowerCase();
          yield {
            id: `gdrive-${file.id}`,
            sourceType: 'google-sites',
            sourcePath: `${pathPrefix}${file.name}`,
            sourceUrl: file.webViewLink,
            title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
            content,
            contentType: ext === 'html' || ext === 'htm' ? 'html' : ext === 'md' || ext === 'mdx' ? 'markdown' : 'text',
            metadata: { driveId: file.id, mimeType: file.mimeType },
            lastModified: file.modifiedTime,
            size: content.length,
          };
          counter.count();
          await sleep(100);
        } catch { continue; }
      }
    } while (pageToken);
  }

  private async *discoverSite(config: Record<string, any>, maxPages: number): AsyncGenerator<ImportDocument> {
    // Crawl a published Google Site by following internal links
    const baseUrl = config.siteUrl.replace(/\/$/, '');
    const visited = new Set<string>();
    const queue: string[] = [baseUrl];
    let count = 0;

    while (queue.length > 0 && count < maxPages) {
      const url = queue.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);

      try {
        const resp = await fetch(url, { redirect: 'follow' });
        if (!resp.ok) continue;
        const html = await resp.text();

        // Extract title
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/ - Google Sites$/, '').trim() : url.split('/').pop() || 'Untitled';

        // Extract main content (Google Sites wraps content in specific divs)
        const contentMatch = html.match(/<div[^>]*class="[^"]*tyJCtd[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);
        const content = contentMatch ? contentMatch[1] : extractBodyContent(html);

        if (content && content.length > 50) {
          yield {
            id: `gsite-${Buffer.from(url).toString('base64url').slice(0, 20)}`,
            sourceType: 'google-sites',
            sourcePath: new URL(url).pathname,
            sourceUrl: url,
            title,
            content,
            contentType: 'html',
            metadata: { crawledFrom: url },
            size: content.length,
          };
          count++;
        }

        // Find internal links to crawl
        const linkRegex = /href="([^"]*?)"/g;
        let match;
        while ((match = linkRegex.exec(html)) !== null) {
          let href = match[1];
          if (href.startsWith('/')) href = new URL(href, baseUrl).href;
          if (href.startsWith(baseUrl) && !visited.has(href) && !href.includes('#')) {
            queue.push(href);
          }
        }

        await sleep(200); // polite crawl delay
      } catch {
        continue;
      }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────

function extractDriveFolderId(url: string): string | null {
  // Match: /folders/FOLDER_ID or id=FOLDER_ID
  const match = url.match(/folders\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function resolveToken(config: Record<string, any>): Promise<string | null> {
  if (config.accessToken) return config.accessToken;

  if (config.serviceAccountKey) {
    try {
      const key = typeof config.serviceAccountKey === 'string'
        ? JSON.parse(config.serviceAccountKey)
        : config.serviceAccountKey;

      // Create JWT for service account token exchange
      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        iss: key.client_email,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      })).toString('base64url');

      // Sign with private key
      const crypto = await import('crypto');
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(`${header}.${payload}`);
      const signature = sign.sign(key.private_key, 'base64url');

      const jwt = `${header}.${payload}.${signature}`;

      const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
      });

      if (!resp.ok) return null;
      const data = await resp.json() as { access_token?: string };
      return data.access_token || null;
    } catch {
      return null;
    }
  }

  return null;
}

function extractBodyContent(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : html;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
