import { h, useState, useEffect, useCallback, Fragment, useApp, engineCall, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';

var PAGE_SIZE = 25;

var CATEGORIES = [
  { value: 'deploy', label: 'Deploy Credentials' },
  { value: 'cloud_storage', label: 'Cloud Storage' },
  { value: 'api_key', label: 'API Key' },
  { value: 'skill_credential', label: 'Skill Credential' },
  { value: 'custom', label: 'Custom' }
];

// Platform presets for the Add Secret modal
var PLATFORM_PRESETS = [
  { id: '', label: 'Custom Secret', category: 'custom', fields: [{ key: 'value', label: 'Secret Value', placeholder: 'Enter secret value', type: 'password' }] },
  { id: 'openai', label: 'OpenAI', category: 'skill_credential', fields: [
    { key: 'access_token', label: 'API Key', placeholder: 'sk-...', type: 'password' },
  ]},
  { id: 'anthropic', label: 'Anthropic', category: 'skill_credential', fields: [
    { key: 'access_token', label: 'API Key', placeholder: 'sk-ant-...', type: 'password' },
  ]},
  { id: 'google', label: 'Google Cloud / Gemini', category: 'skill_credential', fields: [
    { key: 'access_token', label: 'API Key', placeholder: 'AIza...', type: 'password' },
    { key: 'client_id', label: 'OAuth Client ID (optional)', placeholder: '...apps.googleusercontent.com', type: 'text', optional: true },
    { key: 'client_secret', label: 'OAuth Client Secret (optional)', placeholder: '', type: 'password', optional: true },
  ]},
  { id: 'elevenlabs', label: 'ElevenLabs (TTS)', category: 'skill_credential', fields: [
    { key: 'access_token', label: 'API Key', placeholder: 'xi_...', type: 'password' },
  ]},
  { id: 'telegram', label: 'Telegram Bot', category: 'skill_credential', fields: [
    { key: 'access_token', label: 'Bot Token', placeholder: '123456:ABC-DEF...', type: 'password' },
  ]},
  { id: 'slack', label: 'Slack', category: 'skill_credential', fields: [
    { key: 'access_token', label: 'Bot Token', placeholder: 'xoxb-...', type: 'password' },
    { key: 'signing_secret', label: 'Signing Secret (optional)', placeholder: '', type: 'password', optional: true },
  ]},
  { id: 'github', label: 'GitHub', category: 'skill_credential', fields: [
    { key: 'access_token', label: 'Personal Access Token', placeholder: 'ghp_...', type: 'password' },
  ]},
  { id: 'stripe', label: 'Stripe', category: 'skill_credential', fields: [
    { key: 'access_token', label: 'Secret Key', placeholder: 'sk_live_... or sk_test_...', type: 'password' },
    { key: 'webhook_secret', label: 'Webhook Secret (optional)', placeholder: 'whsec_...', type: 'password', optional: true },
  ]},
  { id: 'sendgrid', label: 'SendGrid', category: 'skill_credential', fields: [
    { key: 'access_token', label: 'API Key', placeholder: 'SG...', type: 'password' },
  ]},
  { id: 'twilio', label: 'Twilio', category: 'skill_credential', fields: [
    { key: 'account_sid', label: 'Account SID', placeholder: 'AC...', type: 'text' },
    { key: 'access_token', label: 'Auth Token', placeholder: '', type: 'password' },
  ]},
  { id: 'aws', label: 'AWS', category: 'cloud_storage', fields: [
    { key: 'access_key_id', label: 'Access Key ID', placeholder: 'AKIA...', type: 'text' },
    { key: 'secret_access_key', label: 'Secret Access Key', placeholder: '', type: 'password' },
    { key: 'region', label: 'Region (optional)', placeholder: 'us-east-1', type: 'text', optional: true },
  ]},
  { id: 'cloudflare', label: 'Cloudflare', category: 'skill_credential', fields: [
    { key: 'access_token', label: 'API Token', placeholder: '', type: 'password' },
    { key: 'account_id', label: 'Account ID (optional)', placeholder: '', type: 'text', optional: true },
  ]},
  { id: 'notion', label: 'Notion', category: 'skill_credential', fields: [
    { key: 'access_token', label: 'Integration Token', placeholder: 'secret_...', type: 'password' },
  ]},
  { id: 'hubspot', label: 'HubSpot', category: 'skill_credential', fields: [
    { key: 'access_token', label: 'Private App Token', placeholder: 'pat-...', type: 'password' },
  ]},
  { id: 'smtp', label: 'SMTP / Email', category: 'deploy', fields: [
    { key: 'host', label: 'SMTP Host', placeholder: 'smtp.gmail.com', type: 'text' },
    { key: 'port', label: 'Port', placeholder: '587', type: 'text', optional: true },
    { key: 'username', label: 'Username', placeholder: 'you@gmail.com', type: 'text' },
    { key: 'password', label: 'App Password', placeholder: '', type: 'password' },
  ]},
  { id: 'database', label: 'Database', category: 'deploy', fields: [
    { key: 'connection_string', label: 'Connection String', placeholder: 'postgresql://user:pass@host:5432/db', type: 'password' },
  ]},
];

var catColor = function(cat) {
  if (cat === 'deploy') return '#6366f1';
  if (cat === 'cloud_storage') return '#0ea5e9';
  if (cat === 'api_key') return '#f59e0b';
  if (cat === 'skill_credential') return '#10b981';
  return '#6b7280';
};

var actionColor = function(action) {
  if (action === 'read' || action === 'decrypt') return '#0ea5e9';
  if (action === 'create' || action === 'encrypt') return '#10b981';
  if (action === 'delete') return '#ef4444';
  if (action === 'rotate') return '#f59e0b';
  if (action === 'migrate') return '#8b5cf6';
  return '#6b7280';
};

function pgBtnStyle(active) {
  return {
    padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'var(--bg-card)',
    color: active ? '#fff' : 'var(--text)',
    cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400,
    minWidth: 32, textAlign: 'center',
  };
}

function Pagination(props) {
  var page = props.page;
  var total = props.total;
  var onPage = props.onPage;
  var pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  var start = page * PAGE_SIZE + 1;
  var end = Math.min((page + 1) * PAGE_SIZE, total);

  var btns = [];
  var maxBtns = 7;
  var startPage = Math.max(0, page - Math.floor(maxBtns / 2));
  var endPage = Math.min(pages, startPage + maxBtns);
  if (endPage - startPage < maxBtns) startPage = Math.max(0, endPage - maxBtns);
  for (var i = startPage; i < endPage; i++) btns.push(i);

  return h('div', {
    style: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 13,
      color: 'var(--text-muted)', flexWrap: 'wrap', gap: 8,
    }
  },
    h('span', null, 'Showing ' + start + '-' + end + ' of ' + total.toLocaleString()),
    h('div', { style: { display: 'flex', gap: 4 } },
      h('button', { onClick: function() { onPage(0); }, disabled: page === 0, style: pgBtnStyle(false) }, '\u00AB'),
      h('button', { onClick: function() { onPage(page - 1); }, disabled: page === 0, style: pgBtnStyle(false) }, '\u2039'),
      btns.map(function(i) {
        return h('button', { key: i, onClick: function() { onPage(i); }, style: pgBtnStyle(i === page) }, String(i + 1));
      }),
      h('button', { onClick: function() { onPage(page + 1); }, disabled: page >= pages - 1, style: pgBtnStyle(false) }, '\u203A'),
      h('button', { onClick: function() { onPage(pages - 1); }, disabled: page >= pages - 1, style: pgBtnStyle(false) }, '\u00BB')
    )
  );
}

