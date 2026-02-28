/**
 * Knowledge Import — Dashboard UI
 *
 * Multi-step wizard:
 *   1. Pick a source (GitHub, SharePoint, Google, URL, Upload)
 *   2. Configure connection (URL, auth, options)
 *   3. Validate & start import
 *   4. Track progress in real-time
 *
 * Also: Import Jobs list for past/running jobs.
 */

import { h, useState, useEffect, useCallback, useRef, Fragment, useApp, engineCall, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';

// ─── Source Icons ────────────────────────────────────

const SOURCE_ICONS = {
  github: () => h('svg', { viewBox: '0 0 24 24', width: 32, height: 32, fill: 'currentColor' },
    h('path', { d: 'M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z' })
  ),
  sharepoint: () => h('svg', { viewBox: '0 0 24 24', width: 32, height: 32, fill: 'currentColor' },
    h('circle', { cx: 10, cy: 8, r: 6, fill: '#038387', opacity: 0.9 }),
    h('circle', { cx: 15, cy: 13, r: 5, fill: '#05a6a6', opacity: 0.85 }),
    h('circle', { cx: 10, cy: 16, r: 4, fill: '#37c6d0', opacity: 0.8 })
  ),
  google: () => h('svg', { viewBox: '0 0 24 24', width: 32, height: 32 },
    h('path', { d: 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z', fill: '#4285F4' }),
    h('path', { d: 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z', fill: '#34A853' }),
    h('path', { d: 'M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z', fill: '#FBBC05' }),
    h('path', { d: 'M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z', fill: '#EA4335' })
  ),
  globe: () => h('svg', { viewBox: '0 0 24 24', width: 32, height: 32, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    h('circle', { cx: 12, cy: 12, r: 10 }),
    h('path', { d: 'M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z' })
  ),
  upload: () => h('svg', { viewBox: '0 0 24 24', width: 32, height: 32, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    h('path', { d: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12' })
  ),
  confluence: () => h('svg', { viewBox: '0 0 24 24', width: 32, height: 32, fill: '#0052CC' },
    h('path', { d: 'M3.24 16.57c-.2.33-.43.71-.63 1a.49.49 0 00.18.68l3.37 2.07a.49.49 0 00.68-.16c.17-.29.39-.65.65-1.05 1.84-2.84 3.68-2.5 7-1l3.5 1.58a.49.49 0 00.65-.24l1.6-3.6a.49.49 0 00-.24-.64c-.54-.25-1.58-.71-2.7-1.2-5.12-2.24-9.02-2.3-14.06 2.56z' }),
    h('path', { d: 'M20.76 7.43c.2-.33.43-.71.63-1a.49.49 0 00-.18-.68L17.84 3.7a.49.49 0 00-.68.16c-.17.29-.39.65-.65 1.05-1.84 2.84-3.68 2.5-7 1l-3.5-1.58a.49.49 0 00-.65.24l-1.6 3.6a.49.49 0 00.24.64c.54.25 1.58.71 2.7 1.2 5.12 2.24 9.02 2.3 14.06-2.56z' })
  ),
  notion: () => h('svg', { viewBox: '0 0 24 24', width: 32, height: 32, fill: 'currentColor' },
    h('path', { d: 'M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.56 2.41c-.42-.326-.98-.7-2.055-.607L3.68 2.932c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.84-.046.933-.56.933-1.167V6.354c0-.606-.233-.933-.746-.886l-15.177.886c-.56.047-.747.327-.747.934zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.747 0-.933-.234-1.494-.934l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.222.187c-.093-.187 0-.653.327-.746l.84-.234V8.72L7.36 8.58c-.093-.42.14-1.026.793-1.073l3.456-.234 4.764 7.28V8.253l-1.214-.14c-.093-.514.28-.886.747-.933z' })
  ),
};

// ─── Main Component ──────────────────────────────────

export function KnowledgeImportWizard({ kbId, kbName, onClose, onDone }) {
  const { toast } = useApp();
  const [step, setStep] = useState('source');       // source → config → running → done
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [config, setConfig] = useState({});
  const [validating, setValidating] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const pollRef = useRef(null);

  // Load sources
  useEffect(() => {
    engineCall('/knowledge-import/sources').then(d => setSources(d.sources || [])).catch(() => {});
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Poll job progress
  useEffect(() => {
    if (!jobId) return;
    const poll = () => {
      engineCall('/knowledge-import/jobs/' + jobId)
        .then(d => {
          setJob(d.job);
          if (d.job && (d.job.status === 'completed' || d.job.status === 'failed' || d.job.status === 'cancelled')) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setStep('done');
          }
        })
        .catch(() => {});
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId]);

  const selectSource = (src) => {
    setSelectedSource(src);
    setConfig({});
    setStep('config');
  };

  const validateAndStart = async () => {
    setValidating(true);
    try {
      // Validate
      const val = await engineCall('/knowledge-import/validate', {
        method: 'POST',
        body: JSON.stringify({ sourceType: selectedSource.type, config }),
      });
      if (!val.valid) {
        toast(val.error || 'Validation failed', 'error');
        setValidating(false);
        return;
      }

      // Start import
      const res = await engineCall('/knowledge-import/start', {
        method: 'POST',
        body: JSON.stringify({
          orgId: getOrgId(),
          baseId: kbId,
          sourceType: selectedSource.type,
          config,
        }),
      });
      setJobId(res.job.id);
      setJob(res.job);
      setStep('running');
      toast('Import started', 'success');
    } catch (e) {
      toast(e.message || 'Import failed', 'error');
    }
    setValidating(false);
  };

  const cancelJob = async () => {
    if (!jobId) return;
    try {
      await engineCall('/knowledge-import/jobs/' + jobId + '/cancel', { method: 'POST' });
      toast('Import cancelled', 'info');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // ─── Step 1: Pick Source ──────

  if (step === 'source') {
    return h(Modal, { title: 'Import Documentation into ' + (kbName || 'Knowledge Base'), onClose, wide: true },
      h('p', { style: { color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 } },
        'Choose where to import your documentation from. We support GitHub repos, SharePoint, Google Drive, websites, and direct file uploads.'
      ),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 } },
        sources.map(src => {
          const IconFn = SOURCE_ICONS[src.icon] || SOURCE_ICONS.globe;
          const coming = src.configFields?.length === 0;
          return h('div', {
            key: src.type,
            onClick: coming ? undefined : () => selectSource(src),
            style: {
              padding: 20, borderRadius: 12, border: '1px solid var(--border)',
              background: 'var(--bg-card)', cursor: coming ? 'default' : 'pointer',
              transition: 'all 0.15s', opacity: coming ? 0.5 : 1,
              ':hover': !coming && { borderColor: 'var(--accent)' },
            },
            onMouseEnter: coming ? undefined : (e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)'; },
            onMouseLeave: coming ? undefined : (e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; },
          },
            h('div', { style: { marginBottom: 12, color: 'var(--text)' } }, IconFn()),
            h('div', { style: { fontWeight: 600, fontSize: 14, marginBottom: 4 } }, src.label),
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 } }, src.description),
            coming && h('div', { style: { marginTop: 8 } }, h('span', { className: 'badge badge-neutral' }, 'Coming soon'))
          );
        })
      )
    );
  }

  // ─── Step 2: Configure Source ──────

  if (step === 'config') {
    const fields = selectedSource.configFields || [];
    return h(Modal, {
      title: 'Configure ' + selectedSource.label + ' Import',
      onClose,
      wide: true,
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: () => setStep('source') }, 'Back'),
        h('button', {
          className: 'btn btn-primary',
          onClick: validateAndStart,
          disabled: validating,
        }, validating ? 'Validating...' : 'Start Import')
      ),
    },
      h('p', { style: { color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 } },
        'Importing into: ', h('strong', null, kbName || kbId)
      ),
      fields.map(field =>
        h('div', { key: field.name, className: 'form-group', style: { marginBottom: 14 } },
          field.type !== 'checkbox' && h('label', { className: 'form-label', style: { display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 } }, field.label, field.required && h('span', { style: { color: 'var(--danger)' } }, ' *')),
          field.type === 'select'
            ? h('select', {
                className: 'input',
                value: config[field.name] || '',
                onChange: e => setConfig(c => ({ ...c, [field.name]: e.target.value })),
                style: { width: '100%' },
              },
                h('option', { value: '' }, '-- Select --'),
                ...(field.options || []).map(o => h('option', { key: o.value, value: o.value }, o.label))
              )
            : field.type === 'textarea'
              ? h('textarea', {
                  className: 'input',
                  rows: 4,
                  value: config[field.name] || '',
                  onChange: e => setConfig(c => ({ ...c, [field.name]: e.target.value })),
                  placeholder: field.placeholder || '',
                  style: { width: '100%', fontFamily: 'monospace', fontSize: 12 },
                })
              : field.type === 'checkbox'
                ? h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' } },
                    h('input', {
                      type: 'checkbox',
                      checked: config[field.name] !== false,
                      onChange: e => setConfig(c => ({ ...c, [field.name]: e.target.checked })),
                    }),
                    field.label
                  )
                : h('input', {
                    className: 'input',
                    type: field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text',
                    value: config[field.name] || '',
                    onChange: e => setConfig(c => ({ ...c, [field.name]: e.target.value })),
                    placeholder: field.placeholder || '',
                    style: { width: '100%' },
                  }),
          field.helpText && h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, field.helpText)
        )
      )
    );
  }

  // ─── Step 3: Running ──────

  if (step === 'running') {
    const prog = job?.progress || {};
    const pct = prog.totalItems > 0 ? Math.round((prog.processedItems / prog.totalItems) * 100) : 0;
    return h(Modal, { title: 'Importing from ' + selectedSource.label, onClose: undefined },
      h('div', { style: { textAlign: 'center', padding: '20px 0' } },
        // Progress ring
        h('div', { style: { position: 'relative', width: 120, height: 120, margin: '0 auto 20px' } },
          h('svg', { viewBox: '0 0 120 120', width: 120, height: 120 },
            h('circle', { cx: 60, cy: 60, r: 52, fill: 'none', stroke: 'var(--border)', strokeWidth: 8 }),
            h('circle', { cx: 60, cy: 60, r: 52, fill: 'none', stroke: 'var(--accent, #6366f1)', strokeWidth: 8, strokeLinecap: 'round', strokeDasharray: 2 * Math.PI * 52, strokeDashoffset: 2 * Math.PI * 52 * (1 - pct / 100), transform: 'rotate(-90 60 60)', style: { transition: 'stroke-dashoffset 0.5s' } })
          ),
          h('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } },
            h('div', { style: { fontSize: 28, fontWeight: 700 } }, pct + '%'),
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' } }, prog.phase || 'starting')
          )
        ),

        // Stats
        h('div', { style: { display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 16, fontSize: 13 } },
          statPill('Discovered', prog.totalItems || 0),
          statPill('Imported', prog.importedItems || 0, 'var(--success, #22c55e)'),
          statPill('Skipped', prog.skippedItems || 0, 'var(--warning, #f59e0b)'),
          statPill('Failed', prog.failedItems || 0, 'var(--danger, #ef4444)'),
        ),

        // Current item
        prog.currentItem && h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, fontFamily: 'monospace', maxWidth: 400, margin: '0 auto 16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          prog.currentItem
        ),

        h('button', { className: 'btn btn-danger btn-sm', onClick: cancelJob }, 'Cancel Import')
      )
    );
  }

  // ─── Step 4: Done ──────

  if (step === 'done') {
    const prog = job?.progress || {};
    const success = job?.status === 'completed';
    return h(Modal, {
      title: success ? 'Import Complete' : job?.status === 'cancelled' ? 'Import Cancelled' : 'Import Failed',
      onClose,
      footer: h('button', { className: 'btn btn-primary', onClick: () => { onDone && onDone(); onClose(); } }, 'Done'),
    },
      h('div', { style: { textAlign: 'center', padding: '20px 0' } },
        h('div', { style: { fontSize: 48, marginBottom: 16 } },
          success ? h('svg', { viewBox: '0 0 24 24', width: 48, height: 48, fill: 'none', stroke: 'var(--success, #22c55e)', strokeWidth: 2 },
            h('path', { d: 'M22 11.08V12a10 10 0 11-5.93-9.14' }),
            h('polyline', { points: '22 4 12 14.01 9 11.01' })
          ) : h('svg', { viewBox: '0 0 24 24', width: 48, height: 48, fill: 'none', stroke: 'var(--danger, #ef4444)', strokeWidth: 2 },
            h('circle', { cx: 12, cy: 12, r: 10 }),
            h('line', { x1: 15, y1: 9, x2: 9, y2: 15 }),
            h('line', { x1: 9, y1: 9, x2: 15, y2: 15 })
          )
        ),

        success && h('p', { style: { fontSize: 15, marginBottom: 16 } },
          'Successfully imported ', h('strong', null, prog.importedItems || 0), ' entries into ', h('strong', null, kbName || 'the knowledge base'), '.'
        ),

        !success && job?.error && h('div', { style: { background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, fontSize: 13, color: 'var(--danger)', marginBottom: 16, textAlign: 'left' } }, job.error),

        h('div', { style: { display: 'flex', justifyContent: 'center', gap: 24, fontSize: 13 } },
          statPill('Total', prog.totalItems || 0),
          statPill('Imported', prog.importedItems || 0, 'var(--success, #22c55e)'),
          statPill('Skipped', prog.skippedItems || 0, 'var(--warning, #f59e0b)'),
          statPill('Failed', prog.failedItems || 0, 'var(--danger, #ef4444)'),
        ),
      )
    );
  }

  return null;
}

function statPill(label, value, color) {
  return h('div', { style: { textAlign: 'center' } },
    h('div', { style: { fontSize: 20, fontWeight: 700, color: color || 'var(--text)' } }, value),
    h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, label)
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

  if (loading) return h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } }, 'Loading import history...');
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
          h('th', null, 'Started'),
          h('th', null, 'Duration'),
        )),
        h('tbody', null, jobs.map(j =>
          h('tr', { key: j.id },
            h('td', { style: { fontSize: 13, fontWeight: 500 } }, j.sourceType),
            h('td', null, statusBadge(j.status)),
            h('td', { style: { fontSize: 13 } },
              (j.progress?.importedItems || 0) + ' / ' + (j.progress?.totalItems || 0)
            ),
            h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } },
              j.startedAt ? new Date(j.startedAt).toLocaleString() : '-'
            ),
            h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } },
              j.startedAt && j.completedAt ? formatDuration(new Date(j.completedAt) - new Date(j.startedAt)) : j.status === 'running' ? 'In progress...' : '-'
            ),
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

function formatDuration(ms) {
  if (ms < 1000) return '<1s';
  const s = Math.round(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  return m + 'm ' + (s % 60) + 's';
}
