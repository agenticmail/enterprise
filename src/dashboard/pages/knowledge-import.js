/**
 * Knowledge Import — Dashboard UI
 *
 * Clean 2-step flow:
 *   1. Pick platform (GitHub, Google Drive, SharePoint, OneDrive, Website, Upload)
 *   2. Paste a link → Import
 *
 * Smart: detects platform from pasted URL, leverages existing OAuth connections.
 */

import { h, useState, useEffect, useRef, Fragment, useApp, engineCall, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';

// ─── Platform Definitions ────────────────────────────

const PLATFORMS = [
  {
    id: 'github', label: 'GitHub', color: '#24292e',
    desc: 'Import from a repository',
    icon: () => h('svg', { viewBox: '0 0 24 24', width: 28, height: 28, fill: 'currentColor' },
      h('path', { d: 'M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z' })
    ),
    placeholder: 'https://github.com/owner/repo',
    helpText: 'Paste a GitHub repo URL. We\'ll import README and all docs.',
    extraFields: [
      { name: 'branch', label: 'Branch', placeholder: 'main', helpText: 'Leave empty for default branch' },
      { name: 'docsPath', label: 'Docs folder', placeholder: 'docs/', helpText: 'Only import from this folder (optional)' },
      { name: 'token', label: 'Personal access token', type: 'password', placeholder: 'ghp_...', helpText: 'Required for private repos' },
    ],
    buildConfig: (url, extra) => ({ repoUrl: url, branch: extra.branch || '', docsPath: extra.docsPath || '', token: extra.token || '', includeReadme: true }),
    sourceType: 'github',
  },
  {
    id: 'google-drive', label: 'Google Drive', color: '#4285F4',
    desc: 'Import from a Drive folder',
    icon: () => h('svg', { viewBox: '0 0 24 24', width: 28, height: 28 },
      h('path', { d: 'M7.71 3.5L1.15 15l3.43 5.96h6.56L4.57 9.46z', fill: '#0066DA' }),
      h('path', { d: 'M16.29 3.5H7.71l6.57 11.5h8.57z', fill: '#00AC47' }),
      h('path', { d: 'M22.85 15H14.28l-3.42 5.96h8.56z', fill: '#EA4335' }),
      h('path', { d: 'M7.71 3.5l-3.14 5.96L14.28 15l3.43-5.96z', fill: '#00832D', opacity: 0.5 })
    ),
    placeholder: 'https://drive.google.com/drive/folders/...',
    helpText: 'Paste a Google Drive folder link. Make sure the folder is shared.',
    extraFields: [
      { name: 'accessToken', label: 'Access token', type: 'password', helpText: 'OAuth token with Drive read scope. Leave empty if Google Workspace is connected.' },
    ],
    buildConfig: (url, extra) => ({ sourceMode: 'drive', driveUrl: url, accessToken: extra.accessToken || '' }),
    sourceType: 'google-sites',
  },
  {
    id: 'google-sites', label: 'Google Sites', color: '#4285F4',
    desc: 'Import a published site',
    icon: () => h('svg', { viewBox: '0 0 24 24', width: 28, height: 28 },
      h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 3, fill: '#4285F4' }),
      h('rect', { x: 6, y: 7, width: 12, height: 2, rx: 1, fill: '#fff' }),
      h('rect', { x: 6, y: 11, width: 8, height: 2, rx: 1, fill: '#fff', opacity: 0.7 }),
      h('rect', { x: 6, y: 15, width: 10, height: 2, rx: 1, fill: '#fff', opacity: 0.5 })
    ),
    placeholder: 'https://sites.google.com/view/your-site',
    helpText: 'Paste the published Google Site URL. Must be publicly accessible.',
    extraFields: [],
    buildConfig: (url) => ({ sourceMode: 'site', siteUrl: url }),
    sourceType: 'google-sites',
  },
  {
    id: 'sharepoint', label: 'SharePoint', color: '#038387',
    desc: 'Import from SharePoint Online',
    icon: () => h('svg', { viewBox: '0 0 24 24', width: 28, height: 28 },
      h('circle', { cx: 10, cy: 8, r: 6, fill: '#038387' }),
      h('circle', { cx: 15, cy: 13, r: 5, fill: '#05a6a6' }),
      h('circle', { cx: 10, cy: 16, r: 4, fill: '#37c6d0' })
    ),
    placeholder: 'https://contoso.sharepoint.com/sites/docs',
    helpText: 'Paste a SharePoint site URL.',
    extraFields: [
      { name: 'tenantId', label: 'Azure Tenant ID', placeholder: 'xxxxxxxx-xxxx-...', helpText: 'Found in Azure Portal > Azure Active Directory' },
      { name: 'clientId', label: 'App Client ID', placeholder: 'xxxxxxxx-xxxx-...' },
      { name: 'clientSecret', label: 'App Client Secret', type: 'password' },
      { name: 'libraryName', label: 'Document Library', placeholder: 'Shared Documents', helpText: 'Leave empty for default' },
    ],
    buildConfig: (url, extra) => ({ siteUrl: url, tenantId: extra.tenantId || '', clientId: extra.clientId || '', clientSecret: extra.clientSecret || '', libraryName: extra.libraryName || '', includePages: true }),
    sourceType: 'sharepoint',
  },
  {
    id: 'onedrive', label: 'OneDrive', color: '#0078D4',
    desc: 'Import from OneDrive folder',
    icon: () => h('svg', { viewBox: '0 0 24 24', width: 28, height: 28 },
      h('path', { d: 'M10.5 18.5h8.5a4 4 0 001.26-7.8 5.5 5.5 0 00-10.17-1.82A4.5 4.5 0 005.5 18.5h5z', fill: '#0078D4' }),
      h('path', { d: 'M10.5 18.5h8.5a4 4 0 001.26-7.8 5.5 5.5 0 00-5.76-4.2 4.5 4.5 0 00-8.5 1.38A4.5 4.5 0 005.5 18.5h5z', fill: '#0078D4', opacity: 0.7 })
    ),
    placeholder: 'https://onedrive.live.com/...',
    helpText: 'Paste a OneDrive shared folder link.',
    extraFields: [
      { name: 'tenantId', label: 'Azure Tenant ID', placeholder: 'xxxxxxxx-xxxx-...' },
      { name: 'clientId', label: 'App Client ID', placeholder: 'xxxxxxxx-xxxx-...' },
      { name: 'clientSecret', label: 'App Client Secret', type: 'password' },
    ],
    buildConfig: (url, extra) => ({ siteUrl: url, tenantId: extra.tenantId || '', clientId: extra.clientId || '', clientSecret: extra.clientSecret || '' }),
    sourceType: 'sharepoint', // OneDrive uses same MS Graph API
  },
  {
    id: 'confluence', label: 'Confluence', color: '#0052CC',
    desc: 'Import from Confluence space',
    icon: () => h('svg', { viewBox: '0 0 24 24', width: 28, height: 28, fill: '#0052CC' },
      h('path', { d: 'M3.24 16.57c-.2.33-.43.71-.63 1a.49.49 0 00.18.68l3.37 2.07a.49.49 0 00.68-.16c.17-.29.39-.65.65-1.05 1.84-2.84 3.68-2.5 7-1l3.5 1.58a.49.49 0 00.65-.24l1.6-3.6a.49.49 0 00-.24-.64c-.54-.25-1.58-.71-2.7-1.2-5.12-2.24-9.02-2.3-14.06 2.56z' }),
      h('path', { d: 'M20.76 7.43c.2-.33.43-.71.63-1a.49.49 0 00-.18-.68L17.84 3.7a.49.49 0 00-.68.16c-.17.29-.39.65-.65 1.05-1.84 2.84-3.68 2.5-7 1l-3.5-1.58a.49.49 0 00-.65.24l-1.6 3.6a.49.49 0 00.24.64c.54.25 1.58.71 2.7 1.2 5.12 2.24 9.02 2.3 14.06-2.56z' })
    ),
    placeholder: 'https://yourcompany.atlassian.net/wiki/spaces/DOCS',
    helpText: 'Paste a Confluence space URL.',
    extraFields: [
      { name: 'email', label: 'Atlassian email' },
      { name: 'apiToken', label: 'API token', type: 'password', helpText: 'Generate at id.atlassian.com/manage-profile/security/api-tokens' },
    ],
    buildConfig: (url, extra) => ({ url, crawlMode: 'crawl', maxPages: '100' }),
    sourceType: 'url',
    comingSoon: false,
  },
  {
    id: 'notion', label: 'Notion', color: '#000',
    desc: 'Import Notion pages',
    icon: () => h('svg', { viewBox: '0 0 24 24', width: 28, height: 28, fill: 'currentColor' },
      h('path', { d: 'M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.56 2.41c-.42-.326-.98-.7-2.055-.607L3.68 2.932c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.84-.046.933-.56.933-1.167V6.354c0-.606-.233-.933-.746-.886l-15.177.886c-.56.047-.747.327-.747.934zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.747 0-.933-.234-1.494-.934l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.222.187c-.093-.187 0-.653.327-.746l.84-.234V8.72L7.36 8.58c-.093-.42.14-1.026.793-1.073l3.456-.234 4.764 7.28V8.253l-1.214-.14c-.093-.514.28-.886.747-.933z' })
    ),
    placeholder: 'https://notion.so/your-page-id',
    helpText: 'Paste a Notion page or database URL.',
    extraFields: [
      { name: 'apiKey', label: 'Notion API key', type: 'password', helpText: 'Create an integration at notion.so/my-integrations' },
    ],
    buildConfig: (url, extra) => ({ url, crawlMode: 'single' }),
    sourceType: 'url',
    comingSoon: true,
  },
  {
    id: 'website', label: 'Website', color: '#6366f1',
    desc: 'Crawl any docs site',
    icon: () => h('svg', { viewBox: '0 0 24 24', width: 28, height: 28, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
      h('circle', { cx: 12, cy: 12, r: 10 }),
      h('path', { d: 'M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z' })
    ),
    placeholder: 'https://docs.example.com',
    helpText: 'Paste any documentation URL. We\'ll crawl and import all pages.',
    extraFields: [
      { name: 'crawlMode', label: 'Import mode', type: 'select', options: [
        { value: 'crawl', label: 'Crawl site (follow links)' },
        { value: 'sitemap', label: 'Use sitemap.xml' },
        { value: 'single', label: 'Single page only' },
      ]},
      { name: 'maxPages', label: 'Max pages', placeholder: '50' },
    ],
    buildConfig: (url, extra) => ({ url, crawlMode: extra.crawlMode || 'crawl', maxPages: extra.maxPages || '50' }),
    sourceType: 'url',
  },
  {
    id: 'upload', label: 'File Upload', color: '#22c55e',
    desc: 'Upload files directly',
    icon: () => h('svg', { viewBox: '0 0 24 24', width: 28, height: 28, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
      h('path', { d: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12' })
    ),
    placeholder: null,
    helpText: 'Upload markdown, HTML, TXT, or PDF files.',
    extraFields: [],
    isUpload: true,
    buildConfig: () => ({}),
    sourceType: 'file-upload',
  },
];

// Auto-detect platform from URL
function detectPlatform(url) {
  if (!url) return null;
  if (url.includes('github.com')) return 'github';
  if (url.includes('drive.google.com')) return 'google-drive';
  if (url.includes('sites.google.com')) return 'google-sites';
  if (url.includes('sharepoint.com')) return 'sharepoint';
  if (url.includes('onedrive.live.com') || url.includes('1drv.ms')) return 'onedrive';
  if (url.includes('atlassian.net/wiki') || url.includes('confluence')) return 'confluence';
  if (url.includes('notion.so') || url.includes('notion.site')) return 'notion';
  return null;
}

// ─── Main Component ──────────────────────────────────

export function KnowledgeImportWizard({ kbId, kbName, onClose, onDone }) {
  const { toast } = useApp();
  const [platform, setPlatform] = useState(null);
  const [url, setUrl] = useState('');
  const [extra, setExtra] = useState({});
  const [showExtra, setShowExtra] = useState(false);
  const [importing, setImporting] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const pollRef = useRef(null);

  // Poll job progress
  useEffect(() => {
    if (!jobId) return;
    const poll = () => {
      engineCall('/knowledge-import/jobs/' + jobId)
        .then(d => {
          setJob(d.job);
          if (d.job && ['completed', 'failed', 'cancelled'].includes(d.job.status)) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        })
        .catch(() => {});
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId]);

  // Auto-detect platform when URL changes
  const handleUrlChange = (val) => {
    setUrl(val);
    const detected = detectPlatform(val);
    if (detected && !platform) setPlatform(detected);
  };

  const startImport = async () => {
    const plat = PLATFORMS.find(p => p.id === platform);
    if (!plat) return;

    setImporting(true);
    try {
      const config = plat.buildConfig(url, extra);
      // Validate first
      const val = await engineCall('/knowledge-import/validate', {
        method: 'POST',
        body: JSON.stringify({ sourceType: plat.sourceType, config }),
      });
      if (!val.valid) {
        toast(val.error || 'Validation failed', 'error');
        setImporting(false);
        return;
      }

      // Start
      const res = await engineCall('/knowledge-import/start', {
        method: 'POST',
        body: JSON.stringify({
          orgId: getOrgId(),
          baseId: kbId,
          sourceType: plat.sourceType,
          config,
        }),
      });
      setJobId(res.job.id);
      setJob(res.job);
    } catch (e) {
      toast(e.message || 'Import failed', 'error');
      setImporting(false);
    }
  };

  const cancelJob = async () => {
    if (!jobId) return;
    try {
      await engineCall('/knowledge-import/jobs/' + jobId + '/cancel', { method: 'POST' });
      toast('Import cancelled', 'info');
    } catch (e) { toast(e.message, 'error'); }
  };

  // ─── Job Running / Complete ──────

  if (jobId && job) {
    const prog = job.progress || {};
    const done = ['completed', 'failed', 'cancelled'].includes(job.status);
    const pct = prog.totalItems > 0 ? Math.round((prog.processedItems / prog.totalItems) * 100) : (done ? 100 : 0);
    const success = job.status === 'completed';

    return h(Modal, {
      title: done ? (success ? 'Import Complete' : job.status === 'cancelled' ? 'Import Cancelled' : 'Import Failed') : 'Importing...',
      onClose: done ? () => { onDone && onDone(); onClose(); } : undefined,
    },
      h('div', { style: { textAlign: 'center', padding: '24px 0' } },
        // Progress ring
        h('div', { style: { position: 'relative', width: 100, height: 100, margin: '0 auto 20px' } },
          h('svg', { viewBox: '0 0 100 100', width: 100, height: 100 },
            h('circle', { cx: 50, cy: 50, r: 42, fill: 'none', stroke: 'var(--border)', strokeWidth: 6 }),
            h('circle', { cx: 50, cy: 50, r: 42, fill: 'none', stroke: done ? (success ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)') : 'var(--accent, #6366f1)', strokeWidth: 6, strokeLinecap: 'round', strokeDasharray: 2 * Math.PI * 42, strokeDashoffset: 2 * Math.PI * 42 * (1 - pct / 100), transform: 'rotate(-90 50 50)', style: { transition: 'stroke-dashoffset 0.5s' } })
          ),
          h('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } },
            h('div', { style: { fontSize: 24, fontWeight: 700 } }, pct + '%'),
          )
        ),

        // Status
        !done && h('div', { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'capitalize' } }, prog.phase || 'starting...'),
        prog.currentItem && !done && h('div', { style: { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', maxWidth: 350, margin: '0 auto 16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, prog.currentItem),

        // Stats row
        h('div', { style: { display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 16 } },
          stat('Discovered', prog.totalItems || 0),
          stat('Imported', prog.importedItems || 0, 'var(--success, #22c55e)'),
          prog.skippedItems > 0 && stat('Skipped', prog.skippedItems, 'var(--warning, #f59e0b)'),
          prog.failedItems > 0 && stat('Failed', prog.failedItems, 'var(--danger, #ef4444)'),
        ),

        // Error message
        !success && done && job.error && h('div', { style: { background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, fontSize: 13, color: 'var(--danger)', marginBottom: 16, textAlign: 'left', maxWidth: 400, margin: '0 auto 16px' } }, job.error),

        // Actions
        done
          ? h('button', { className: 'btn btn-primary', onClick: () => { onDone && onDone(); onClose(); } }, 'Done')
          : h('button', { className: 'btn btn-secondary btn-sm', onClick: cancelJob }, 'Cancel'),
      )
    );
  }

  // ─── Platform Picker + Config ──────

  const selectedPlat = PLATFORMS.find(p => p.id === platform);

  return h(Modal, { title: 'Import Documentation', onClose, wide: true },

    // Target KB
    h('div', { style: { background: 'var(--bg-secondary)', padding: '10px 16px', borderRadius: 8, marginBottom: 20, fontSize: 13 } },
      'Importing into: ', h('strong', null, kbName || kbId)
    ),

    // Smart URL bar (always visible)
    !selectedPlat?.isUpload && h('div', { style: { marginBottom: 20 } },
      h('div', { style: { position: 'relative' } },
        h('input', {
          className: 'input',
          value: url,
          onChange: e => handleUrlChange(e.target.value),
          placeholder: selectedPlat ? selectedPlat.placeholder : 'Paste a link to your documentation (GitHub, Drive, SharePoint, any URL...)',
          style: { width: '100%', fontSize: 14, padding: '12px 16px', paddingRight: importing ? 16 : url && platform ? 100 : 16 },
          autoFocus: true,
        }),
        url && platform && !importing && h('button', {
          className: 'btn btn-primary btn-sm',
          onClick: startImport,
          style: { position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' },
        }, 'Import'),
      ),
      selectedPlat && selectedPlat.helpText && h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 6 } }, selectedPlat.helpText),
    ),

    // Platform grid
    h('div', { style: { marginBottom: 16 } },
      h('div', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' } }, platform ? 'Source' : 'Or choose a platform'),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 } },
        PLATFORMS.filter(p => !p.comingSoon).map(p =>
          h('div', {
            key: p.id,
            onClick: () => { setPlatform(p.id); setExtra({}); setShowExtra(false); },
            style: {
              padding: '14px 12px', borderRadius: 10, border: platform === p.id ? '2px solid var(--accent, #6366f1)' : '1px solid var(--border)',
              background: platform === p.id ? 'var(--bg-secondary)' : 'var(--bg-card)',
              cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
              opacity: p.comingSoon ? 0.4 : 1,
            },
            onMouseEnter: e => { if (!p.comingSoon) e.currentTarget.style.borderColor = 'var(--accent, #6366f1)'; },
            onMouseLeave: e => { if (platform !== p.id) e.currentTarget.style.borderColor = 'var(--border)'; },
          },
            h('div', { style: { marginBottom: 6, color: 'var(--text)' } }, p.icon()),
            h('div', { style: { fontSize: 12, fontWeight: 600 } }, p.label),
            h('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 2 } }, p.desc),
          )
        )
      ),

      // Coming soon row
      h('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
        PLATFORMS.filter(p => p.comingSoon).map(p =>
          h('div', { key: p.id, style: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', opacity: 0.4, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 } },
            p.icon(), p.label, h('span', { className: 'badge badge-neutral', style: { fontSize: 9 } }, 'Soon')
          )
        )
      ),
    ),

    // Extra fields (collapsible)
    selectedPlat && selectedPlat.extraFields && selectedPlat.extraFields.length > 0 && h('div', { style: { marginBottom: 16 } },
      h('button', {
        onClick: () => setShowExtra(!showExtra),
        style: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4 },
      },
        h('span', { style: { transform: showExtra ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' } }, '\u25B6'),
        'Advanced options'
      ),
      showExtra && h('div', { style: { marginTop: 10, padding: 16, background: 'var(--bg-secondary)', borderRadius: 10 } },
        selectedPlat.extraFields.map(f =>
          h('div', { key: f.name, style: { marginBottom: 12 } },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: 'var(--text)' } }, f.label),
            f.type === 'select'
              ? h('select', {
                  className: 'input', value: extra[f.name] || '',
                  onChange: e => setExtra(x => ({ ...x, [f.name]: e.target.value })),
                  style: { width: '100%' },
                }, h('option', { value: '' }, '-- Select --'), ...(f.options || []).map(o => h('option', { key: o.value, value: o.value }, o.label)))
              : h('input', {
                  className: 'input',
                  type: f.type === 'password' ? 'password' : 'text',
                  value: extra[f.name] || '',
                  onChange: e => setExtra(x => ({ ...x, [f.name]: e.target.value })),
                  placeholder: f.placeholder || '',
                  style: { width: '100%' },
                }),
            f.helpText && h('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 3 } }, f.helpText),
          )
        )
      )
    ),

    // Bottom import button (for when URL is long and button in input is hidden)
    platform && url && !importing && h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 8 } },
      h('button', { className: 'btn btn-primary', onClick: startImport }, 'Start Import'),
    ),
  );
}

function stat(label, value, color) {
  return h('div', { style: { textAlign: 'center' } },
    h('div', { style: { fontSize: 18, fontWeight: 700, color: color || 'var(--text)' } }, value),
    h('div', { style: { fontSize: 10, color: 'var(--text-muted)' } }, label),
  );
}

// ─── Import Jobs List ────────────────────────────────

export function ImportJobsList({ kbId }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    engineCall('/knowledge-import/jobs?orgId=' + getOrgId())
      .then(d => {
        let all = d.jobs || [];
        if (kbId) all = all.filter(j => j.baseId === kbId);
        setJobs(all);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [kbId]);

  if (loading) return null;
  if (jobs.length === 0) return null;

  return h('div', { className: 'card', style: { marginTop: 16 } },
    h('div', { className: 'card-header' },
      h('h3', { style: { margin: 0, fontSize: 14 } }, 'Import History'),
    ),
    h('div', { className: 'card-body-flush' },
      h('table', null,
        h('thead', null, h('tr', null,
          h('th', null, 'Source'),
          h('th', null, 'Status'),
          h('th', null, 'Imported'),
          h('th', null, 'Date'),
        )),
        h('tbody', null, jobs.map(j =>
          h('tr', { key: j.id },
            h('td', { style: { fontSize: 13, fontWeight: 500, textTransform: 'capitalize' } }, j.sourceType.replace(/-/g, ' ')),
            h('td', null, statusBadge(j.status)),
            h('td', { style: { fontSize: 13 } }, (j.progress?.importedItems || 0) + ' / ' + (j.progress?.totalItems || 0)),
            h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } }, j.createdAt ? new Date(j.createdAt).toLocaleDateString() : '-'),
          )
        ))
      )
    )
  );
}

function statusBadge(status) {
  const map = { completed: 'success', failed: 'danger', running: 'info', pending: 'neutral', cancelled: 'warning' };
  return h('span', { className: 'badge badge-' + (map[status] || 'neutral') }, status);
}
