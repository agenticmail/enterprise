import { h, useState, useEffect, useCallback, Fragment, useApp, engineCall } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';

var CATEGORIES = [
  { value: 'deploy', label: 'Deploy Credentials' },
  { value: 'cloud_storage', label: 'Cloud Storage' },
  { value: 'api_key', label: 'API Key' },
  { value: 'skill_credential', label: 'Skill Credential' },
  { value: 'custom', label: 'Custom' }
];

var catColor = function(cat) {
  if (cat === 'deploy') return '#6366f1';
  if (cat === 'cloud_storage') return '#0ea5e9';
  if (cat === 'api_key') return '#f59e0b';
  if (cat === 'skill_credential') return '#10b981';
  return '#6b7280';
};

export function VaultPage() {
  var app = useApp();
  var toast = app.toast;
  var _tab = useState('secrets');
  var tab = _tab[0]; var setTab = _tab[1];

  // Secrets state
  var _secrets = useState([]);
  var secrets = _secrets[0]; var setSecrets = _secrets[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _filter = useState('');
  var filter = _filter[0]; var setFilter = _filter[1];

  // Add modal
  var _showAdd = useState(false);
  var showAdd = _showAdd[0]; var setShowAdd = _showAdd[1];
  var _addForm = useState({ name: '', value: '', category: 'custom' });
  var addForm = _addForm[0]; var setAddForm = _addForm[1];
  var _addSaving = useState(false);
  var addSaving = _addSaving[0]; var setAddSaving = _addSaving[1];

  // View modal
  var _viewSecret = useState(null);
  var viewSecret = _viewSecret[0]; var setViewSecret = _viewSecret[1];
  var _viewValue = useState('');
  var viewValue = _viewValue[0]; var setViewValue = _viewValue[1];
  var _viewLoading = useState(false);
  var viewLoading = _viewLoading[0]; var setViewLoading = _viewLoading[1];
  var _viewRevealed = useState(false);
  var viewRevealed = _viewRevealed[0]; var setViewRevealed = _viewRevealed[1];

  // Audit log
  var _auditLog = useState([]);
  var auditLog = _auditLog[0]; var setAuditLog = _auditLog[1];
  var _auditLoading = useState(false);
  var auditLoading = _auditLoading[0]; var setAuditLoading = _auditLoading[1];

  // Status
  var _status = useState(null);
  var status = _status[0]; var setStatus = _status[1];

  // Load secrets
  var loadSecrets = useCallback(function() {
    setLoading(true);
    engineCall('/vault/secrets?orgId=default')
      .then(function(d) { setSecrets(d.secrets || d.entries || []); })
      .catch(function(e) { toast(e.message || 'Failed to load secrets', 'error'); })
      .finally(function() { setLoading(false); });
  }, [toast]);

  var loadAudit = useCallback(function() {
    setAuditLoading(true);
    engineCall('/vault/audit-log?orgId=default&limit=100')
      .then(function(d) { setAuditLog(d.entries || d.log || []); })
      .catch(function(e) { toast(e.message || 'Failed to load audit log', 'error'); })
      .finally(function() { setAuditLoading(false); });
  }, [toast]);

  var loadStatus = useCallback(function() {
    engineCall('/vault/status')
      .then(function(d) { setStatus(d); })
      .catch(function() {});
  }, []);

  useEffect(function() { loadSecrets(); loadStatus(); }, [loadSecrets, loadStatus]);
  useEffect(function() { if (tab === 'audit') loadAudit(); }, [tab, loadAudit]);

  // Add secret
  var addSecret = async function() {
    if (!addForm.name || !addForm.value) { toast('Name and value are required', 'error'); return; }
    setAddSaving(true);
    try {
      await engineCall('/vault/secrets', {
        method: 'POST',
        body: JSON.stringify({
          orgId: 'default',
          name: addForm.name,
          value: addForm.value,
          category: addForm.category
        })
      });
      toast('Secret stored securely', 'success');
      setShowAdd(false);
      setAddForm({ name: '', value: '', category: 'custom' });
      loadSecrets();
      loadStatus();
    } catch (e) { toast(e.message || 'Failed to store secret', 'error'); }
    setAddSaving(false);
  };

  // View secret (decrypt)
  var openViewSecret = async function(secret) {
    setViewSecret(secret);
    setViewValue('');
    setViewRevealed(false);
    setViewLoading(true);
    try {
      var d = await engineCall('/vault/secrets/' + secret.id);
      setViewValue(d.value || d.decrypted || '');
    } catch (e) {
      toast(e.message || 'Failed to decrypt secret', 'error');
      setViewValue('(decryption failed)');
    }
    setViewLoading(false);
  };

  // Delete secret
  var deleteSecret = async function(secret) {
    var ok = await window.__showConfirm({
      title: 'Delete Secret',
      message: 'Are you sure you want to permanently delete "' + secret.name + '"? This cannot be undone.',
      danger: true,
      confirmText: 'Delete',
      warning: 'Any services using this secret will immediately lose access.'
    });
    if (!ok) return;
    try {
      await engineCall('/vault/secrets/' + secret.id, { method: 'DELETE' });
      toast('Secret deleted', 'success');
      loadSecrets();
      loadStatus();
    } catch (e) { toast(e.message || 'Delete failed', 'error'); }
  };

  // Rotate secret
  var rotateSecret = async function(secret) {
    var ok = await window.__showConfirm({
      title: 'Rotate Secret',
      message: 'Re-encrypt "' + secret.name + '" with a new key? The value stays the same but the encryption is refreshed.',
      confirmText: 'Rotate'
    });
    if (!ok) return;
    try {
      await engineCall('/vault/secrets/' + secret.id + '/rotate', { method: 'POST' });
      toast('Secret rotated', 'success');
      loadSecrets();
    } catch (e) { toast(e.message || 'Rotation failed', 'error'); }
  };

  // Rotate all
  var rotateAll = async function() {
    var ok = await window.__showConfirm({
      title: 'Rotate All Secrets',
      message: 'Re-encrypt all secrets with fresh encryption keys? This is a security best practice but may take a moment.',
      confirmText: 'Rotate All'
    });
    if (!ok) return;
    try {
      var d = await engineCall('/vault/rotate-all', {
        method: 'POST',
        body: JSON.stringify({ orgId: 'default' })
      });
      toast('Rotated ' + (d.rotated || 0) + ' secrets', 'success');
      loadSecrets();
    } catch (e) { toast(e.message || 'Bulk rotation failed', 'error'); }
  };

  // Copy to clipboard
  var copyValue = function() {
    navigator.clipboard.writeText(viewValue).then(function() { toast('Copied to clipboard', 'success'); });
  };

  // Filter secrets
  var filtered = secrets;
  if (filter) {
    filtered = secrets.filter(function(s) {
      return s.category === filter;
    });
  }

  // ── Secrets Tab ──
  var renderSecrets = function() {
    return h(Fragment, null,
      // Toolbar
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 } },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          h('select', {
            className: 'input',
            style: { width: 180 },
            value: filter,
            onChange: function(e) { setFilter(e.target.value); }
          },
            h('option', { value: '' }, 'All Categories'),
            CATEGORIES.map(function(c) {
              return h('option', { key: c.value, value: c.value }, c.label);
            })
          ),
          h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, filtered.length + ' secret' + (filtered.length !== 1 ? 's' : ''))
        ),
        h('div', { style: { display: 'flex', gap: 8 } },
          secrets.length > 0 && h('button', { className: 'btn btn-secondary', onClick: rotateAll }, I.refresh(), ' Rotate All'),
          h('button', { className: 'btn btn-primary', onClick: function() { setShowAdd(true); } }, I.plus(), ' Add Secret')
        )
      ),

      // Loading
      loading && h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, 'Loading secrets...'),

      // Empty state
      !loading && filtered.length === 0 && h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } },
        h('div', { style: { marginBottom: 12 } }, I.lock()),
        h('p', { style: { fontSize: 15, fontWeight: 500, marginBottom: 8 } }, filter ? 'No secrets in this category' : 'No secrets stored yet'),
        h('p', { style: { fontSize: 13 } }, 'Secrets are encrypted at rest with AES-256-GCM.')
      ),

      // Table
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
              return h('tr', { key: s.id },
                h('td', null,
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                    h('span', { style: { color: 'var(--text-primary)', fontWeight: 500 } }, s.name)
                  )
                ),
                h('td', null,
                  h('span', {
                    style: {
                      display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                      fontSize: 11, fontWeight: 600, color: '#fff',
                      background: catColor(s.category)
                    }
                  }, (s.category || 'custom').replace(/_/g, ' '))
                ),
                h('td', { style: { color: 'var(--text-muted)', fontSize: 13 } }, s.createdBy || '-'),
                h('td', { style: { color: 'var(--text-muted)', fontSize: 13 } },
                  s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '-'
                ),
                h('td', { style: { color: 'var(--text-muted)', fontSize: 13 } },
                  s.rotatedAt ? new Date(s.rotatedAt).toLocaleDateString() : 'Never'
                ),
                h('td', { style: { textAlign: 'right' } },
                  h('div', { style: { display: 'flex', gap: 4, justifyContent: 'flex-end' } },
                    h('button', {
                      className: 'btn btn-ghost btn-sm',
                      onClick: function() { openViewSecret(s); },
                      title: 'View secret'
                    }, I.eye()),
                    h('button', {
                      className: 'btn btn-ghost btn-sm',
                      onClick: function() { rotateSecret(s); },
                      title: 'Rotate encryption'
                    }, I.refresh()),
                    h('button', {
                      className: 'btn btn-ghost btn-sm',
                      style: { color: 'var(--danger)' },
                      onClick: function() { deleteSecret(s); },
                      title: 'Delete secret'
                    }, I.trash())
                  )
                )
              );
            })
          )
        )
      )
    );
  };

  // ── Audit Log Tab ──
  var renderAudit = function() {
    if (auditLoading) return h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, 'Loading audit log...');
    if (auditLog.length === 0) return h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } },
      h('p', { style: { fontSize: 15, fontWeight: 500, marginBottom: 8 } }, 'No audit entries yet'),
      h('p', { style: { fontSize: 13 } }, 'Every vault access is logged here for compliance and security review.')
    );

    return h('div', { className: 'card' },
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
            var actionColor = entry.action === 'read' ? 'var(--info)' :
              entry.action === 'create' ? 'var(--success)' :
              entry.action === 'delete' ? 'var(--danger)' :
              entry.action === 'rotate' ? 'var(--warning)' : 'var(--text-muted)';
            return h('tr', { key: entry.id || i },
              h('td', null,
                h('span', {
                  style: {
                    display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                    fontSize: 11, fontWeight: 600, color: '#fff', background: actionColor
                  }
                }, entry.action || '-')
              ),
              h('td', { style: { fontWeight: 500 } }, entry.entryName || entry.entryId || '-'),
              h('td', { style: { color: 'var(--text-muted)', fontSize: 13 } }, entry.actor || '-'),
              h('td', { style: { color: 'var(--text-muted)', fontSize: 13 } },
                entry.createdAt || entry.timestamp ? new Date(entry.createdAt || entry.timestamp).toLocaleString() : '-'
              ),
              h('td', { style: { color: 'var(--text-muted)', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                entry.metadata ? JSON.stringify(entry.metadata) : '-'
              )
            );
          })
        )
      )
    );
  };

  // ── Status Tab ──
  var renderStatus = function() {
    if (!status) return h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-muted)' } }, 'Loading status...');

    var byCategory = status.entriesByCategory || {};
    return h(Fragment, null,
      // Health card
      h('div', { className: 'stat-grid', style: { marginBottom: 20 } },
        h('div', { className: 'stat-card' },
          h('div', { className: 'stat-label' }, 'Vault Status'),
          h('div', { className: 'stat-value', style: { color: status.configured ? 'var(--success)' : 'var(--danger)' } },
            status.configured ? 'Active' : 'Not Configured'
          )
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

      // By category
      h('div', { className: 'card' },
        h('div', { className: 'card-header' },
          h('h3', { style: { fontSize: 14, fontWeight: 600 } }, 'Secrets by Category')
        ),
        h('div', { className: 'card-body' },
          Object.keys(byCategory).length === 0
            ? h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)' } }, 'No secrets stored yet.')
            : h('div', { style: { display: 'grid', gap: 10 } },
                Object.entries(byCategory).map(function(entry) {
                  var cat = entry[0]; var count = entry[1];
                  var label = CATEGORIES.find(function(c) { return c.value === cat; });
                  return h('div', {
                    key: cat,
                    style: {
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 8
                    }
                  },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                      h('span', {
                        style: {
                          display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                          background: catColor(cat)
                        }
                      }),
                      h('span', { style: { fontWeight: 500 } }, label ? label.label : cat.replace(/_/g, ' '))
                    ),
                    h('span', { style: { fontWeight: 700, fontSize: 18 } }, count)
                  );
                })
              )
        )
      ),

      // Info
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

  return h(Fragment, null,
    // Page Header
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Vault'),
        h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Encrypted secrets management with AES-256-GCM')
      ),
      h('button', { className: 'btn btn-secondary', onClick: function() { loadSecrets(); loadStatus(); if (tab === 'audit') loadAudit(); } }, I.refresh(), ' Refresh')
    ),

    // Tabs
    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      [
        { id: 'secrets', label: 'Secrets' },
        { id: 'audit', label: 'Audit Log' },
        { id: 'status', label: 'Status' }
      ].map(function(t) {
        return h('button', {
          key: t.id,
          className: 'tab' + (tab === t.id ? ' active' : ''),
          onClick: function() { setTab(t.id); }
        }, t.label);
      })
    ),

    // Tab content
    tab === 'secrets' && renderSecrets(),
    tab === 'audit' && renderAudit(),
    tab === 'status' && renderStatus(),

    // Add Secret Modal
    showAdd && h(Modal, {
      title: 'Add Secret',
      onClose: function() { setShowAdd(false); },
      footer: h(Fragment, null,
        h('button', { className: 'btn btn-secondary', onClick: function() { setShowAdd(false); } }, 'Cancel'),
        h('button', { className: 'btn btn-primary', onClick: addSecret, disabled: addSaving }, addSaving ? 'Saving...' : 'Store Secret')
      )
    },
      h('div', null,
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Name', h('span', { style: { color: 'var(--danger)', marginLeft: 4 } }, '*')),
          h('input', {
            className: 'input', style: { width: '100%' },
            placeholder: 'e.g., AWS_SECRET_KEY, SMTP_PASSWORD',
            value: addForm.name,
            onChange: function(e) { setAddForm(function(f) { return Object.assign({}, f, { name: e.target.value }); }); }
          })
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Value', h('span', { style: { color: 'var(--danger)', marginLeft: 4 } }, '*')),
          h('input', {
            className: 'input', style: { width: '100%' },
            type: 'password',
            placeholder: 'The secret value to encrypt',
            value: addForm.value,
            onChange: function(e) { setAddForm(function(f) { return Object.assign({}, f, { value: e.target.value }); }); }
          }),
          h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 } }, 'This value will be encrypted with AES-256-GCM before storage.')
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Category'),
          h('select', {
            className: 'input', style: { width: '100%' },
            value: addForm.category,
            onChange: function(e) { setAddForm(function(f) { return Object.assign({}, f, { category: e.target.value }); }); }
          },
            CATEGORIES.map(function(c) {
              return h('option', { key: c.value, value: c.value }, c.label);
            })
          )
        )
      )
    ),

    // View Secret Modal
    viewSecret && h(Modal, {
      title: 'View Secret: ' + viewSecret.name,
      onClose: function() { setViewSecret(null); setViewValue(''); setViewRevealed(false); }
    },
      h('div', null,
        h('div', { style: { marginBottom: 16 } },
          h('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-muted)' } },
            h('span', null, 'Category: ', h('strong', null, (viewSecret.category || 'custom').replace(/_/g, ' '))),
            h('span', null, 'Created: ', h('strong', null, viewSecret.createdAt ? new Date(viewSecret.createdAt).toLocaleDateString() : '-')),
            viewSecret.rotatedAt && h('span', null, 'Rotated: ', h('strong', null, new Date(viewSecret.rotatedAt).toLocaleDateString()))
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
                h('button', {
                  className: 'btn btn-ghost btn-sm',
                  onClick: function() { rotateSecret(viewSecret); setViewSecret(null); }
                }, I.refresh(), ' Rotate')
              ),
              h('div', {
                style: { marginTop: 12, padding: 10, background: 'var(--warning-soft, rgba(245, 158, 11, 0.1))', borderRadius: 6, fontSize: 12, color: 'var(--warning)' }
              }, 'This access has been logged in the vault audit trail.')
            )
      )
    )
  );
}
