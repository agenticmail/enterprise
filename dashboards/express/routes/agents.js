/**
 * AgenticMail Enterprise Dashboard — Agents Routes
 * GET /agents, GET /agents/:id, POST /agents, POST /agents/:id/archive
 * POST /agents/:id/deploy, POST /agents/:id/stop, POST /agents/:id/restart
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { apiGet, apiPost, apiPatch } = require('../utils/api');
const { layout } = require('../views/layout');
const { buildTable } = require('../views/components/table');
const { agentCreateForm } = require('../views/components/modal');
const { esc, badge, statusBadge, timeAgo } = require('../utils/helpers');

const router = Router();

router.get('/agents', requireAuth, async (req, res) => {
  const flash = req.session.flash;
  delete req.session.flash;

  const result = await apiGet('/api/agents', req.session.token);
  const agents = result.status === 200
    ? (Array.isArray(result.body.agents) ? result.body.agents : (Array.isArray(result.body) ? result.body : []))
    : [];

  const rows = agents.map(a => {
    const archiveBtn = (a.status || '').toLowerCase() !== 'archived'
      ? `<form method="post" action="/agents/${esc(a.id)}/archive" style="display:inline" onsubmit="return confirm('Archive this agent?')">
           <button class="btn btn-sm btn-danger" type="submit">Archive</button>
         </form>`
      : '';
    return [
      `<a href="/agents/${esc(a.id)}" style="font-weight:600;color:var(--primary)">${esc(a.name || '-')}</a>`,
      `<code>${esc(a.model || '-')}</code>`,
      statusBadge(a.status || 'active'),
      `<span style="color:var(--text-muted)">${timeAgo(a.created_at)}</span>`,
      archiveBtn,
    ];
  });

  const table = buildTable(
    ['Name', 'Model', 'Status', 'Created', 'Actions'],
    rows,
    '&#129302;',
    'No agents yet. Create one above.'
  );

  const content = `
    <div class="page-header">
      <h1>Agents</h1>
      <p>Manage AI agents in your organization</p>
    </div>
    ${agentCreateForm()}
    <div class="card">
      <h3>All Agents (${agents.length})</h3>
      ${table}
    </div>`;

  res.send(layout('agents', req.session.user, content, flash));
});

// ─── Agent Detail Page ──────────────────────────────────────

router.get('/agents/:id', requireAuth, async (req, res) => {
  const flash = req.session.flash;
  delete req.session.flash;
  const agentId = req.params.id;

  const [fullRes, adminRes, eventsRes, toolCallsRes, journalRes, toolSecRes] = await Promise.all([
    apiGet(`/engine/bridge/agents/${agentId}/full`, req.session.token),
    apiGet(`/api/agents/${agentId}`, req.session.token),
    apiGet(`/api/engine/activity/events?agentId=${agentId}&limit=50`, req.session.token),
    apiGet(`/api/engine/activity/tool-calls?agentId=${agentId}&limit=50`, req.session.token),
    apiGet(`/api/engine/journal?agentId=${agentId}&orgId=default&limit=50`, req.session.token),
    apiGet(`/engine/agents/${agentId}/tool-security`, req.session.token),
  ]);

  const fullData = fullRes.status === 200 ? fullRes.body : null;
  const adminData = adminRes.status === 200 ? adminRes.body : null;

  if (!fullData && !adminData) {
    req.session.flash = { message: 'Agent not found', type: 'danger' };
    return res.redirect('/agents');
  }

  const engineAgent = fullData ? (fullData.agent || fullData) : {};
  const agent = adminData || {};
  const config = engineAgent.config || {};
  const identity = config.identity || {};
  const profile = fullData ? (fullData.permissions || null) : null;

  // Resolve display values (following critical data rules)
  const displayName = identity.name || config.name || config.displayName || agent.name || 'Unnamed Agent';
  const displayEmail = identity.email || config.email || agent.email || '';
  const avatarInitial = (displayName || '?').charAt(0).toUpperCase();
  const agentRole = identity.role || config.role || agent.role || 'agent';
  const rawModel = config.model;
  const agentModel = typeof rawModel === 'string'
    ? rawModel
    : (rawModel ? (rawModel.modelId || rawModel.provider || 'unknown') : (agent.model || 'unknown'));
  const agentDesc = identity.description || config.description || agent.description || '';
  const createdAt = engineAgent.createdAt || engineAgent.created_at || agent.createdAt || agent.created_at || '';
  const agentState = engineAgent.state || engineAgent.status || agent.status || 'unknown';

  // State badge color
  const stateVariant = { running: 'success', active: 'success', deploying: 'warning', starting: 'warning', ready: 'primary', degraded: 'warning', error: 'danger', stopped: 'danger', draft: 'default', archived: 'danger' }[agentState] || 'default';

  // Personality traits
  const rawTraits = identity.personality_traits || identity.traits || config.personality_traits || {};
  let traitsHtml = '';
  if (rawTraits && typeof rawTraits === 'object' && !Array.isArray(rawTraits) && Object.keys(rawTraits).length > 0) {
    traitsHtml = Object.entries(rawTraits).map(([key, val]) =>
      `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;background:var(--bg);border:1px solid var(--border);font-size:12px;margin:3px">
        <span style="color:var(--text-muted);text-transform:capitalize">${esc(key)}:</span>
        <span style="font-weight:600;text-transform:capitalize">${esc(String(val))}</span>
      </span>`
    ).join('');
  } else if (Array.isArray(rawTraits) && rawTraits.length > 0) {
    traitsHtml = rawTraits.map(t =>
      `<span style="display:inline-block;padding:4px 10px;border-radius:6px;background:var(--bg);border:1px solid var(--border);font-size:12px;font-weight:600;text-transform:capitalize;margin:3px">${esc(String(t))}</span>`
    ).join('');
  }

  // Personal details
  const gender = identity.gender || '';
  const dob = identity.dateOfBirth || '';
  const maritalStatus = identity.maritalStatus || '';
  const culturalBackground = identity.culturalBackground || '';
  const language = identity.language || '';

  // Permission profile summary
  let permissionHtml = '';
  if (profile) {
    const profileName = profile.name || profile.preset || 'Custom';
    const maxRisk = profile.maxRiskLevel || profile.max_risk_level || 'medium';
    const sandboxMode = profile.sandboxMode || profile.sandbox_mode || false;
    const rateLimits = profile.rateLimits || profile.rate_limits || {};
    const callsPerMin = rateLimits.toolCallsPerMinute || rateLimits.callsPerMinute || rateLimits.calls_per_minute || 0;
    const callsPerHr = rateLimits.toolCallsPerHour || rateLimits.callsPerHour || rateLimits.calls_per_hour || 0;
    const blockedSideEffects = profile.blockedSideEffects || profile.blocked_side_effects || [];

    permissionHtml = `
    <div class="card">
      <h3>Permission Profile</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Profile</div>
          <div style="font-size:14px;font-weight:600">${esc(profileName)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Max Risk Level</div>
          <div>${badge(maxRisk, maxRisk === 'low' ? 'success' : maxRisk === 'high' || maxRisk === 'critical' ? 'danger' : 'warning')}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Sandbox Mode</div>
          <div style="font-size:14px;font-weight:600">${sandboxMode ? 'Enabled' : 'Disabled'}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Rate Limits</div>
          <div style="font-size:13px">${callsPerMin ? callsPerMin + '/min' : ''}${callsPerMin && callsPerHr ? ', ' : ''}${callsPerHr ? callsPerHr + '/hr' : ''}${!callsPerMin && !callsPerHr ? 'None set' : ''}</div>
        </div>
      </div>
      ${blockedSideEffects.length > 0 ? `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Blocked Side Effects</div>
          <div>${blockedSideEffects.map(s => `<span class="badge badge-danger" style="margin:2px">${esc(s)}</span>`).join('')}</div>
        </div>` : ''}
    </div>`;
  }

  // Build field helper
  const field = (label, value) => `
    <div style="margin-bottom:12px">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">${label}</div>
      <div style="font-size:14px;color:var(--text)">${value || '<span style="color:var(--text-muted)">&mdash;</span>'}</div>
    </div>`;

  // Email display: don't show raw UUIDs
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const emailDisplay = displayEmail && !isUUID.test(displayEmail) ? displayEmail : '';

  const content = `
    <div class="page-header" style="margin-bottom:20px">
      <a href="/agents" style="font-size:13px;color:var(--primary);display:inline-flex;align-items:center;gap:4px;margin-bottom:12px">&larr; Back to Agents</a>
    </div>

    <!-- Agent Header -->
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
      <div style="width:52px;height:52px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;flex-shrink:0">${esc(avatarInitial)}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <h1 style="font-size:22px;font-weight:700;margin:0">${esc(displayName)}</h1>
          ${badge(agentState, stateVariant)}
          ${badge(agentRole, 'primary')}
        </div>
        ${emailDisplay ? `<div style="margin-top:4px;font-family:monospace;font-size:13px;color:var(--text-muted)">${esc(emailDisplay)}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <form method="post" action="/agents/${esc(agentId)}/deploy" style="display:inline"><button class="btn btn-primary btn-sm" type="submit">Deploy</button></form>
        <form method="post" action="/agents/${esc(agentId)}/stop" style="display:inline"><button class="btn btn-danger btn-sm" type="submit">Stop</button></form>
        <form method="post" action="/agents/${esc(agentId)}/restart" style="display:inline"><button class="btn btn-sm" type="submit">Restart</button></form>
      </div>
    </div>

    <!-- Summary Card -->
    <div class="card" style="margin-bottom:20px">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:16px">
        <div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;font-weight:600">Status</div>
          ${badge(agentState, stateVariant)}
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;font-weight:600">Role</div>
          <span style="font-size:13px;font-weight:500;text-transform:capitalize">${esc(agentRole)}</span>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;font-weight:600">Model</div>
          <code style="font-size:13px">${esc(agentModel)}</code>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;font-weight:600">Created</div>
          <span style="font-size:13px;font-weight:500">${createdAt ? new Date(createdAt).toLocaleDateString() : '&mdash;'}</span>
        </div>
      </div>
      ${agentDesc ? `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);font-size:13px;color:var(--text-dim);line-height:1.6">${esc(agentDesc)}</div>` : ''}
      ${traitsHtml ? `<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:4px">${traitsHtml}</div>` : ''}
    </div>

    <!-- Personal Details -->
    ${(gender || dob || maritalStatus || culturalBackground || language) ? `
    <div class="card" style="margin-bottom:20px">
      <h3>Personal Details</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px">
        ${field('Gender', esc(gender))}
        ${field('Date of Birth', esc(dob))}
        ${field('Marital Status', esc(maritalStatus))}
        ${field('Cultural Background', esc(culturalBackground))}
        ${field('Language', esc(language))}
      </div>
    </div>` : ''}

    <!-- Permission Profile -->
    ${permissionHtml}

    <!-- Tool Security -->
    ${(() => {
      const tsData = toolSecRes.status === 200 ? toolSecRes.body : {};
      const tsMerged = tsData.toolSecurity || {};
      const tsOrgDefaults = tsData.orgDefaults || {};
      const tsOverrides = tsData.agentOverrides || {};
      const tsSec = tsMerged.security || {};
      const tsMw = tsMerged.middleware || {};
      const tsPs = tsSec.pathSandbox || {};
      const tsSsrf = tsSec.ssrf || {};
      const tsCs = tsSec.commandSanitizer || {};
      const tsAudit = tsMw.audit || {};
      const tsRl = tsMw.rateLimit || {};
      const tsCb = tsMw.circuitBreaker || {};
      const tsTel = tsMw.telemetry || {};
      const hasOverrides = Object.keys(tsOverrides).length > 0;

      return `
    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div>
          <h3 style="margin:0">Tool Security</h3>
          <p style="margin:4px 0 0;font-size:13px;color:var(--text-muted)">Per-agent overrides. Unmodified settings inherit from org defaults.</p>
        </div>
        ${hasOverrides ? `<form method="post" action="/agents/${esc(agentId)}/tool-security/reset" style="display:inline" onsubmit="return confirm('Reset all tool security overrides to org defaults?')">
          <button class="btn btn-sm" type="submit">Reset to Org Defaults</button>
        </form>` : ''}
      </div>
      <form method="post" action="/agents/${esc(agentId)}/tool-security">

        <h4 style="font-size:13px;font-weight:600;color:var(--text-muted);margin:12px 0 10px;text-transform:uppercase;letter-spacing:0.05em">Security Sandboxes</h4>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
          <div style="border:1px solid var(--border);border-radius:8px;padding:14px">
            <div style="font-size:14px;font-weight:600;margin-bottom:4px">Path Sandbox</div>
            <div class="form-group" style="margin-bottom:6px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="ps_enabled" ${tsPs.enabled !== false ? 'checked' : ''}>
                <span style="font-size:13px">Enable</span>
              </label>
            </div>
            <div class="form-group" style="margin-bottom:6px">
              <label style="font-size:11px;font-weight:600;color:var(--text-muted)">Allowed Dirs (comma-separated)</label>
              <input type="text" name="ps_allowedDirs" value="${esc((tsPs.allowedDirs || []).join(', '))}" placeholder="/path/to/allow" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
              <label style="font-size:11px;font-weight:600;color:var(--text-muted)">Blocked Patterns (comma-separated)</label>
              <input type="text" name="ps_blockedPatterns" value="${esc((tsPs.blockedPatterns || []).join(', '))}" placeholder="\\.env$" style="font-family:monospace;font-size:12px">
            </div>
          </div>

          <div style="border:1px solid var(--border);border-radius:8px;padding:14px">
            <div style="font-size:14px;font-weight:600;margin-bottom:4px">SSRF Protection</div>
            <div class="form-group" style="margin-bottom:6px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="ssrf_enabled" ${tsSsrf.enabled !== false ? 'checked' : ''}>
                <span style="font-size:13px">Enable</span>
              </label>
            </div>
            <div class="form-group" style="margin-bottom:6px">
              <label style="font-size:11px;font-weight:600;color:var(--text-muted)">Allowed Hosts (comma-separated)</label>
              <input type="text" name="ssrf_allowedHosts" value="${esc((tsSsrf.allowedHosts || []).join(', '))}" placeholder="api.example.com" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
              <label style="font-size:11px;font-weight:600;color:var(--text-muted)">Blocked CIDRs (comma-separated)</label>
              <input type="text" name="ssrf_blockedCidrs" value="${esc((tsSsrf.blockedCidrs || []).join(', '))}" placeholder="10.0.0.0/8" style="font-family:monospace;font-size:12px">
            </div>
          </div>
        </div>

        <div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">
          <div style="font-size:14px;font-weight:600;margin-bottom:4px">Command Sanitizer</div>
          <div class="form-group" style="margin-bottom:6px">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" name="cs_enabled" ${tsCs.enabled !== false ? 'checked' : ''}>
              <span style="font-size:13px">Enable</span>
            </label>
          </div>
          <div class="form-group" style="margin-bottom:6px">
            <label style="font-size:11px;font-weight:600;color:var(--text-muted)">Mode</label>
            <select name="cs_mode" style="width:250px">
              <option value="blocklist" ${(tsCs.mode || 'blocklist') === 'blocklist' ? 'selected' : ''}>Blocklist</option>
              <option value="allowlist" ${tsCs.mode === 'allowlist' ? 'selected' : ''}>Allowlist</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            <div class="form-group">
              <label style="font-size:11px;font-weight:600;color:var(--text-muted)">Allowed Commands (comma-separated)</label>
              <input type="text" name="cs_allowedCommands" value="${esc((tsCs.allowedCommands || []).join(', '))}" placeholder="git, npm, node" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
              <label style="font-size:11px;font-weight:600;color:var(--text-muted)">Blocked Patterns (comma-separated)</label>
              <input type="text" name="cs_blockedPatterns" value="${esc((tsCs.blockedPatterns || []).join(', '))}" placeholder="curl.*\\|.*sh" style="font-family:monospace;font-size:12px">
            </div>
          </div>
        </div>

        <h4 style="font-size:13px;font-weight:600;color:var(--text-muted);margin:12px 0 10px;text-transform:uppercase;letter-spacing:0.05em">Middleware &amp; Observability</h4>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
          <div style="border:1px solid var(--border);border-radius:8px;padding:14px">
            <div style="font-size:14px;font-weight:600;margin-bottom:4px">Audit Logging</div>
            <div class="form-group" style="margin-bottom:6px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="audit_enabled" ${tsAudit.enabled !== false ? 'checked' : ''}>
                <span style="font-size:13px">Enable</span>
              </label>
            </div>
            <div class="form-group">
              <label style="font-size:11px;font-weight:600;color:var(--text-muted)">Keys to Redact (comma-separated)</label>
              <input type="text" name="audit_redactKeys" value="${esc((tsAudit.redactKeys || []).join(', '))}" placeholder="custom_secret" style="font-family:monospace;font-size:12px">
            </div>
          </div>

          <div style="border:1px solid var(--border);border-radius:8px;padding:14px">
            <div style="font-size:14px;font-weight:600;margin-bottom:4px">Rate Limiting</div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="rl_enabled" ${tsRl.enabled !== false ? 'checked' : ''}>
                <span style="font-size:13px">Enable</span>
              </label>
            </div>
          </div>

          <div style="border:1px solid var(--border);border-radius:8px;padding:14px">
            <div style="font-size:14px;font-weight:600;margin-bottom:4px">Circuit Breaker</div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="cb_enabled" ${tsCb.enabled !== false ? 'checked' : ''}>
                <span style="font-size:13px">Enable</span>
              </label>
            </div>
          </div>

          <div style="border:1px solid var(--border);border-radius:8px;padding:14px">
            <div style="font-size:14px;font-weight:600;margin-bottom:4px">Telemetry</div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="tel_enabled" ${tsTel.enabled !== false ? 'checked' : ''}>
                <span style="font-size:13px">Enable</span>
              </label>
            </div>
          </div>
        </div>

        <button class="btn btn-primary" type="submit">Save Tool Security Overrides</button>
      </form>
    </div>`;
    })()}

    <!-- Activity Section -->
    ${(() => {
      const events = eventsRes.status === 200 && eventsRes.body ? (eventsRes.body.events || []) : [];
      const toolCalls = toolCallsRes.status === 200 && toolCallsRes.body ? (toolCallsRes.body.toolCalls || []) : [];
      const journalEntries = journalRes.status === 200 && journalRes.body ? (journalRes.body.entries || []) : [];

      // Build Events table rows
      const eventsRows = events.map((ev, i) => {
        const details = typeof ev.data === 'object' ? JSON.stringify(ev.data) : (ev.details || ev.data || '-');
        const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);
        return `<tr style="cursor:pointer" data-activity-item='${esc(JSON.stringify(ev)).replace(/'/g, '&#39;')}'>
          <td style="font-size:12px;color:var(--text-muted);white-space:nowrap">${ev.timestamp || ev.createdAt ? new Date(ev.timestamp || ev.createdAt).toLocaleString() : '-'}</td>
          <td><span class="badge badge-info">${esc(ev.type || ev.eventType || '-')}</span></td>
          <td style="font-family:monospace;font-size:12px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted)">${esc(detailsStr.substring(0, 200))}</td>
        </tr>`;
      }).join('');

      const eventsTable = events.length === 0
        ? '<div style="padding:40px;text-align:center;color:var(--text-muted)">No events recorded for this agent</div>'
        : `<table class="data-table"><thead><tr><th>Time</th><th>Type</th><th>Details</th></tr></thead><tbody>${eventsRows}</tbody></table>`;

      // Build Tool Calls table rows
      const toolCallsRows = toolCalls.map((tc, i) => {
        const statusClass = tc.success === true ? 'badge badge-success' : tc.success === false ? 'badge badge-danger' : 'badge badge-default';
        const statusLabel = tc.success === true ? 'OK' : tc.success === false ? 'Failed' : (tc.status || 'Pending');
        return `<tr style="cursor:pointer" data-activity-item='${esc(JSON.stringify(tc)).replace(/'/g, '&#39;')}'>
          <td style="font-size:12px;color:var(--text-muted);white-space:nowrap">${tc.timestamp || tc.createdAt ? new Date(tc.timestamp || tc.createdAt).toLocaleString() : '-'}</td>
          <td><span style="font-family:monospace;font-size:12px">${esc(tc.tool || tc.toolName || '-')}</span></td>
          <td>${tc.durationMs ? esc(String(tc.durationMs)) + 'ms' : '-'}</td>
          <td><span class="${statusClass}">${esc(statusLabel)}</span></td>
        </tr>`;
      }).join('');

      const toolCallsTable = toolCalls.length === 0
        ? '<div style="padding:40px;text-align:center;color:var(--text-muted)">No tool calls recorded for this agent</div>'
        : `<table class="data-table"><thead><tr><th>Time</th><th>Tool</th><th>Duration</th><th>Status</th></tr></thead><tbody>${toolCallsRows}</tbody></table>`;

      // Build Journal table rows
      const journalRows = journalEntries.map((e) => {
        const rollbackBtn = e.reversible && !e.reversed
          ? `<form method="post" action="/agents/${esc(agentId)}/journal/${esc(e.id)}/rollback" style="display:inline" onsubmit="return confirm('Rollback this journal entry?')"><button class="btn btn-ghost btn-sm" type="submit">&#8630; Rollback</button></form>`
          : '';
        return `<tr style="cursor:pointer" data-activity-item='${esc(JSON.stringify(e)).replace(/'/g, '&#39;')}' data-has-rollback="${e.reversible && !e.reversed ? '1' : '0'}">
          <td style="font-size:12px;color:var(--text-muted);white-space:nowrap">${e.createdAt ? new Date(e.createdAt).toLocaleString() : '-'}</td>
          <td>${esc(e.toolName || e.toolId || '-')}</td>
          <td><span class="badge badge-default">${esc(e.actionType || '-')}</span></td>
          <td>${e.reversible ? '&#9989;' : '&#10060;'}</td>
          <td>${e.reversed
            ? '<span class="badge badge-warning">Rolled Back</span>'
            : '<span class="badge badge-success">Active</span>'}</td>
          <td onclick="event.stopPropagation()">${rollbackBtn}</td>
        </tr>`;
      }).join('');

      const journalTable = journalEntries.length === 0
        ? '<div style="padding:40px;text-align:center;color:var(--text-muted)">No journal entries for this agent</div>'
        : `<table class="data-table"><thead><tr><th>Time</th><th>Tool</th><th>Action Type</th><th>Reversible</th><th>Status</th><th>Actions</th></tr></thead><tbody>${journalRows}</tbody></table>`;

      return `
    <div class="card" style="margin-top:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)">
        <h3 style="margin:0;font-size:15px;font-weight:600">Activity</h3>
      </div>
      <div style="border-bottom:1px solid var(--border)">
        <div class="tabs" style="padding:0 16px">
          <div class="tab active" data-activity-tab="events" onclick="switchActivityTab('events')">Events</div>
          <div class="tab" data-activity-tab="tools" onclick="switchActivityTab('tools')">Tool Calls</div>
          <div class="tab" data-activity-tab="journal" onclick="switchActivityTab('journal')">Journal</div>
        </div>
      </div>
      <div>
        <div id="activity-tab-events">${eventsTable}</div>
        <div id="activity-tab-tools" style="display:none">${toolCallsTable}</div>
        <div id="activity-tab-journal" style="display:none">${journalTable}</div>
      </div>
    </div>

    <!-- Activity Detail Modal -->
    <div id="activity-detail-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center">
      <div style="background:var(--card-bg,#fff);border-radius:12px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)">
          <h2 style="margin:0;font-size:16px;font-weight:600" id="activity-modal-title">Detail</h2>
          <button class="btn btn-ghost btn-sm" onclick="closeActivityModal()" style="font-size:18px;line-height:1;padding:4px 8px">&times;</button>
        </div>
        <div style="padding:20px" id="activity-modal-body"></div>
      </div>
    </div>

    <script>
    function switchActivityTab(tab) {
      var tabs = ['events', 'tools', 'journal'];
      tabs.forEach(function(t) {
        var panel = document.getElementById('activity-tab-' + t);
        var tabEl = document.querySelector('[data-activity-tab="' + t + '"]');
        if (t === tab) {
          panel.style.display = '';
          tabEl.classList.add('active');
        } else {
          panel.style.display = 'none';
          tabEl.classList.remove('active');
        }
      });
    }

    function humanizeKey(key) {
      return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\\b\\w/g, function(c) { return c.toUpperCase(); });
    }

    function escHtml(s) {
      var d = document.createElement('div');
      d.textContent = String(s);
      return d.innerHTML;
    }

    function formatValue(key, value) {
      if (value == null || value === '') return '<span style="color:var(--text-muted);font-size:12px">&mdash;</span>';
      if (typeof value === 'boolean') {
        return '<span class="badge badge-' + (value ? 'success' : 'default') + '" style="font-size:11px">' + (value ? 'Yes' : 'No') + '</span>';
      }
      var lk = key.toLowerCase();
      if (typeof value === 'string' && (lk.indexOf('at') !== -1 || lk.indexOf('time') !== -1 || lk.indexOf('date') !== -1) && !isNaN(Date.parse(value))) {
        return '<span style="font-size:13px">' + new Date(value).toLocaleString() + '</span>';
      }
      if (Array.isArray(value)) {
        if (value.length === 0) return '<span style="color:var(--text-muted);font-size:12px">None</span>';
        if (value.every(function(v) { return typeof v === 'string' || typeof v === 'number'; })) {
          return value.map(function(v) { return '<span class="badge badge-default" style="font-size:11px;margin:2px">' + escHtml(v) + '</span>'; }).join(' ');
        }
        return '<pre style="font-size:11px;font-family:monospace;background:var(--bg-secondary,#f5f5f5);padding:8px 10px;border-radius:6px;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow:auto;margin:0">' + escHtml(JSON.stringify(value, null, 2)) + '</pre>';
      }
      if (typeof value === 'object') {
        var entries = Object.entries(value);
        if (entries.length === 0) return '<span style="color:var(--text-muted);font-size:12px">{}</span>';
        if (entries.length <= 4 && entries.every(function(e) { return typeof e[1] !== 'object' || e[1] === null; })) {
          return entries.map(function(e) { return '<span style="font-size:12px;font-family:monospace;background:var(--bg-secondary,#f5f5f5);padding:2px 6px;border-radius:4px;margin:2px">' + escHtml(e[0]) + ': ' + escHtml(String(e[1] == null ? '\\u2014' : e[1])) + '</span>'; }).join(' ');
        }
        return '<pre style="font-size:11px;font-family:monospace;background:var(--bg-secondary,#f5f5f5);padding:8px 10px;border-radius:6px;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow:auto;margin:0">' + escHtml(JSON.stringify(value, null, 2)) + '</pre>';
      }
      if (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        return '<span style="font-size:12px;font-family:monospace;background:var(--bg-secondary,#f5f5f5);padding:2px 6px;border-radius:4px">' + escHtml(value) + '</span>';
      }
      if (typeof value === 'string' && value.length > 120) {
        return '<pre style="font-size:11px;font-family:monospace;background:var(--bg-secondary,#f5f5f5);padding:8px 10px;border-radius:6px;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow:auto;margin:0">' + escHtml(value) + '</pre>';
      }
      return '<span style="font-size:13px">' + escHtml(String(value)) + '</span>';
    }

    function showActivityDetail(item, title) {
      var modal = document.getElementById('activity-detail-modal');
      var modalTitle = document.getElementById('activity-modal-title');
      var modalBody = document.getElementById('activity-modal-body');
      modalTitle.textContent = title || 'Detail';
      var exclude = ['agentId'];
      var entries = Object.entries(item).filter(function(e) { return exclude.indexOf(e[0]) === -1; });
      if (entries.length === 0) {
        modalBody.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">No data</div>';
      } else {
        var typeLabel = item.type || item.eventType || item.tool || item.toolName || item.actionType || 'Detail';
        var badgeHtml = '<div style="margin-bottom:16px"><span class="badge badge-info" style="font-size:11px">' + escHtml(typeLabel) + '</span></div>';
        var gridHtml = '<div style="display:grid;grid-template-columns:140px 1fr;gap:12px 16px;align-items:start">';
        entries.forEach(function(e) {
          gridHtml += '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">' + escHtml(humanizeKey(e[0])) + '</div>';
          gridHtml += '<div>' + formatValue(e[0], e[1]) + '</div>';
        });
        gridHtml += '</div>';
        modalBody.innerHTML = badgeHtml + gridHtml;
      }
      modal.style.display = 'flex';
    }

    function closeActivityModal() {
      document.getElementById('activity-detail-modal').style.display = 'none';
    }

    // Close modal on overlay click
    document.getElementById('activity-detail-modal').addEventListener('click', function(e) {
      if (e.target === this) closeActivityModal();
    });

    // Close modal on Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeActivityModal();
    });

    // Bind clickable rows
    document.querySelectorAll('[data-activity-item]').forEach(function(row) {
      row.addEventListener('click', function(e) {
        if (e.target.closest('form') || e.target.closest('button')) return;
        try {
          var item = JSON.parse(row.getAttribute('data-activity-item'));
          var activeTab = document.querySelector('[data-activity-tab].active');
          var tabName = activeTab ? activeTab.getAttribute('data-activity-tab') : 'events';
          var title = tabName === 'events' ? 'Event Detail' : tabName === 'tools' ? 'Tool Call Detail' : 'Journal Entry Detail';
          showActivityDetail(item, title);
        } catch(err) { console.error('Failed to parse activity item', err); }
      });
    });
    </script>`;
    })()}
  `;

  res.send(layout('agents', req.session.user, content, flash));
});

// ─── Agent Actions (Deploy, Stop, Restart) ──────────────────

router.post('/agents/:id/deploy', requireAuth, async (req, res) => {
  const result = await apiPost(`/engine/agents/${req.params.id}/deploy`, req.session.token, { by: 'dashboard' });
  if (result.status < 300) {
    req.session.flash = { message: 'Deploy initiated', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to deploy agent', type: 'danger' };
  }
  res.redirect(`/agents/${req.params.id}`);
});

router.post('/agents/:id/stop', requireAuth, async (req, res) => {
  const result = await apiPost(`/engine/agents/${req.params.id}/stop`, req.session.token, { by: 'dashboard' });
  if (result.status < 300) {
    req.session.flash = { message: 'Stop initiated', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to stop agent', type: 'danger' };
  }
  res.redirect(`/agents/${req.params.id}`);
});

router.post('/agents/:id/restart', requireAuth, async (req, res) => {
  const result = await apiPost(`/engine/agents/${req.params.id}/restart`, req.session.token, { by: 'dashboard' });
  if (result.status < 300) {
    req.session.flash = { message: 'Restart initiated', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to restart agent', type: 'danger' };
  }
  res.redirect(`/agents/${req.params.id}`);
});

// ─── Agent Tool Security ──────────────────────────────────

function splitComma(val) {
  if (!val || !val.trim()) return [];
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

router.post('/agents/:id/tool-security', requireAuth, async (req, res) => {
  const agentId = req.params.id;
  const payload = {
    toolSecurity: {
      security: {
        pathSandbox: {
          enabled: req.body.ps_enabled === 'on',
          allowedDirs: splitComma(req.body.ps_allowedDirs),
          blockedPatterns: splitComma(req.body.ps_blockedPatterns),
        },
        ssrf: {
          enabled: req.body.ssrf_enabled === 'on',
          allowedHosts: splitComma(req.body.ssrf_allowedHosts),
          blockedCidrs: splitComma(req.body.ssrf_blockedCidrs),
        },
        commandSanitizer: {
          enabled: req.body.cs_enabled === 'on',
          mode: req.body.cs_mode || 'blocklist',
          allowedCommands: splitComma(req.body.cs_allowedCommands),
          blockedPatterns: splitComma(req.body.cs_blockedPatterns),
        },
      },
      middleware: {
        audit: {
          enabled: req.body.audit_enabled === 'on',
          redactKeys: splitComma(req.body.audit_redactKeys),
        },
        rateLimit: {
          enabled: req.body.rl_enabled === 'on',
          overrides: {},
        },
        circuitBreaker: {
          enabled: req.body.cb_enabled === 'on',
        },
        telemetry: {
          enabled: req.body.tel_enabled === 'on',
        },
      },
    },
    updatedBy: 'dashboard',
  };

  const result = await apiPatch(`/engine/agents/${agentId}/tool-security`, req.session.token, payload);

  if (result.status < 300) {
    req.session.flash = { message: 'Agent tool security saved', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to save tool security', type: 'danger' };
  }
  res.redirect(`/agents/${agentId}`);
});

router.post('/agents/:id/tool-security/reset', requireAuth, async (req, res) => {
  const agentId = req.params.id;
  const result = await apiPatch(`/engine/agents/${agentId}/tool-security`, req.session.token, {
    toolSecurity: {},
    updatedBy: 'dashboard',
  });

  if (result.status < 300) {
    req.session.flash = { message: 'Tool security reset to org defaults', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to reset tool security', type: 'danger' };
  }
  res.redirect(`/agents/${agentId}`);
});

router.post('/agents/:id/journal/:journalId/rollback', requireAuth, async (req, res) => {
  const result = await apiPost(`/api/engine/journal/${req.params.journalId}/rollback`, req.session.token, {});
  if (result.status < 300 && result.body && result.body.success) {
    req.session.flash = { message: 'Action rolled back', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Rollback failed', type: 'danger' };
  }
  res.redirect(`/agents/${req.params.id}`);
});

// ─── Provider Models API Proxy ──────────────────────────────
router.get('/api/providers/:providerId/models', requireAuth, async (req, res) => {
  const result = await apiGet(`/api/providers/${req.params.providerId}/models`, req.session.token);
  res.json(result.body || { models: [] });
});

router.post('/agents', requireAuth, async (req, res) => {
  const agentBody = {
    name: req.body.name,
    description: req.body.description,
    model: req.body.model,
    provider: req.body.provider || 'anthropic',
    persona: {
      gender: req.body.gender || undefined,
      dateOfBirth: req.body.date_of_birth || undefined,
      maritalStatus: req.body.marital_status || undefined,
      culturalBackground: req.body.cultural_background || undefined,
      language: req.body.language || undefined,
      traits: {
        communication: req.body.trait_communication || 'direct',
        detail: req.body.trait_detail || 'detail-oriented',
        energy: req.body.trait_energy || 'calm',
        humor: req.body.humor || 'warm',
        formality: req.body.formality || 'adaptive',
        empathy: req.body.empathy || 'moderate',
        patience: req.body.patience || 'patient',
        creativity: req.body.creativity || 'creative',
      },
    },
  };
  if (req.body.soulId) {
    agentBody.soulId = req.body.soulId;
  }
  const result = await apiPost('/api/agents', req.session.token, agentBody);

  if (result.status < 300) {
    req.session.flash = { message: 'Agent created', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to create agent', type: 'danger' };
  }
  res.redirect('/agents');
});

router.post('/agents/:id/archive', requireAuth, async (req, res) => {
  const result = await apiPatch(`/api/agents/${req.params.id}`, req.session.token, {
    status: 'archived',
  });

  if (result.status < 300) {
    req.session.flash = { message: 'Agent archived', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to archive agent', type: 'danger' };
  }
  res.redirect('/agents');
});

module.exports = router;
