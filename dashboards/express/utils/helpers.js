/**
 * AgenticMail Enterprise Dashboard — Shared Helpers
 */

function esc(s) {
  return (s || '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badge(text, variant = 'default') {
  return `<span class="badge badge-${esc(variant)}">${esc(text)}</span>`;
}

function statusBadge(status) {
  const s = (status || '').toLowerCase();
  let variant;
  if (['active', 'enabled', 'running', 'success'].includes(s)) {
    variant = 'success';
  } else if (['archived', 'disabled', 'revoked'].includes(s)) {
    variant = 'danger';
  } else if (['pending', 'paused'].includes(s)) {
    variant = 'warning';
  } else {
    variant = 'default';
  }
  return badge(status, variant);
}

function timeAgo(iso) {
  if (!iso) return 'N/A';
  try {
    const t = new Date(iso);
    const diff = Math.floor((Date.now() - t.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return String(iso);
  }
}

module.exports = { esc, badge, statusBadge, timeAgo };
