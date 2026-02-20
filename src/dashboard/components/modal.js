import { h, Fragment } from './utils.js';
import { I } from './icons.js';

export function Modal({ title, onClose, children, footer, large }) {
  return h('div', { className: 'modal-overlay', onClick: e => { if (e.target === e.currentTarget) onClose(); } },
    h('div', { className: 'modal' + (large ? ' modal-lg' : '') },
      h('div', { className: 'modal-header' },
        h('h2', null, title),
        h('button', { className: 'btn btn-ghost btn-icon', onClick: onClose }, I.x())
      ),
      h('div', { className: 'modal-body' }, children),
      footer && h('div', { className: 'modal-footer' }, footer)
    )
  );
}

// ─── Reusable Detail Modal ──────────────────────────────
//
// Renders any data object as a formatted detail view inside a Modal.
//
// Props:
//   title    — modal title
//   data     — object to display (key-value pairs rendered automatically)
//   onClose  — close handler
//   badge    — optional { label, color } shown next to the title
//   header   — optional custom element rendered above the data grid
//   exclude  — optional array of keys to hide (e.g. ['id', 'orgId'])

var _labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' };
var _valueStyle = { fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-word' };
var _monoStyle = { fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-primary)', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 };
var _jsonStyle = { fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '8px 10px', borderRadius: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto', margin: 0 };

function formatDetailValue(key, value) {
  if (value == null || value === '') return h('span', { style: { color: 'var(--text-muted)', fontSize: 12 } }, '—');

  // Timestamps
  if (typeof value === 'string' && (key.toLowerCase().includes('at') || key.toLowerCase().includes('time') || key.toLowerCase().includes('date')) && !isNaN(Date.parse(value))) {
    return h('span', { style: _valueStyle }, new Date(value).toLocaleString());
  }

  // Booleans
  if (typeof value === 'boolean') {
    return h('span', { className: 'badge badge-' + (value ? 'success' : 'neutral'), style: { fontSize: 11 } }, value ? 'Yes' : 'No');
  }

  // Arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return h('span', { style: { color: 'var(--text-muted)', fontSize: 12 } }, 'None');
    // Simple string arrays as badges
    if (value.every(function(v) { return typeof v === 'string' || typeof v === 'number'; })) {
      return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
        value.map(function(v, i) { return h('span', { key: i, className: 'badge badge-neutral', style: { fontSize: 11 } }, String(v)); })
      );
    }
    // Complex arrays as JSON
    return h('pre', { style: _jsonStyle }, JSON.stringify(value, null, 2));
  }

  // Nested objects
  if (typeof value === 'object') {
    var entries = Object.entries(value);
    if (entries.length === 0) return h('span', { style: { color: 'var(--text-muted)', fontSize: 12 } }, '{}');
    // Small flat objects as inline key:value
    if (entries.length <= 4 && entries.every(function(e) { return typeof e[1] !== 'object' || e[1] === null; })) {
      return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
        entries.map(function(e) {
          return h('span', { key: e[0], style: _monoStyle }, e[0] + ': ' + String(e[1] ?? '—'));
        })
      );
    }
    return h('pre', { style: _jsonStyle }, JSON.stringify(value, null, 2));
  }

  // UUIDs
  if (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return h('span', { style: _monoStyle }, value);
  }

  // Long strings
  if (typeof value === 'string' && value.length > 120) {
    return h('pre', { style: Object.assign({}, _jsonStyle, { whiteSpace: 'pre-wrap' }) }, value);
  }

  return h('span', { style: _valueStyle }, String(value));
}

function humanizeKey(key) {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

export function DetailModal(props) {
  var data = props.data || {};
  var exclude = props.exclude || [];
  var entries = Object.entries(data).filter(function(e) { return exclude.indexOf(e[0]) === -1; });

  return h(Modal, { title: props.title || 'Details', onClose: props.onClose, large: entries.length > 8 },
    // Optional badge next to title area
    props.badge && h('div', { style: { marginBottom: 16 } },
      h('span', { className: 'badge', style: { background: props.badge.color || 'var(--accent)', color: '#fff', fontSize: 11 } }, props.badge.label)
    ),

    // Optional custom header content
    props.header && h('div', { style: { marginBottom: 16 } }, props.header),

    // Data grid
    entries.length === 0
      ? h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)' } }, 'No data')
      : h('div', { style: { display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px 16px', alignItems: 'start' } },
          entries.map(function(e) {
            return h(Fragment, { key: e[0] },
              h('div', { style: _labelStyle }, humanizeKey(e[0])),
              h('div', null, formatDetailValue(e[0], e[1]))
            );
          })
        ),

    // Optional children below the grid
    props.children
  );
}
