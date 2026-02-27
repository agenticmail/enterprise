import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

export function Badge(props) {
  return h('span', {
    style: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, color: '#fff', background: props.color || '#64748b', whiteSpace: 'nowrap' }
  }, props.children);
}

export function StatCard(props) {
  return h('div', { className: 'stat-card' },
    h('div', { className: 'stat-label' }, props.label),
    h('div', { className: 'stat-value', style: props.color ? { color: props.color } : null }, props.value),
    props.sub && h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, props.sub)
  );
}

export function ProgressBar(props) {
  var pct = props.total > 0 ? Math.round((props.value / props.total) * 100) : 0;
  var barColor = pct < 50 ? 'var(--success)' : pct < 80 ? 'var(--warning)' : 'var(--danger)';
  return h('div', { style: { marginBottom: 12 } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 } },
      h('span', { style: { color: 'var(--text-secondary)' } }, props.label),
      h('span', { style: { color: 'var(--text-muted)' } }, formatNumber(props.value) + ' / ' + formatNumber(props.total) + (props.unit ? ' ' + props.unit : ''))
    ),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, width: '100%' } },
      h('div', { style: { flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' } },
        h('div', { style: { width: Math.min(pct, 100) + '%', height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.3s' } })
      ),
      h('span', { style: { fontSize: 12, color: 'var(--text-muted)', minWidth: 40 } }, pct + '%')
    )
  );
}

export function EmptyState(props) {
  return h('div', { style: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' } },
    props.icon && h('div', { style: { fontSize: 32, marginBottom: 8, opacity: 0.5 } }, props.icon),
    h('div', { style: { fontSize: 14, marginBottom: 8 } }, props.message || 'No data'),
    props.action && h('button', { className: 'btn btn-primary btn-sm', onClick: props.action.onClick }, props.action.label)
  );
}

export function formatNumber(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString();
}

export function formatCost(n) {
  if (n == null) return '$0.00';
  return '$' + Number(n).toFixed(4);
}

export function riskBadgeClass(level) {
  if (!level) return 'badge badge-neutral';
  var l = level.toLowerCase();
  if (l === 'low') return 'badge badge-success';
  if (l === 'medium') return 'badge badge-warning';
  if (l === 'high' || l === 'critical') return 'badge badge-danger';
  return 'badge badge-neutral';
}

// ════════════════════════════════════════════════════════════
// OVERVIEW SECTION
// ════════════════════════════════════════════════════════════

export function formatTime(iso) { return iso ? new Date(iso).toLocaleString() : '-'; }

export var MEMORY_CATEGORIES = [
  { value: 'org_knowledge', label: 'Org Knowledge', color: '#6366f1' },
  { value: 'interaction_pattern', label: 'Interaction Pattern', color: '#0ea5e9' },
  { value: 'preference', label: 'Preference', color: '#10b981' },
  { value: 'correction', label: 'Correction', color: '#f59e0b' },
  { value: 'skill', label: 'Skill', color: '#8b5cf6' },
  { value: 'context', label: 'Context', color: '#64748b' },
  { value: 'reflection', label: 'Reflection', color: '#ec4899' },
];

export function memCatColor(cat) { var f = MEMORY_CATEGORIES.find(function(c) { return c.value === cat; }); return f ? f.color : '#64748b'; }
export function memCatLabel(cat) { var f = MEMORY_CATEGORIES.find(function(c) { return c.value === cat; }); return f ? f.label : cat; }
export function importanceBadgeColor(imp) { return imp === 'critical' ? '#ef4444' : imp === 'high' ? '#f97316' : imp === 'normal' ? '#0ea5e9' : '#64748b'; }
