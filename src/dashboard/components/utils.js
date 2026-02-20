const h = React.createElement;
const { useState, useEffect, useCallback, useRef, Fragment, createContext, useContext } = React;
const AppContext = createContext();
export { h, useState, useEffect, useCallback, useRef, Fragment, createContext, useContext, AppContext };

export function useApp() { return useContext(AppContext); }

// Derive accent color variants from a hex color
export function applyBrandColor(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  const r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16);
  const root = document.documentElement;
  root.style.setProperty('--brand-color', hex);
  // Darken by 15% for hover
  root.style.setProperty('--brand-hover', `rgb(${Math.round(r*0.85)},${Math.round(g*0.85)},${Math.round(b*0.85)})`);
  // 12% opacity for soft bg
  root.style.setProperty('--brand-soft', `rgba(${r},${g},${b},0.15)`);
  // Lighten for text variant
  const lr = Math.min(255, r + Math.round((255-r)*0.35)), lg = Math.min(255, g + Math.round((255-g)*0.35)), lb = Math.min(255, b + Math.round((255-b)*0.35));
  root.style.setProperty('--brand-text', `rgb(${lr},${lg},${lb})`);
}

// Get CSRF token from cookie (non-httpOnly, readable by JS)
export function getCsrf() {
  const m = document.cookie.match(/em_csrf=([^;]+)/);
  return m ? m[1] : '';
}

let _refreshing = null;
export async function tryRefreshToken() {
  if (_refreshing) return _refreshing;
  _refreshing = fetch('/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrf() } })
    .then(async r => { _refreshing = null; if (!r.ok) throw new Error('refresh failed'); return r.json(); })
    .catch(e => { _refreshing = null; throw e; });
  return _refreshing;
}

export function apiCall(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrf() };
  const apiKey = localStorage.getItem('em_api_key');
  if (apiKey) headers['X-API-Key'] = apiKey;
  const url = '/api' + (path.startsWith('/') ? '' : '/') + path;
  return fetch(url, { ...opts, credentials: 'same-origin', headers: { ...headers, ...opts.headers } })
    .then(async r => {
      if (r.status === 401 && !opts._retried) {
        try { await tryRefreshToken(); return apiCall(path, { ...opts, _retried: true }); }
        catch { if (window.__emLogout) window.__emLogout(); throw new Error('Session expired'); }
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || r.statusText);
      return d;
    });
}
export function authCall(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrf() };
  return fetch('/auth' + (path.startsWith('/') ? '' : '/') + path, { ...opts, credentials: 'same-origin', headers: { ...headers, ...opts.headers } })
    .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || r.statusText); return d; });
}
export function engineCall(path, opts = {}) { return apiCall('/engine' + (path.startsWith('/') ? '' : '/') + path, opts); }

export function formatUptime(seconds) {
  if (!seconds || seconds < 0) return '-';
  var d = Math.floor(seconds / 86400);
  var h = Math.floor((seconds % 86400) / 3600);
  var m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return d + 'd ' + h + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

export var DEPLOY_PHASES = ['validate', 'provision', 'configure', 'upload', 'install', 'start', 'healthcheck', 'complete'];
export var DEPLOY_PHASE_LABELS = { validate: 'Validate Config', provision: 'Provision Infrastructure', configure: 'Configure Environment', upload: 'Upload Agent Files', install: 'Install Dependencies', start: 'Start Agent Process', healthcheck: 'Health Check', complete: 'Complete' };

export async function showConfirm(opts) { return window.__showConfirm ? window.__showConfirm(opts) : confirm(opts.message); }

var _uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildAgentEmailMap(agents) {
  const map = {};
  (agents || []).forEach(a => {
    const identity = a.config?.identity || {};
    const email = identity.email || a.config?.email?.address || a.config?.email || a.email || null;
    if (email && !_uuidRe.test(email)) {
      map[a.id] = email;
    } else {
      map[a.id] = ((identity.name || a.config?.name || a.name || a.id).toLowerCase().replace(/\s+/g, '-') + '@agenticmail.local');
    }
  });
  return map;
}

export function buildAgentDataMap(agents) {
  const map = {};
  (agents || []).forEach(a => {
    const identity = a.config?.identity || {};
    const name = identity.name || a.config?.displayName || a.config?.name || a.name || null;
    const rawEmail = identity.email || a.config?.email?.address || a.config?.email || a.email || null;
    const email = (rawEmail && !_uuidRe.test(rawEmail)) ? rawEmail : null;
    const avatar = identity.avatar || null;
    map[a.id] = { name, email, avatar };
  });
  return map;
}

export function resolveAgentEmail(id, emailMap) {
  if (!id) return 'Unknown';
  if (id === 'system') return 'system@agenticmail.local';
  if (id.startsWith('ext:email:')) return id.slice(10);
  if (id.startsWith('ext:')) return id.slice(4);
  return emailMap?.[id] || id;
}

var _badgeAvatarStyle = { width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 };
var _badgeInitialStyle = { width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 };

export function renderAgentBadge(id, agentDataMap) {
  if (!id) return h('span', null, 'Unknown');
  if (id === 'system') return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
    h('div', { style: _badgeInitialStyle }, 'S'),
    h('div', { style: { lineHeight: 1.3 } },
      h('div', { style: { fontWeight: 500, fontSize: 13 } }, 'System'),
      h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'system@agenticmail.local')
    )
  );
  if (id.startsWith('ext:')) {
    var extEmail = id.startsWith('ext:email:') ? id.slice(10) : id.slice(4);
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
      h('div', { style: _badgeInitialStyle }, extEmail.charAt(0).toUpperCase()),
      h('div', { style: { lineHeight: 1.3 } },
        h('div', { style: { fontWeight: 500, fontSize: 13 } }, extEmail),
        h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'External')
      )
    );
  }
  var data = agentDataMap?.[id];
  if (!data) return h('span', { style: { fontSize: 13 } }, id);
  var displayName = data.name || 'Agent';
  var displayEmail = data.email || '';
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
    data.avatar
      ? h('img', { src: data.avatar, style: _badgeAvatarStyle })
      : h('div', { style: _badgeInitialStyle }, displayName.charAt(0).toUpperCase()),
    h('div', { style: { lineHeight: 1.3 } },
      h('div', { style: { fontWeight: 500, fontSize: 13 } }, displayName),
      h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, displayEmail)
    )
  );
}