function SearchBar(props) {
  var _q = useState(props.value || '');
  var q = _q[0]; var setQ = _q[1];
  return h('input', {
    className: 'input',
    style: { width: props.width || 220 },
    type: 'search',
    placeholder: props.placeholder || 'Search...',
    value: q,
    onInput: function(e) { setQ(e.target.value); },
    onKeyDown: function(e) { if (e.key === 'Enter') props.onSearch(q); },
    onBlur: function() { props.onSearch(q); },
  });
}

export function VaultPage() {
  var app = useApp();
  var toast = app.toast;
  var _tab = useState('secrets');
  var tab = _tab[0]; var setTab = _tab[1];

  // ── Secrets state ──
  var _secrets = useState([]);
  var secrets = _secrets[0]; var setSecrets = _secrets[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _secretFilter = useState('');
  var secretFilter = _secretFilter[0]; var setSecretFilter = _secretFilter[1];
  var _secretSearch = useState('');
  var secretSearch = _secretSearch[0]; var setSecretSearch = _secretSearch[1];

  // Add modal
  var _showAdd = useState(false);
  var showAdd = _showAdd[0]; var setShowAdd = _showAdd[1];
  var _addPlatform = useState('');
  var addPlatform = _addPlatform[0]; var setAddPlatform = _addPlatform[1];
  var _addFields = useState({});
  var addFields = _addFields[0]; var setAddFields = _addFields[1];
  var _addSaving = useState(false);
  var addSaving = _addSaving[0]; var setAddSaving = _addSaving[1];

  // View secret modal
  var _viewSecret = useState(null);
  var viewSecret = _viewSecret[0]; var setViewSecret = _viewSecret[1];
  var _viewValue = useState('');
  var viewValue = _viewValue[0]; var setViewValue = _viewValue[1];
  var _viewLoading = useState(false);
  var viewLoading = _viewLoading[0]; var setViewLoading = _viewLoading[1];
  var _viewRevealed = useState(false);
  var viewRevealed = _viewRevealed[0]; var setViewRevealed = _viewRevealed[1];

  // ── Audit log state ──
  var _auditLog = useState([]);
  var auditLog = _auditLog[0]; var setAuditLog = _auditLog[1];
  var _auditTotal = useState(0);
  var auditTotal = _auditTotal[0]; var setAuditTotal = _auditTotal[1];
  var _auditPage = useState(0);
  var auditPage = _auditPage[0]; var setAuditPage = _auditPage[1];
  var _auditLoading = useState(false);
  var auditLoading = _auditLoading[0]; var setAuditLoading = _auditLoading[1];
  var _auditSearch = useState('');
  var auditSearch = _auditSearch[0]; var setAuditSearch = _auditSearch[1];
  var _auditActionFilter = useState('');
  var auditActionFilter = _auditActionFilter[0]; var setAuditActionFilter = _auditActionFilter[1];
  var _auditDetail = useState(null);
  var auditDetail = _auditDetail[0]; var setAuditDetail = _auditDetail[1];

  // ── Status state ──
  var _status = useState(null);
  var status = _status[0]; var setStatus = _status[1];

  // ── Load functions ──
  var loadSecrets = useCallback(function() {
    setLoading(true);
    engineCall('/vault/secrets?orgId=' + getOrgId())
      .then(function(d) { setSecrets(d.secrets || d.entries || []); })
      .catch(function(e) { toast(e.message || 'Failed to load secrets', 'error'); })
      .finally(function() { setLoading(false); });
  }, [toast]);

  var loadAudit = useCallback(function() {
    setAuditLoading(true);
    var params = 'orgId=' + getOrgId() + '&limit=' + PAGE_SIZE + '&offset=' + (auditPage * PAGE_SIZE);
    if (auditSearch) params += '&search=' + encodeURIComponent(auditSearch);
    if (auditActionFilter) params += '&action=' + encodeURIComponent(auditActionFilter);
    engineCall('/vault/audit-log?' + params)
      .then(function(d) {
        setAuditLog(d.entries || d.log || []);
        setAuditTotal(d.total || 0);
      })
      .catch(function(e) { toast(e.message || 'Failed to load audit log', 'error'); })
      .finally(function() { setAuditLoading(false); });
  }, [toast, auditPage, auditSearch, auditActionFilter]);

  var loadStatus = useCallback(function() {
    engineCall('/vault/status').then(function(d) { setStatus(d); }).catch(function() {});
  }, []);

  useEffect(function() { loadSecrets(); loadStatus(); }, [loadSecrets, loadStatus]);
  useEffect(function() { if (tab === 'audit') loadAudit(); }, [tab, loadAudit]);

  // ── Secret actions ──
  var addSecret = async function() {
    var preset = PLATFORM_PRESETS.find(function(p) { return p.id === addPlatform; }) || PLATFORM_PRESETS[0];
    var requiredFields = preset.fields.filter(function(f) { return !f.optional; });
    var missing = requiredFields.filter(function(f) { return !addFields[f.key]; });
    if (missing.length > 0) {
      toast(missing[0].label + ' is required', 'error');
      return;
    }
    setAddSaving(true);
    try {
      var saved = 0;
      if (addPlatform === '') {
        // Custom: single secret with user-provided name
        if (!addFields.customName) { toast('Secret name is required', 'error'); setAddSaving(false); return; }
        await engineCall('/vault/secrets', {
          method: 'POST',
          body: JSON.stringify({ orgId: getOrgId(), name: addFields.customName, value: addFields.value, category: 'custom' })
        });
        saved = 1;
      } else {
        // Platform: save each field as skill:<platform>:<key>
        for (var f of preset.fields) {
          if (!addFields[f.key]) continue;
          await engineCall('/vault/secrets', {
            method: 'POST',
            body: JSON.stringify({
              orgId: getOrgId(),
              name: 'skill:' + addPlatform + ':' + f.key,
              value: addFields[f.key],
              category: preset.category
            })
          });
          saved++;
        }
      }
      toast(saved + ' secret' + (saved !== 1 ? 's' : '') + ' stored securely', 'success');
      setShowAdd(false); setAddPlatform(''); setAddFields({});
      loadSecrets(); loadStatus();
    } catch (e) { toast(e.message || 'Failed to store secret', 'error'); }
    setAddSaving(false);
  };

  var openViewSecret = async function(secret) {
    setViewSecret(secret); setViewValue(''); setViewRevealed(false); setViewLoading(true);
    try {
      var d = await engineCall('/vault/secrets/' + secret.id);
      setViewValue(d.value || d.decrypted || '');
    } catch (e) { toast(e.message || 'Failed to decrypt', 'error'); setViewValue('(decryption failed)'); }
    setViewLoading(false);
  };

  var deleteSecret = async function(secret) {
    var ok = await window.__showConfirm({
      title: 'Delete Secret', danger: true, confirmText: 'Delete',
      message: 'Permanently delete "' + secret.name + '"? This cannot be undone.',
      warning: 'Any services using this secret will immediately lose access.'
    });
    if (!ok) return;
    try {
      await engineCall('/vault/secrets/' + secret.id, { method: 'DELETE' });
      toast('Secret deleted', 'success'); loadSecrets(); loadStatus();
    } catch (e) { toast(e.message || 'Delete failed', 'error'); }
  };

  var rotateSecret = async function(secret) {
    var ok = await window.__showConfirm({
      title: 'Rotate Secret', confirmText: 'Rotate',
      message: 'Re-encrypt "' + secret.name + '" with a new key?'
    });
    if (!ok) return;
    try {
      await engineCall('/vault/secrets/' + secret.id + '/rotate', { method: 'POST' });
      toast('Secret rotated', 'success'); loadSecrets();
    } catch (e) { toast(e.message || 'Rotation failed', 'error'); }
  };

  var rotateAll = async function() {
    var ok = await window.__showConfirm({
      title: 'Rotate All Secrets', confirmText: 'Rotate All',
      message: 'Re-encrypt all secrets with fresh encryption keys?'
    });
    if (!ok) return;
    try {
      var d = await engineCall('/vault/rotate-all', { method: 'POST', body: JSON.stringify({ orgId: getOrgId() }) });
      toast('Rotated ' + (d.rotated || 0) + ' secrets', 'success'); loadSecrets();
    } catch (e) { toast(e.message || 'Bulk rotation failed', 'error'); }
  };

  var copyValue = function() {
    navigator.clipboard.writeText(viewValue).then(function() { toast('Copied to clipboard', 'success'); });
  };

  // ── Filter secrets (client-side since list is small) ──
  var filtered = secrets;
  if (secretFilter) filtered = filtered.filter(function(s) { return s.category === secretFilter; });
  if (secretSearch) {
    var q = secretSearch.toLowerCase();
    filtered = filtered.filter(function(s) {
      return (s.name || '').toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q) || (s.createdBy || '').toLowerCase().includes(q);
    });
  }

  // ═══ Secrets Tab ═══
  var renderSecrets = function() {
    return h(Fragment, null,
      // Toolbar
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 } },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          h(SearchBar, { placeholder: 'Search secrets...', value: secretSearch, onSearch: setSecretSearch }),
          h('select', {
            className: 'input', style: { width: 180 }, value: secretFilter,
            onChange: function(e) { setSecretFilter(e.target.value); }
          },
            h('option', { value: '' }, 'All Categories'),
            CATEGORIES.map(function(c) { return h('option', { key: c.value, value: c.value }, c.label); })
          ),
          h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, filtered.length + ' secret' + (filtered.length !== 1 ? 's' : ''))
        ),
        h('div', { style: { display: 'flex', gap: 8 } },
          secrets.length > 0 && h('button', { className: 'btn btn-secondary', onClick: rotateAll }, I.refresh(), ' Rotate All'),
          h('button', { className: 'btn btn-primary', onClick: function() { setShowAdd(true); } }, I.plus(), ' Add Secret')
        )
      ),

      loading && h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, 'Loading secrets...'),

      !loading && filtered.length === 0 && h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } },
        h('div', { style: { marginBottom: 12 } }, I.lock()),
        h('p', { style: { fontSize: 15, fontWeight: 500, marginBottom: 8 } }, secretSearch || secretFilter ? 'No matching secrets' : 'No secrets stored yet'),
        h('p', { style: { fontSize: 13 } }, 'Secrets are encrypted at rest with AES-256-GCM.')
      ),

      !loading && filtered.length > 0 && h('div', { className: 'card' },
        h('table', { className: 'data-table' },
          h('thead', null,
            h('tr', null,
              h('th', null, 'Name'),
              h('th', null, 'Category'),
              h('th', null, 'Created By'),
              h('th', null, 'Created'),
              h('th', null, 'Last Rotated'),
              h('th', { style: { textAlign: 'right' } }, 'Actions')
            )
          ),
          h('tbody', null,
            filtered.map(function(s) {
              return h('tr', {
                key: s.id,
                style: { cursor: 'pointer' },
                onClick: function() { openViewSecret(s); }
              },
                h('td', null, h('span', { style: { color: 'var(--text-primary)', fontWeight: 500 } }, s.name)),
                h('td', null,
                  h('span', {
                    style: { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: '#fff', background: catColor(s.category) }
                  }, (s.category || 'custom').replace(/_/g, ' '))
                ),
                h('td', { style: { color: 'var(--text-muted)', fontSize: 13 } }, s.createdBy || '-'),
                h('td', { style: { color: 'var(--text-muted)', fontSize: 13 } }, s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '-'),
                h('td', { style: { color: 'var(--text-muted)', fontSize: 13 } }, s.rotatedAt ? new Date(s.rotatedAt).toLocaleDateString() : 'Never'),
                h('td', { style: { textAlign: 'right' } },
                  h('div', { style: { display: 'flex', gap: 4, justifyContent: 'flex-end' } },
                    h('button', { className: 'btn btn-ghost btn-sm', onClick: function(e) { e.stopPropagation(); openViewSecret(s); }, title: 'View' }, I.eye()),
                    h('button', { className: 'btn btn-ghost btn-sm', onClick: function(e) { e.stopPropagation(); rotateSecret(s); }, title: 'Rotate' }, I.refresh()),
                    h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--danger)' }, onClick: function(e) { e.stopPropagation(); deleteSecret(s); }, title: 'Delete' }, I.trash())
                  )
                )
              );
            })
          )
        )
      )
    );
  };

  // ═══ Audit Log Tab ═══
  var renderAudit = function() {
    return h(Fragment, null,
      // Toolbar
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 } },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          h(SearchBar, {
            placeholder: 'Search audit log...',
            value: auditSearch,
            onSearch: function(q) { setAuditSearch(q); setAuditPage(0); }
          }),
          h('select', {
            className: 'input', style: { width: 160 }, value: auditActionFilter,
            onChange: function(e) { setAuditActionFilter(e.target.value); setAuditPage(0); }
          },
            h('option', { value: '' }, 'All Actions'),
            ['encrypt', 'decrypt', 'delete', 'rotate', 'migrate', 'read', 'create'].map(function(a) {
              return h('option', { key: a, value: a }, a.charAt(0).toUpperCase() + a.slice(1));
            })
          ),
          h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, auditTotal.toLocaleString() + ' entries')
        ),
        h('button', { className: 'btn btn-secondary', onClick: loadAudit }, I.refresh(), ' Refresh')
      ),

      // Table
      h('div', { className: 'card', style: { position: 'relative' } },
        auditLoading && h('div', {
          style: {
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: 12
          }
        }, h('div', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Loading...')),

        auditLog.length === 0 && !auditLoading
          ? h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } },
              h('p', { style: { fontSize: 15, fontWeight: 500, marginBottom: 8 } }, 'No audit entries'),
              h('p', { style: { fontSize: 13 } }, 'Every vault access is logged here for compliance and security review.')
            )
          : h(Fragment, null,
              h('table', { className: 'data-table' },
                h('thead', null,
                  h('tr', null,
                    h('th', null, 'Action'),
                    h('th', null, 'Secret'),
                    h('th', null, 'Actor'),
                    h('th', null, 'Timestamp'),
                    h('th', null, 'Details')
                  )
                ),
                h('tbody', null,
                  auditLog.map(function(entry, i) {
                    return h('tr', {
                      key: entry.id || i,
                      style: { cursor: 'pointer' },
                      onClick: function() { setAuditDetail(entry); }
                    },
                      h('td', null,
                        h('span', {
                          style: { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: '#fff', background: actionColor(entry.action) }
                        }, entry.action || '-')
                      ),
                      h('td', { style: { fontWeight: 500 } }, entry.entryName || entry.entryId || '-'),
                      h('td', { style: { color: 'var(--text-muted)', fontSize: 13 } }, entry.actor || '-'),
                      h('td', { style: { color: 'var(--text-muted)', fontSize: 13 } },
                        entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '-'
                      ),
                      h('td', { style: { color: 'var(--text-muted)', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                        entry.metadata ? (typeof entry.metadata === 'object' ? JSON.stringify(entry.metadata) : String(entry.metadata)) : '-'
                      )
                    );
                  })
                )
              ),
              h(Pagination, { page: auditPage, total: auditTotal, onPage: setAuditPage })
            )
      )
    );
  };

  // ═══ Status Tab ═══
  var renderStatus = function() {
    if (!status) return h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, 'Loading status...');
    var byCategory = status.entriesByCategory || {};
    return h(Fragment, null,
      h('div', { className: 'stat-grid', style: { marginBottom: 20 } },
        h('div', { className: 'stat-card' },
          h('div', { className: 'stat-label' }, 'Vault Status'),
          h('div', { className: 'stat-value', style: { color: status.configured ? 'var(--success)' : 'var(--danger)' } }, status.configured ? 'Active' : 'Not Configured')
        ),
        h('div', { className: 'stat-card' },
          h('div', { className: 'stat-label' }, 'Total Secrets'),
          h('div', { className: 'stat-value' }, status.totalEntries || 0)
        ),
        h('div', { className: 'stat-card' },
          h('div', { className: 'stat-label' }, 'Encryption'),
          h('div', { className: 'stat-value', style: { fontSize: 16 } }, 'AES-256-GCM')
        ),
        h('div', { className: 'stat-card' },
          h('div', { className: 'stat-label' }, 'Key Derivation'),
          h('div', { className: 'stat-value', style: { fontSize: 16 } }, 'PBKDF2')
        )
      ),

      h('div', { className: 'card' },
        h('div', { className: 'card-header' },
          h('h3', { style: { fontSize: 14, fontWeight: 600 } }, 'Secrets by Category')
        ),
        h('div', { className: 'card-body' },
          Object.keys(byCategory).length === 0
            ? h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)' } }, 'No secrets stored yet.')
            : h('div', { style: { display: 'grid', gap: 10 } },
                Object.entries(byCategory).map(function(pair) {
                  var cat = pair[0]; var count = pair[1];
                  var label = CATEGORIES.find(function(c) { return c.value === cat; });
                  return h('div', {
                    key: cat,
                    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 8 }
                  },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                      h('span', { style: { display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: catColor(cat) } }),
                      h('span', { style: { fontWeight: 500 } }, label ? label.label : cat.replace(/_/g, ' '))
                    ),
                    h('span', { style: { fontWeight: 700, fontSize: 18 } }, count)
                  );
                })
              )
        )
      ),

      h('div', { style: { marginTop: 16, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 } },
        h('strong', null, 'How vault encryption works:'),
        h('ul', { style: { paddingLeft: 20, margin: '8px 0 0' } },
          h('li', null, 'Each secret is encrypted with a unique random salt and initialization vector.'),
          h('li', null, 'AES-256-GCM provides authenticated encryption (tamper detection).'),
          h('li', null, 'The encryption key is derived from a master key using PBKDF2 with 100,000 iterations.'),
          h('li', null, 'Rotating a secret re-encrypts it with a fresh salt and IV without changing its value.'),
          h('li', null, 'Every vault access (read, create, delete, rotate) is logged in the audit trail.')
        )
      )
    );
  };

  // ═══ Main Layout ═══
  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Vault'),
        h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Encrypted secrets management with AES-256-GCM')
      ),
      h('button', { className: 'btn btn-secondary', onClick: function() { loadSecrets(); loadStatus(); if (tab === 'audit') loadAudit(); } }, I.refresh(), ' Refresh')
    ),

    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      [
        { id: 'secrets', label: 'Secrets' },
        { id: 'audit', label: 'Audit Log' },
        { id: 'status', label: 'Status' }
      ].map(function(t) {
        return h('button', {
          key: t.id, className: 'tab' + (tab === t.id ? ' active' : ''),
          onClick: function() { setTab(t.id); }
        }, t.label);
      })
    ),

    tab === 'secrets' && renderSecrets(),
    tab === 'audit' && renderAudit(),
    tab === 'status' && renderStatus(),

    // ── Add Secret Modal ──
    showAdd && function() {
      var preset = PLATFORM_PRESETS.find(function(p) { return p.id === addPlatform; }) || PLATFORM_PRESETS[0];
      return h(Modal, {
        title: 'Add Secret',
        onClose: function() { setShowAdd(false); setAddPlatform(''); setAddFields({}); },
        footer: h(Fragment, null,
          h('button', { className: 'btn btn-secondary', onClick: function() { setShowAdd(false); setAddPlatform(''); setAddFields({}); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary', onClick: addSecret, disabled: addSaving }, addSaving ? 'Saving...' : 'Store Secret')
        )
      },
        h('div', null,
          // Platform picker
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Platform / Service'),
            h('select', {
              className: 'input', style: { width: '100%' },
              value: addPlatform,
              onChange: function(e) { setAddPlatform(e.target.value); setAddFields({}); }
            },
              PLATFORM_PRESETS.map(function(p) {
                return h('option', { key: p.id, value: p.id }, p.label);
              })
            )
          ),

          // Custom name field (only for custom secrets)
          addPlatform === '' && h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Secret Name', h('span', { style: { color: 'var(--danger)', marginLeft: 4 } }, '*')),
            h('input', {
              className: 'input', style: { width: '100%' },
              placeholder: 'e.g., MY_API_KEY',
              value: addFields.customName || '',
              onChange: function(e) { var v = e.target.value; setAddFields(function(f) { return Object.assign({}, f, { customName: v }); }); }
            })
          ),

          // Platform info banner
          addPlatform !== '' && h('div', {
            style: {
              padding: '10px 14px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12
            }
          },
            'Credentials will be stored as ',
            h('code', { style: { fontSize: 11, background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: 3 } },
              'skill:' + addPlatform + ':<key>'
            ),
            ' and auto-detected by agent tools.'
          ),

          // Dynamic fields
          preset.fields.map(function(field) {
            return h('div', { key: field.key, className: 'form-group' },
              h('label', { className: 'form-label' },
                field.label,
                !field.optional && h('span', { style: { color: 'var(--danger)', marginLeft: 4 } }, '*')
              ),
              h('input', {
                className: 'input', style: { width: '100%' },
                type: field.type || 'text',
                placeholder: field.placeholder || '',
                value: addFields[field.key] || '',
                onChange: function(e) {
                  var k = field.key; var v = e.target.value;
                  setAddFields(function(f) { var n = Object.assign({}, f); n[k] = v; return n; });
                }
              })
            );
          }),

          h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 } }, 'All values are encrypted with AES-256-GCM before storage.')
        )
      );
    }(),

    // ── View Secret Modal ──
    viewSecret && h(Modal, {
      title: 'Secret: ' + viewSecret.name,
      onClose: function() { setViewSecret(null); setViewValue(''); setViewRevealed(false); }
    },
      h('div', null,
        h('div', { style: { marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 } },
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'Category'),
            h('span', { style: { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: '#fff', background: catColor(viewSecret.category) } },
              (viewSecret.category || 'custom').replace(/_/g, ' ')
            )
          ),
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'Created By'),
            h('div', { style: { fontSize: 13, fontWeight: 500 } }, viewSecret.createdBy || '-')
          ),
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'Created'),
            h('div', { style: { fontSize: 13 } }, viewSecret.createdAt ? new Date(viewSecret.createdAt).toLocaleString() : '-')
          ),
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'Last Rotated'),
            h('div', { style: { fontSize: 13 } }, viewSecret.rotatedAt ? new Date(viewSecret.rotatedAt).toLocaleString() : 'Never')
          )
        ),
        viewLoading
          ? h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)' } }, 'Decrypting...')
          : h('div', null,
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
                h('label', { className: 'form-label', style: { marginBottom: 0 } }, 'Decrypted Value'),
                h('button', {
                  className: 'btn btn-ghost btn-sm',
                  onClick: function() { setViewRevealed(!viewRevealed); },
                  style: { padding: '2px 6px' }
                }, viewRevealed ? I.eyeOff() : I.eye())
              ),
              h('div', {
                style: {
                  padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 8,
                  fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all',
                  userSelect: viewRevealed ? 'text' : 'none'
                }
              }, viewRevealed ? viewValue : '\u2022'.repeat(Math.min(viewValue.length || 20, 40))),
              h('div', { style: { marginTop: 8, display: 'flex', gap: 8 } },
                h('button', { className: 'btn btn-secondary btn-sm', onClick: copyValue }, I.copy(), ' Copy'),
                h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { rotateSecret(viewSecret); setViewSecret(null); } }, I.refresh(), ' Rotate')
              ),
              h('div', {
                style: { marginTop: 12, padding: 10, background: 'rgba(245, 158, 11, 0.1)', borderRadius: 6, fontSize: 12, color: 'var(--warning)' }
              }, 'This access has been logged in the vault audit trail.')
            )
      )
    ),

    // ── Audit Detail Modal ──
    auditDetail && h(Modal, {
      title: 'Audit Entry Detail',
      onClose: function() { setAuditDetail(null); }
    },
      h('div', null,
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 } },
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'Action'),
            h('span', {
              style: { display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: '#fff', background: actionColor(auditDetail.action) }
            }, auditDetail.action)
          ),
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'Actor'),
            h('div', { style: { fontSize: 14, fontWeight: 500 } }, auditDetail.actor || '-')
          ),
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'Secret'),
            h('div', { style: { fontSize: 14, fontWeight: 500 } }, auditDetail.entryName || auditDetail.vaultEntryId || '-')
          ),
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'Timestamp'),
            h('div', { style: { fontSize: 13 } }, auditDetail.createdAt ? new Date(auditDetail.createdAt).toLocaleString() : '-')
          ),
          auditDetail.ip && h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'IP Address'),
            h('div', { style: { fontSize: 13, fontFamily: 'monospace' } }, auditDetail.ip)
          ),
          h('div', null,
            h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'Entry ID'),
            h('div', { style: { fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)' } }, auditDetail.id || '-')
          )
        ),
        auditDetail.metadata && Object.keys(auditDetail.metadata).length > 0 && h(Fragment, null,
          h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 } }, 'Metadata'),
          h('div', {
            style: {
              padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 8,
              fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all'
            }
          }, JSON.stringify(auditDetail.metadata, null, 2))
        )
      )
    )
  );
}
