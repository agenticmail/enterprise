/**
 * Knowledge Import — SharePoint Provider
 *
 * Imports documentation from Microsoft SharePoint Online sites.
 * Uses Microsoft Graph API to access site pages, documents, and lists.
 *
 * Auth: Requires an Azure AD app registration with:
 *   - Sites.Read.All (application or delegated)
 *   - Files.Read.All (for document libraries)
 *
 * Flow: Client credentials → access token → Graph API calls
 */

import type { ImportProvider, ImportDocument, ImportConfigField } from './types.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const IMPORTABLE_TYPES = ['application/pdf', 'text/plain', 'text/html', 'text/markdown', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MAX_FILE_SIZE = 10_000_000; // 10MB

export class SharePointImportProvider implements ImportProvider {
  type = 'sharepoint' as const;

  getConfigFields(): ImportConfigField[] {
    return [
      { name: 'siteUrl', label: 'SharePoint Site URL', type: 'url', placeholder: 'https://contoso.sharepoint.com/sites/docs', required: true, helpText: 'Full URL to the SharePoint site containing your documentation' },
      { name: 'tenantId', label: 'Azure Tenant ID', type: 'text', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', required: true, helpText: 'Your Azure AD tenant ID (found in Azure Portal > Azure Active Directory > Overview)' },
      { name: 'clientId', label: 'Azure App Client ID', type: 'text', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', required: true, helpText: 'Application (client) ID from your Azure AD app registration' },
      { name: 'clientSecret', label: 'Azure App Client Secret', type: 'password', required: true, helpText: 'Client secret from your Azure AD app registration' },
      { name: 'libraryName', label: 'Document Library', type: 'text', placeholder: 'Shared Documents', helpText: 'Name of the document library to import from (defaults to "Shared Documents")' },
      { name: 'folderPath', label: 'Folder Path', type: 'text', placeholder: '/Documentation', helpText: 'Only import from this folder (leave empty for entire library)' },
      { name: 'includePages', label: 'Include Site Pages', type: 'checkbox', helpText: 'Also import SharePoint site pages (news, wiki pages)' },
    ];
  }

  async validate(config: Record<string, any>): Promise<{ valid: boolean; error?: string }> {
    const { siteUrl, tenantId, clientId, clientSecret } = config;
    if (!siteUrl) return { valid: false, error: 'SharePoint site URL is required' };
    if (!tenantId) return { valid: false, error: 'Azure Tenant ID is required' };
    if (!clientId) return { valid: false, error: 'Azure App Client ID is required' };
    if (!clientSecret) return { valid: false, error: 'Azure App Client Secret is required' };

    // Parse site URL
    const parsed = parseSiteUrl(siteUrl);
    if (!parsed) return { valid: false, error: 'Invalid SharePoint URL. Use format: https://tenant.sharepoint.com/sites/sitename' };

    // Try to get an access token
    try {
      const token = await getAccessToken(tenantId, clientId, clientSecret);
      if (!token) return { valid: false, error: 'Failed to authenticate with Azure AD. Check your credentials.' };

      // Verify site access
      const siteResp = await graphGet(token, `/sites/${parsed.hostname}:${parsed.sitePath}`);
      if (!siteResp) return { valid: false, error: 'Could not access the SharePoint site. Ensure the app has Sites.Read.All permission.' };

      return { valid: true };
    } catch (e: any) {
      return { valid: false, error: `Authentication failed: ${e.message}` };
    }
  }

  async *discover(config: Record<string, any>): AsyncGenerator<ImportDocument> {
    const parsed = parseSiteUrl(config.siteUrl);
    if (!parsed) return;

    const token = await getAccessToken(config.tenantId, config.clientId, config.clientSecret);
    if (!token) throw new Error('Failed to get access token');

    // Get site ID
    const site = await graphGet(token, `/sites/${parsed.hostname}:${parsed.sitePath}`);
    if (!site) throw new Error('SharePoint site not found');
    const siteId = site.id;

    // Import document library files
    const libraryName = config.libraryName || 'Shared Documents';
    yield* this.discoverLibraryFiles(token, siteId, libraryName, config.folderPath || '');

    // Import site pages if enabled
    if (config.includePages) {
      yield* this.discoverSitePages(token, siteId);
    }
  }

  private async *discoverLibraryFiles(
    token: string,
    siteId: string,
    libraryName: string,
    folderPath: string
  ): AsyncGenerator<ImportDocument> {
    // Get the drive (document library)
    const drives = await graphGet(token, `/sites/${siteId}/drives`);
    if (!drives?.value) return;

    const drive = drives.value.find((d: any) => d.name === libraryName || d.name === 'Documents');
    if (!drive) return;

    // List files recursively
    const basePath = folderPath ? `/root:${folderPath}:/children` : '/root/children';
    yield* this.listDriveItems(token, drive.id, basePath);
  }

  private async *listDriveItems(
    token: string,
    driveId: string,
    path: string,
    depth: number = 0
  ): AsyncGenerator<ImportDocument> {
    if (depth > 5) return;

    const items = await graphGet(token, `/drives/${driveId}${path}`);
    if (!items?.value) return;

    for (const item of items.value) {
      // Recurse into folders
      if (item.folder) {
        yield* this.listDriveItems(token, driveId, `/items/${item.id}/children`, depth + 1);
        continue;
      }

      // Skip non-document files
      if (!item.file) continue;
      if (item.size > MAX_FILE_SIZE) continue;

      const mimeType = item.file.mimeType || '';
      if (!IMPORTABLE_TYPES.some(t => mimeType.startsWith(t))) {
        // Also accept common doc extensions
        const ext = (item.name || '').split('.').pop()?.toLowerCase();
        if (!['md', 'mdx', 'txt', 'html', 'htm', 'docx', 'pdf'].includes(ext || '')) continue;
      }

      // Fetch content
      try {
        const contentUrl = `/drives/${driveId}/items/${item.id}/content`;
        const content = await graphGetContent(token, contentUrl);
        if (!content) continue;

        const ext = (item.name || '').split('.').pop()?.toLowerCase();
        const contentType = ext === 'html' || ext === 'htm' ? 'html'
          : ext === 'md' || ext === 'mdx' ? 'markdown'
          : ext === 'pdf' ? 'pdf'
          : 'text';

        yield {
          id: `sp-${item.id}`,
          sourceType: 'sharepoint',
          sourcePath: item.parentReference?.path ? `${item.parentReference.path}/${item.name}` : item.name,
          sourceUrl: item.webUrl,
          title: (item.name || '').replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
          content,
          contentType,
          metadata: {
            driveId: driveId,
            itemId: item.id,
            mimeType: mimeType,
            author: item.createdBy?.user?.displayName,
            lastModifiedBy: item.lastModifiedBy?.user?.displayName,
          },
          lastModified: item.lastModifiedDateTime,
          size: item.size || content.length,
        };

        await sleep(50);
      } catch {
        continue;
      }
    }
  }

  private async *discoverSitePages(token: string, siteId: string): AsyncGenerator<ImportDocument> {
    // Get site pages via Graph API
    const pages = await graphGet(token, `/sites/${siteId}/pages`);
    if (!pages?.value) return;

    for (const page of pages.value) {
      if (!page.title) continue;

      // Fetch full page content
      try {
        const pageDetail = await graphGet(token, `/sites/${siteId}/pages/${page.id}?$expand=canvasLayout`);
        const htmlContent = extractPageContent(pageDetail);
        if (!htmlContent || htmlContent.length < 50) continue;

        yield {
          id: `sp-page-${page.id}`,
          sourceType: 'sharepoint',
          sourcePath: `pages/${page.name || page.title}`,
          sourceUrl: page.webUrl,
          title: page.title,
          content: htmlContent,
          contentType: 'html',
          metadata: {
            pageId: page.id,
            pageType: page.pageLayout || 'article',
            author: page.createdBy?.user?.displayName,
          },
          lastModified: page.lastModifiedDateTime,
          size: htmlContent.length,
        };

        await sleep(50);
      } catch {
        continue;
      }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────

function parseSiteUrl(url: string): { hostname: string; sitePath: string } | null {
  try {
    const u = new URL(url);
    const hostname = u.hostname;
    const pathMatch = u.pathname.match(/^(\/sites\/[^/]+)/);
    if (!hostname.includes('sharepoint.com') || !pathMatch) return null;
    return { hostname, sitePath: pathMatch[1] };
  } catch {
    return null;
  }
}

async function getAccessToken(tenantId: string, clientId: string, clientSecret: string): Promise<string | null> {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) return null;
  const data = await resp.json() as { access_token?: string };
  return data.access_token || null;
}

async function graphGet(token: string, path: string): Promise<any> {
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
  });
  if (!resp.ok) return null;
  return resp.json();
}

async function graphGetContent(token: string, path: string): Promise<string | null> {
  const url = `${GRAPH_BASE}${path}`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
    redirect: 'follow',
  });
  if (!resp.ok) return null;
  return resp.text();
}

function extractPageContent(page: any): string {
  if (!page?.canvasLayout?.horizontalSections) return page?.description || '';
  let html = '';
  for (const section of page.canvasLayout.horizontalSections) {
    for (const column of section.columns || []) {
      for (const webPart of column.webparts || []) {
        if (webPart.innerHtml) html += webPart.innerHtml;
        else if (webPart.data?.properties?.html) html += webPart.data.properties.html;
      }
    }
  }
  return html;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
