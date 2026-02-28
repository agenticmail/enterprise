/**
 * Knowledge Import — GitHub Provider
 *
 * Imports documentation from public (or private with token) GitHub repositories.
 * Supports: README, docs folders, wiki, markdown/text files.
 */

import type { ImportProvider, ImportDocument, ImportConfigField } from './types.js';

const IMPORTABLE_EXTENSIONS = ['.md', '.mdx', '.txt', '.rst', '.adoc', '.html', '.htm'];
const SKIP_PATHS = ['node_modules', '.git', 'vendor', 'dist', 'build', '__pycache__', '.next', '.nuxt'];
const MAX_FILE_SIZE = 500_000; // 500KB per file

export class GitHubImportProvider implements ImportProvider {
  type = 'github' as const;

  getConfigFields(): ImportConfigField[] {
    return [
      { name: 'repoUrl', label: 'Repository URL', type: 'url', placeholder: 'https://github.com/owner/repo', required: true, helpText: 'Full URL to the GitHub repository' },
      { name: 'branch', label: 'Branch', type: 'text', placeholder: 'main', helpText: 'Branch to import from (defaults to main)' },
      { name: 'docsPath', label: 'Docs Path', type: 'text', placeholder: 'docs/', helpText: 'Only import files from this directory (leave empty for entire repo)' },
      { name: 'token', label: 'GitHub Token', type: 'password', placeholder: 'ghp_...', helpText: 'Required for private repos. Use a fine-grained personal access token with "Contents" read access.' },
      { name: 'includeReadme', label: 'Include README files', type: 'checkbox', helpText: 'Import README.md files from the root and subdirectories' },
      { name: 'maxDepth', label: 'Max Directory Depth', type: 'text', placeholder: '5', helpText: 'Maximum folder depth to scan (default 5)' },
    ];
  }

  async validate(config: Record<string, any>): Promise<{ valid: boolean; error?: string }> {
    const { repoUrl } = config;
    if (!repoUrl) return { valid: false, error: 'Repository URL is required' };

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) return { valid: false, error: 'Invalid GitHub URL. Use format: https://github.com/owner/repo' };

    // Check repo accessibility
    try {
      const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'AgenticMail-KnowledgeImport' };
      if (config.token) headers['Authorization'] = `Bearer ${config.token}`;

      const resp = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, { headers });
      if (resp.status === 404) return { valid: false, error: 'Repository not found. Check the URL or provide a token for private repos.' };
      if (resp.status === 401) return { valid: false, error: 'Authentication failed. Check your GitHub token.' };
      if (!resp.ok) return { valid: false, error: `GitHub API error: ${resp.status} ${resp.statusText}` };

      return { valid: true };
    } catch (e: any) {
      return { valid: false, error: `Failed to reach GitHub: ${e.message}` };
    }
  }

  async *discover(config: Record<string, any>): AsyncGenerator<ImportDocument> {
    const parsed = parseGitHubUrl(config.repoUrl);
    if (!parsed) return;

    const branch = config.branch || 'main';
    const docsPath = (config.docsPath || '').replace(/^\/|\/$/g, '');
    const maxDepth = parseInt(config.maxDepth) || 5;
    const includeReadme = config.includeReadme !== false;
    const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'AgenticMail-KnowledgeImport' };
    if (config.token) headers['Authorization'] = `Bearer ${config.token}`;

    // Use the Git Trees API for efficient full-tree listing
    const treeUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${branch}?recursive=1`;
    const treeResp = await fetch(treeUrl, { headers });
    if (!treeResp.ok) {
      throw new Error(`Failed to fetch repo tree: ${treeResp.status} ${treeResp.statusText}`);
    }

    const treeData = await treeResp.json() as { tree: Array<{ path: string; type: string; size?: number; sha: string }> };

    for (const item of treeData.tree) {
      if (item.type !== 'blob') continue;

      // Check path filters
      if (docsPath && !item.path.startsWith(docsPath + '/') && item.path !== docsPath) continue;

      // Check depth
      const depth = item.path.split('/').length;
      if (depth > maxDepth) continue;

      // Skip common non-doc directories
      if (SKIP_PATHS.some(skip => item.path.includes('/' + skip + '/') || item.path.startsWith(skip + '/'))) continue;

      // Check extension
      const ext = '.' + item.path.split('.').pop()?.toLowerCase();
      const isReadme = /readme/i.test(item.path.split('/').pop() || '');

      if (!IMPORTABLE_EXTENSIONS.includes(ext) && !isReadme) continue;
      if (isReadme && !includeReadme) continue;

      // Skip large files
      if (item.size && item.size > MAX_FILE_SIZE) continue;

      // Fetch file content
      try {
        const contentUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${item.path}?ref=${branch}`;
        const contentResp = await fetch(contentUrl, { headers });
        if (!contentResp.ok) continue;

        const fileData = await contentResp.json() as { content?: string; encoding?: string; html_url?: string; size: number };
        if (!fileData.content) continue;

        // Decode base64 content
        const rawContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
        const filename = item.path.split('/').pop() || item.path;
        const title = filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

        yield {
          id: `github-${parsed.owner}-${parsed.repo}-${item.sha.slice(0, 8)}`,
          sourceType: 'github',
          sourcePath: item.path,
          sourceUrl: fileData.html_url || `https://github.com/${parsed.owner}/${parsed.repo}/blob/${branch}/${item.path}`,
          title: isReadme ? `${item.path.split('/').slice(0, -1).join('/') || parsed.repo} README` : title,
          content: rawContent,
          contentType: ext === '.html' || ext === '.htm' ? 'html' : 'markdown',
          metadata: {
            repo: `${parsed.owner}/${parsed.repo}`,
            branch,
            sha: item.sha,
            filename,
          },
          size: fileData.size,
        };

        // Rate limit: small delay between file fetches
        await sleep(100);
      } catch {
        // Skip files that fail to fetch
        continue;
      }
    }
  }
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Match: https://github.com/owner/repo(.git)
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
