// Agents page — list, create modal, archive, detail view

import { api } from '../api.js';
import { esc } from '../utils/escape.js';
import { toast } from '../utils/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { renderTable } from '../components/table.js';

export function loadAgents() {
  var el = document.getElementById('page-content');
  el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px"><div><h2 class="page-title">Agents</h2><p class="page-desc" style="margin:0">Manage AI agent identities</p></div><button class="btn btn-primary" style="width:auto" id="btn-new-agent">+ New Agent</button></div><div class="card"><div class="page-desc">Loading...</div></div>';

  document.getElementById('btn-new-agent').onclick = function() {
    openModal('modal-agent');
  };

  api('/agents').then(function(d) {
    var agents = d.agents || [];
    if (agents.length === 0) {
      el.querySelector('.card').innerHTML = '<div class="empty"><div class="empty-icon">\ud83e\udd16</div>No agents yet. Create your first one!</div>';
      return;
    }
    var rows = agents.map(function(a) {
      return '<tr style="cursor:pointer" data-agent-row="' + esc(a.id) + '"><td style="font-weight:600;color:var(--primary)">' + esc(a.name) + '</td><td style="color:var(--text-dim)">' + esc(a.email) + '</td><td>' + esc(a.role) + '</td><td><span class="badge badge-' + a.status + '">' + a.status + '</span></td><td style="color:var(--text-muted);font-size:12px">' + new Date(a.createdAt).toLocaleDateString() + '</td><td>' + (a.status === 'active' ? '<button class="btn btn-sm btn-danger" data-archive-agent="' + a.id + '">Archive</button>' : '') + '</td></tr>';
    }).join('');
    el.querySelector('.card').innerHTML = renderTable(['Name', 'Email', 'Role', 'Status', 'Created', ''], rows);

    // Bind row clicks to open agent detail
    el.querySelectorAll('[data-agent-row]').forEach(function(row) {
      row.onclick = function(e) {
        // Don't navigate if the user clicked the archive button
        if (e.target.closest('[data-archive-agent]')) return;
        loadAgentDetail(row.getAttribute('data-agent-row'));
      };
    });

    // Bind archive buttons
    el.querySelectorAll('[data-archive-agent]').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        archiveAgent(btn.getAttribute('data-archive-agent'));
      };
    });
  });
}

// ─── Agent Detail View ──────────────────────────────────────

export function loadAgentDetail(agentId) {
  var el = document.getElementById('page-content');
  el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">Loading agent...</div>';

  Promise.all([
    api('/engine/bridge/agents/' + agentId + '/full').catch(function() { return null; }),
    api('/agents/' + agentId).catch(function() { return null; })
  ]).then(function(results) {
    var fullData = results[0];
    var adminData = results[1];

    if (!fullData && !adminData) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--danger)">Agent not found.</div>';
      return;
    }

    var engineAgent = fullData ? (fullData.agent || fullData) : {};
    var agent = adminData || {};
    var config = engineAgent.config || {};
    var identity = config.identity || {};
    var profile = fullData ? (fullData.permissions || null) : null;

    // Resolve display values (critical data rules)
    var displayName = identity.name || config.name || config.displayName || agent.name || 'Unnamed Agent';
    var displayEmail = identity.email || config.email || agent.email || '';
    var avatarInitial = (displayName || '?').charAt(0).toUpperCase();
    var agentRole = identity.role || config.role || agent.role || 'agent';
    var rawModel = config.model;
    var agentModel = typeof rawModel === 'string'
      ? rawModel
      : (rawModel ? (rawModel.modelId || rawModel.provider || 'unknown') : (agent.model || 'unknown'));
    var agentDesc = identity.description || config.description || agent.description || '';
    var createdAt = engineAgent.createdAt || engineAgent.created_at || agent.createdAt || agent.created_at || '';
    var agentState = engineAgent.state || engineAgent.status || agent.status || 'unknown';

    // State badge variant
    var stateMap = { running: 'success', active: 'success', deploying: 'warning', starting: 'warning', ready: 'primary', degraded: 'warning', error: 'danger', stopped: 'danger', draft: 'default', archived: 'danger' };
    var stateVariant = stateMap[agentState] || 'default';

    // Personality traits
    var rawTraits = identity.personality_traits || identity.traits || config.personality_traits || {};
    var traitsHtml = '';
    if (rawTraits && typeof rawTraits === 'object' && !Array.isArray(rawTraits) && Object.keys(rawTraits).length > 0) {
      traitsHtml = Object.entries(rawTraits).map(function(pair) {
        return '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;background:var(--bg);border:1px solid var(--border);font-size:12px;margin:3px">' +
          '<span style="color:var(--text-muted);text-transform:capitalize">' + esc(pair[0]) + ':</span>' +
          '<span style="font-weight:600;text-transform:capitalize">' + esc(String(pair[1])) + '</span></span>';
      }).join('');
    } else if (Array.isArray(rawTraits) && rawTraits.length > 0) {
      traitsHtml = rawTraits.map(function(t) {
        return '<span style="display:inline-block;padding:4px 10px;border-radius:6px;background:var(--bg);border:1px solid var(--border);font-size:12px;font-weight:600;text-transform:capitalize;margin:3px">' + esc(String(t)) + '</span>';
      }).join('');
    }

    // Personal details
    var gender = identity.gender || '';
    var dob = identity.dateOfBirth || '';
    var maritalStatus = identity.maritalStatus || '';
    var culturalBackground = identity.culturalBackground || '';
    var language = identity.language || '';
    var hasPersonalDetails = gender || dob || maritalStatus || culturalBackground || language;

    // Email display: don't show raw UUIDs
    var uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    var emailDisplay = displayEmail && !uuidRe.test(displayEmail) ? displayEmail : '';

    // Field helper
    var field = function(label, value) {
      return '<div style="margin-bottom:12px">' +
        '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">' + label + '</div>' +
        '<div style="font-size:14px;color:var(--text)">' + (value ? esc(value) : '<span style="color:var(--text-muted)">&mdash;</span>') + '</div></div>';
    };

    // Permission profile summary
    var permissionHtml = '';
    if (profile) {
      var profileName = profile.name || profile.preset || 'Custom';
      var maxRisk = profile.maxRiskLevel || profile.max_risk_level || 'medium';
      var sandboxMode = profile.sandboxMode || profile.sandbox_mode || false;
      var rateLimits = profile.rateLimits || profile.rate_limits || {};
      var callsPerMin = rateLimits.toolCallsPerMinute || rateLimits.callsPerMinute || rateLimits.calls_per_minute || 0;
      var callsPerHr = rateLimits.toolCallsPerHour || rateLimits.callsPerHour || rateLimits.calls_per_hour || 0;
      var blockedSideEffects = profile.blockedSideEffects || profile.blocked_side_effects || [];

      var riskVariant = maxRisk === 'low' ? 'success' : (maxRisk === 'high' || maxRisk === 'critical') ? 'danger' : 'warning';
      var rateStr = '';
      if (callsPerMin) rateStr += callsPerMin + '/min';
      if (callsPerMin && callsPerHr) rateStr += ', ';
      if (callsPerHr) rateStr += callsPerHr + '/hr';
      if (!rateStr) rateStr = 'None set';

      permissionHtml = '<div class="card" style="margin-bottom:20px"><h3>Permission Profile</h3>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
        '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Profile</div><div style="font-size:14px;font-weight:600">' + esc(profileName) + '</div></div>' +
        '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Max Risk Level</div><div><span class="badge badge-' + riskVariant + '">' + esc(maxRisk) + '</span></div></div>' +
        '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Sandbox Mode</div><div style="font-size:14px;font-weight:600">' + (sandboxMode ? 'Enabled' : 'Disabled') + '</div></div>' +
        '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Rate Limits</div><div style="font-size:13px">' + esc(rateStr) + '</div></div>' +
        '</div>' +
        (blockedSideEffects.length > 0 ? '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)"><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Blocked Side Effects</div><div>' + blockedSideEffects.map(function(s) { return '<span class="badge badge-danger" style="margin:2px">' + esc(s) + '</span>'; }).join('') + '</div></div>' : '') +
        '</div>';
    }

    // Build page
    var html =
      // Back link
      '<div style="margin-bottom:20px"><a href="#" id="back-to-agents" style="font-size:13px;color:var(--primary);display:inline-flex;align-items:center;gap:4px">&larr; Back to Agents</a></div>' +

      // Agent Header
      '<div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">' +
        '<div style="width:52px;height:52px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;flex-shrink:0">' + esc(avatarInitial) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
            '<h2 style="font-size:22px;font-weight:700;margin:0">' + esc(displayName) + '</h2>' +
            '<span class="badge badge-' + stateVariant + '">' + esc(agentState) + '</span>' +
            '<span class="badge badge-primary" style="text-transform:capitalize">' + esc(agentRole) + '</span>' +
          '</div>' +
          (emailDisplay ? '<div style="margin-top:4px;font-family:monospace;font-size:13px;color:var(--text-muted)">' + esc(emailDisplay) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0">' +
          '<button class="btn btn-primary btn-sm" id="btn-deploy-agent">Deploy</button>' +
          '<button class="btn btn-danger btn-sm" id="btn-stop-agent">Stop</button>' +
          '<button class="btn btn-sm" id="btn-restart-agent">Restart</button>' +
        '</div>' +
      '</div>' +

      // Summary Card
      '<div class="card" style="margin-bottom:20px">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:16px">' +
          '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;font-weight:600">Status</div><span class="badge badge-' + stateVariant + '">' + esc(agentState) + '</span></div>' +
          '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;font-weight:600">Role</div><span style="font-size:13px;font-weight:500;text-transform:capitalize">' + esc(agentRole) + '</span></div>' +
          '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;font-weight:600">Model</div><code style="font-size:13px">' + esc(agentModel) + '</code></div>' +
          '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;font-weight:600">Created</div><span style="font-size:13px;font-weight:500">' + (createdAt ? new Date(createdAt).toLocaleDateString() : '&mdash;') + '</span></div>' +
        '</div>' +
        (agentDesc ? '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);font-size:13px;color:var(--text-dim);line-height:1.6">' + esc(agentDesc) + '</div>' : '') +
        (traitsHtml ? '<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:4px">' + traitsHtml + '</div>' : '') +
      '</div>' +

      // Personal Details
      (hasPersonalDetails ? '<div class="card" style="margin-bottom:20px"><h3>Personal Details</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px">' +
        field('Gender', gender) +
        field('Date of Birth', dob) +
        field('Marital Status', maritalStatus) +
        field('Cultural Background', culturalBackground) +
        field('Language', language) +
      '</div></div>' : '') +

      // Permission Profile
      permissionHtml +

      // Tool Security
      '<div class="card" style="margin-bottom:20px" id="tool-security-section">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
          '<div><h3 style="margin:0">Tool Security</h3>' +
          '<p style="margin:4px 0 0;font-size:13px;color:var(--text-dim)">Per-agent overrides. Unmodified settings inherit from org defaults.</p></div>' +
          '<div style="display:flex;gap:6px">' +
            '<button class="btn btn-sm" id="btn-reset-tool-security" style="display:none">Reset to Org Defaults</button>' +
          '</div>' +
        '</div>' +
        '<div id="tool-security-body"><div style="padding:20px;text-align:center;color:var(--text-muted)">Loading...</div></div>' +
      '</div>' +

      // Activity Section
      '<div class="card" style="margin-top:20px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)">' +
          '<h3 style="margin:0;font-size:15px;font-weight:600">Activity</h3>' +
          '<button class="btn btn-ghost btn-sm" id="btn-refresh-activity">&#8635; Refresh</button>' +
        '</div>' +
        '<div style="border-bottom:1px solid var(--border)">' +
          '<div class="tabs" style="padding:0 16px">' +
            '<div class="tab active" data-activity-tab="events">Events</div>' +
            '<div class="tab" data-activity-tab="tools">Tool Calls</div>' +
            '<div class="tab" data-activity-tab="journal">Journal</div>' +
          '</div>' +
        '</div>' +
        '<div>' +
          '<div id="activity-tab-events"><div style="padding:40px;text-align:center;color:var(--text-muted)">Loading...</div></div>' +
          '<div id="activity-tab-tools" style="display:none"><div style="padding:40px;text-align:center;color:var(--text-muted)">Loading...</div></div>' +
          '<div id="activity-tab-journal" style="display:none"><div style="padding:40px;text-align:center;color:var(--text-muted)">Loading...</div></div>' +
        '</div>' +
      '</div>' +

      // Activity Detail Modal
      '<div id="activity-detail-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center">' +
        '<div style="background:var(--card-bg,#fff);border-radius:12px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)">' +
            '<h2 style="margin:0;font-size:16px;font-weight:600" id="activity-modal-title">Detail</h2>' +
            '<button class="btn btn-ghost btn-sm" id="btn-close-activity-modal" style="font-size:18px;line-height:1;padding:4px 8px">&times;</button>' +
          '</div>' +
          '<div style="padding:20px" id="activity-modal-body"></div>' +
        '</div>' +
      '</div>';

    el.innerHTML = html;

    // Bind back link
    document.getElementById('back-to-agents').onclick = function(e) {
      e.preventDefault();
      loadAgents();
    };

    // Bind action buttons
    document.getElementById('btn-deploy-agent').onclick = function() {
      agentAction(agentId, 'deploy');
    };
    document.getElementById('btn-stop-agent').onclick = function() {
      agentAction(agentId, 'stop');
    };
    document.getElementById('btn-restart-agent').onclick = function() {
      agentAction(agentId, 'restart');
    };

    // ─── Activity Section Logic ──────────────────────────────
    var activityActiveTab = 'events';

    // Tab switching
    el.querySelectorAll('[data-activity-tab]').forEach(function(tabEl) {
      tabEl.onclick = function() {
        activityActiveTab = tabEl.getAttribute('data-activity-tab');
        el.querySelectorAll('[data-activity-tab]').forEach(function(t) {
          t.classList.toggle('active', t.getAttribute('data-activity-tab') === activityActiveTab);
        });
        var panels = ['events', 'tools', 'journal'];
        panels.forEach(function(p) {
          var panel = document.getElementById('activity-tab-' + p);
          if (panel) panel.style.display = p === activityActiveTab ? '' : 'none';
        });
      };
    });

    // Modal helpers
    function escHtml(s) {
      var d = document.createElement('div');
      d.textContent = String(s);
      return d.innerHTML;
    }

    function humanizeKey(key) {
      return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
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
          return entries.map(function(e) { return '<span style="font-size:12px;font-family:monospace;background:var(--bg-secondary,#f5f5f5);padding:2px 6px;border-radius:4px;margin:2px">' + escHtml(e[0]) + ': ' + escHtml(String(e[1] == null ? '\u2014' : e[1])) + '</span>'; }).join(' ');
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
      var modal = document.getElementById('activity-detail-modal');
      if (modal) modal.style.display = 'none';
    }

    // Modal close handlers
    document.getElementById('btn-close-activity-modal').onclick = closeActivityModal;
    document.getElementById('activity-detail-modal').onclick = function(e) {
      if (e.target === this) closeActivityModal();
    };
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeActivityModal();
    });

    // Bind clickable rows in a panel
    function bindActivityRows(panelId, titleText) {
      var panel = document.getElementById(panelId);
      if (!panel) return;
      panel.querySelectorAll('[data-activity-item]').forEach(function(row) {
        row.onclick = function(e) {
          if (e.target.closest('button')) return;
          try {
            var item = JSON.parse(row.getAttribute('data-activity-item'));
            showActivityDetail(item, titleText);
          } catch(err) { /* ignore parse errors */ }
        };
      });
    }

    // Rollback handler
    function rollbackJournal(journalId) {
      if (!confirm('Rollback this journal entry? This will attempt to reverse the original action.')) return;
      api('/engine/journal/' + journalId + '/rollback', { method: 'POST', body: {} })
        .then(function(r) {
          if (r.success) {
            toast('Action rolled back', 'success');
            loadJournal();
          } else {
            toast('Rollback failed: ' + (r.error || 'Unknown'), 'error');
          }
        })
        .catch(function(e) { toast(e.message, 'error'); });
    }

    // Load events
    function loadEvents() {
      var panel = document.getElementById('activity-tab-events');
      api('/engine/activity/events?agentId=' + agentId + '&limit=50')
        .then(function(d) {
          var events = d.events || [];
          if (events.length === 0) {
            panel.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">No events recorded for this agent</div>';
            return;
          }
          var rows = events.map(function(ev, i) {
            var details = typeof ev.data === 'object' ? JSON.stringify(ev.data) : (ev.details || ev.data || '-');
            var detailsStr = typeof details === 'string' ? details : JSON.stringify(details);
            return '<tr style="cursor:pointer" data-activity-item=\'' + esc(JSON.stringify(ev)).replace(/'/g, '&#39;') + '\'>' +
              '<td style="font-size:12px;color:var(--text-muted);white-space:nowrap">' + (ev.timestamp || ev.createdAt ? new Date(ev.timestamp || ev.createdAt).toLocaleString() : '-') + '</td>' +
              '<td><span class="badge badge-info">' + esc(ev.type || ev.eventType || '-') + '</span></td>' +
              '<td style="font-family:monospace;font-size:12px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted)">' + esc(detailsStr.substring(0, 200)) + '</td>' +
            '</tr>';
          }).join('');
          panel.innerHTML = '<table class="data-table"><thead><tr><th>Time</th><th>Type</th><th>Details</th></tr></thead><tbody>' + rows + '</tbody></table>';
          bindActivityRows('activity-tab-events', 'Event Detail');
        })
        .catch(function() {
          panel.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">Failed to load events</div>';
        });
    }

    // Load tool calls
    function loadToolCalls() {
      var panel = document.getElementById('activity-tab-tools');
      api('/engine/activity/tool-calls?agentId=' + agentId + '&limit=50')
        .then(function(d) {
          var toolCalls = d.toolCalls || [];
          if (toolCalls.length === 0) {
            panel.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">No tool calls recorded for this agent</div>';
            return;
          }
          var rows = toolCalls.map(function(tc, i) {
            var statusClass = tc.success === true ? 'badge badge-success' : tc.success === false ? 'badge badge-danger' : 'badge badge-default';
            var statusLabel = tc.success === true ? 'OK' : tc.success === false ? 'Failed' : (tc.status || 'Pending');
            return '<tr style="cursor:pointer" data-activity-item=\'' + esc(JSON.stringify(tc)).replace(/'/g, '&#39;') + '\'>' +
              '<td style="font-size:12px;color:var(--text-muted);white-space:nowrap">' + (tc.timestamp || tc.createdAt ? new Date(tc.timestamp || tc.createdAt).toLocaleString() : '-') + '</td>' +
              '<td><span style="font-family:monospace;font-size:12px">' + esc(tc.tool || tc.toolName || '-') + '</span></td>' +
              '<td>' + (tc.durationMs ? esc(String(tc.durationMs)) + 'ms' : '-') + '</td>' +
              '<td><span class="' + statusClass + '">' + esc(statusLabel) + '</span></td>' +
            '</tr>';
          }).join('');
          panel.innerHTML = '<table class="data-table"><thead><tr><th>Time</th><th>Tool</th><th>Duration</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>';
          bindActivityRows('activity-tab-tools', 'Tool Call Detail');
        })
        .catch(function() {
          panel.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">Failed to load tool calls</div>';
        });
    }

    // Load journal
    function loadJournal() {
      var panel = document.getElementById('activity-tab-journal');
      api('/engine/journal?agentId=' + agentId + '&orgId=default&limit=50')
        .then(function(d) {
          var entries = d.entries || [];
          if (entries.length === 0) {
            panel.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">No journal entries for this agent</div>';
            return;
          }
          var rows = entries.map(function(e) {
            var rollbackBtn = e.reversible && !e.reversed
              ? '<button class="btn btn-ghost btn-sm" data-rollback-id="' + esc(e.id) + '">&#8630; Rollback</button>'
              : '';
            return '<tr style="cursor:pointer" data-activity-item=\'' + esc(JSON.stringify(e)).replace(/'/g, '&#39;') + '\'>' +
              '<td style="font-size:12px;color:var(--text-muted);white-space:nowrap">' + (e.createdAt ? new Date(e.createdAt).toLocaleString() : '-') + '</td>' +
              '<td>' + esc(e.toolName || e.toolId || '-') + '</td>' +
              '<td><span class="badge badge-default">' + esc(e.actionType || '-') + '</span></td>' +
              '<td>' + (e.reversible ? '&#9989;' : '&#10060;') + '</td>' +
              '<td>' + (e.reversed ? '<span class="badge badge-warning">Rolled Back</span>' : '<span class="badge badge-success">Active</span>') + '</td>' +
              '<td>' + rollbackBtn + '</td>' +
            '</tr>';
          }).join('');
          panel.innerHTML = '<table class="data-table"><thead><tr><th>Time</th><th>Tool</th><th>Action Type</th><th>Reversible</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table>';
          bindActivityRows('activity-tab-journal', 'Journal Entry Detail');

          // Bind rollback buttons
          panel.querySelectorAll('[data-rollback-id]').forEach(function(btn) {
            btn.onclick = function(e) {
              e.stopPropagation();
              rollbackJournal(btn.getAttribute('data-rollback-id'));
            };
          });
        })
        .catch(function() {
          panel.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">Failed to load journal entries</div>';
        });
    }

    // Load all activity data
    function loadAllActivity() {
      loadEvents();
      loadToolCalls();
      loadJournal();
    }

    // Refresh button
    document.getElementById('btn-refresh-activity').onclick = function() {
      if (activityActiveTab === 'events') loadEvents();
      else if (activityActiveTab === 'tools') loadToolCalls();
      else if (activityActiveTab === 'journal') loadJournal();
    };

    // ─── Tool Security Section ──────────────────────────────

    function splitCommaTs(val) {
      if (!val || !val.trim()) return [];
      return val.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    }

    function loadToolSecurity() {
      var tsBody = document.getElementById('tool-security-body');
      if (!tsBody) return;

      api('/engine/agents/' + agentId + '/tool-security')
        .then(function(d) {
          var merged = d.toolSecurity || {};
          var orgDefaults = d.orgDefaults || {};
          var agentOverrides = d.agentOverrides || {};
          var secObj = merged.security || {};
          var mwObj = merged.middleware || {};
          var tsPs = secObj.pathSandbox || {};
          var tsSsrf = secObj.ssrf || {};
          var tsCs = secObj.commandSanitizer || {};
          var tsAudit = mwObj.audit || {};
          var tsRl = mwObj.rateLimit || {};
          var tsCb = mwObj.circuitBreaker || {};
          var tsTel = mwObj.telemetry || {};
          var hasOverrides = Object.keys(agentOverrides).length > 0;

          // Show reset button if overrides exist
          var resetBtn = document.getElementById('btn-reset-tool-security');
          if (resetBtn) resetBtn.style.display = hasOverrides ? '' : 'none';

          tsBody.innerHTML =
            '<div style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:8px 0 10px">Security Sandboxes</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">' +

              // Path Sandbox
              '<div style="border:1px solid var(--border);border-radius:8px;padding:14px">' +
                '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Path Sandbox</div>' +
                '<div class="form-group" style="margin-bottom:6px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                  '<input type="checkbox" id="ats-ps-enabled"' + (tsPs.enabled !== false ? ' checked' : '') + '>' +
                  '<span style="font-size:13px">Enable</span></label></div>' +
                '<div class="form-group" style="margin-bottom:6px"><label class="form-label" style="font-size:11px">Allowed Dirs (comma-separated)</label>' +
                  '<input class="input" id="ats-ps-allowedDirs" value="' + esc((tsPs.allowedDirs || []).join(', ')) + '" placeholder="/path/to/allow" style="font-family:monospace;font-size:12px"></div>' +
                '<div class="form-group"><label class="form-label" style="font-size:11px">Blocked Patterns (comma-separated)</label>' +
                  '<input class="input" id="ats-ps-blockedPatterns" value="' + esc((tsPs.blockedPatterns || []).join(', ')) + '" placeholder="\\.env$" style="font-family:monospace;font-size:12px"></div>' +
              '</div>' +

              // SSRF Protection
              '<div style="border:1px solid var(--border);border-radius:8px;padding:14px">' +
                '<div style="font-size:14px;font-weight:600;margin-bottom:4px">SSRF Protection</div>' +
                '<div class="form-group" style="margin-bottom:6px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                  '<input type="checkbox" id="ats-ssrf-enabled"' + (tsSsrf.enabled !== false ? ' checked' : '') + '>' +
                  '<span style="font-size:13px">Enable</span></label></div>' +
                '<div class="form-group" style="margin-bottom:6px"><label class="form-label" style="font-size:11px">Allowed Hosts (comma-separated)</label>' +
                  '<input class="input" id="ats-ssrf-allowedHosts" value="' + esc((tsSsrf.allowedHosts || []).join(', ')) + '" placeholder="api.example.com" style="font-family:monospace;font-size:12px"></div>' +
                '<div class="form-group"><label class="form-label" style="font-size:11px">Blocked CIDRs (comma-separated)</label>' +
                  '<input class="input" id="ats-ssrf-blockedCidrs" value="' + esc((tsSsrf.blockedCidrs || []).join(', ')) + '" placeholder="10.0.0.0/8" style="font-family:monospace;font-size:12px"></div>' +
              '</div>' +
            '</div>' +

            // Command Sanitizer
            '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">' +
              '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Command Sanitizer</div>' +
              '<div class="form-group" style="margin-bottom:6px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                '<input type="checkbox" id="ats-cs-enabled"' + (tsCs.enabled !== false ? ' checked' : '') + '>' +
                '<span style="font-size:13px">Enable</span></label></div>' +
              '<div class="form-group" style="margin-bottom:6px"><label class="form-label" style="font-size:11px">Mode</label>' +
                '<select class="input" id="ats-cs-mode" style="width:250px">' +
                  '<option value="blocklist"' + ((tsCs.mode || 'blocklist') === 'blocklist' ? ' selected' : '') + '>Blocklist</option>' +
                  '<option value="allowlist"' + (tsCs.mode === 'allowlist' ? ' selected' : '') + '>Allowlist</option>' +
                '</select></div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">' +
                '<div class="form-group"><label class="form-label" style="font-size:11px">Allowed Commands (comma-separated)</label>' +
                  '<input class="input" id="ats-cs-allowedCommands" value="' + esc((tsCs.allowedCommands || []).join(', ')) + '" placeholder="git, npm, node" style="font-family:monospace;font-size:12px"></div>' +
                '<div class="form-group"><label class="form-label" style="font-size:11px">Blocked Patterns (comma-separated)</label>' +
                  '<input class="input" id="ats-cs-blockedPatterns" value="' + esc((tsCs.blockedPatterns || []).join(', ')) + '" placeholder="curl.*\\|.*sh" style="font-family:monospace;font-size:12px"></div>' +
              '</div>' +
            '</div>' +

            '<div style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:12px 0 10px">Middleware &amp; Observability</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">' +
              // Audit
              '<div style="border:1px solid var(--border);border-radius:8px;padding:14px">' +
                '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Audit Logging</div>' +
                '<div class="form-group" style="margin-bottom:6px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                  '<input type="checkbox" id="ats-audit-enabled"' + (tsAudit.enabled !== false ? ' checked' : '') + '>' +
                  '<span style="font-size:13px">Enable</span></label></div>' +
                '<div class="form-group"><label class="form-label" style="font-size:11px">Keys to Redact (comma-separated)</label>' +
                  '<input class="input" id="ats-audit-redactKeys" value="' + esc((tsAudit.redactKeys || []).join(', ')) + '" placeholder="custom_secret" style="font-family:monospace;font-size:12px"></div>' +
              '</div>' +

              // Rate Limiting
              '<div style="border:1px solid var(--border);border-radius:8px;padding:14px">' +
                '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Rate Limiting</div>' +
                '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                  '<input type="checkbox" id="ats-rl-enabled"' + (tsRl.enabled !== false ? ' checked' : '') + '>' +
                  '<span style="font-size:13px">Enable</span></label></div>' +
              '</div>' +

              // Circuit Breaker
              '<div style="border:1px solid var(--border);border-radius:8px;padding:14px">' +
                '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Circuit Breaker</div>' +
                '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                  '<input type="checkbox" id="ats-cb-enabled"' + (tsCb.enabled !== false ? ' checked' : '') + '>' +
                  '<span style="font-size:13px">Enable</span></label></div>' +
              '</div>' +

              // Telemetry
              '<div style="border:1px solid var(--border);border-radius:8px;padding:14px">' +
                '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Telemetry</div>' +
                '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                  '<input type="checkbox" id="ats-tel-enabled"' + (tsTel.enabled !== false ? ' checked' : '') + '>' +
                  '<span style="font-size:13px">Enable</span></label></div>' +
              '</div>' +
            '</div>' +

            '<button class="btn btn-primary" style="width:auto" id="btn-save-agent-tool-security">Save Tool Security Overrides</button>';

          // Bind save button
          var saveBtn = document.getElementById('btn-save-agent-tool-security');
          if (saveBtn) {
            saveBtn.onclick = function() { saveAgentToolSecurity(agentId); };
          }
        })
        .catch(function() {
          tsBody.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">Failed to load tool security config</div>';
        });
    }

    function saveAgentToolSecurity(aid) {
      var payload = {
        toolSecurity: {
          security: {
            pathSandbox: {
              enabled: document.getElementById('ats-ps-enabled').checked,
              allowedDirs: splitCommaTs(document.getElementById('ats-ps-allowedDirs').value),
              blockedPatterns: splitCommaTs(document.getElementById('ats-ps-blockedPatterns').value),
            },
            ssrf: {
              enabled: document.getElementById('ats-ssrf-enabled').checked,
              allowedHosts: splitCommaTs(document.getElementById('ats-ssrf-allowedHosts').value),
              blockedCidrs: splitCommaTs(document.getElementById('ats-ssrf-blockedCidrs').value),
            },
            commandSanitizer: {
              enabled: document.getElementById('ats-cs-enabled').checked,
              mode: document.getElementById('ats-cs-mode').value || 'blocklist',
              allowedCommands: splitCommaTs(document.getElementById('ats-cs-allowedCommands').value),
              blockedPatterns: splitCommaTs(document.getElementById('ats-cs-blockedPatterns').value),
            },
          },
          middleware: {
            audit: {
              enabled: document.getElementById('ats-audit-enabled').checked,
              redactKeys: splitCommaTs(document.getElementById('ats-audit-redactKeys').value),
            },
            rateLimit: {
              enabled: document.getElementById('ats-rl-enabled').checked,
              overrides: {},
            },
            circuitBreaker: {
              enabled: document.getElementById('ats-cb-enabled').checked,
            },
            telemetry: {
              enabled: document.getElementById('ats-tel-enabled').checked,
            },
          },
        },
        updatedBy: 'dashboard',
      };
      api('/engine/agents/' + aid + '/tool-security', { method: 'PATCH', body: payload })
        .then(function() {
          toast('Agent tool security saved', 'success');
          loadToolSecurity();
        })
        .catch(function(err) { toast(err.message, 'error'); });
    }

    function resetAgentToolSecurity(aid) {
      if (!confirm('Reset all tool security overrides to org defaults?')) return;
      api('/engine/agents/' + aid + '/tool-security', { method: 'PATCH', body: { toolSecurity: {}, updatedBy: 'dashboard' } })
        .then(function() {
          toast('Reset to org defaults', 'success');
          loadToolSecurity();
        })
        .catch(function(err) { toast(err.message, 'error'); });
    }

    // Bind reset button
    var resetTsBtn = document.getElementById('btn-reset-tool-security');
    if (resetTsBtn) {
      resetTsBtn.onclick = function() { resetAgentToolSecurity(agentId); };
    }

    // Initial load
    loadAllActivity();
    loadToolSecurity();
  });
}

function agentAction(agentId, action) {
  api('/engine/agents/' + agentId + '/' + action, { method: 'POST', body: { by: 'dashboard' } })
    .then(function() { toast(action.charAt(0).toUpperCase() + action.slice(1) + ' initiated', 'success'); loadAgentDetail(agentId); })
    .catch(function(err) { toast(err.message, 'error'); });
}

function archiveAgent(id) {
  api('/agents/' + id + '/archive', { method: 'POST' })
    .then(function() { toast('Agent archived', 'success'); loadAgents(); })
    .catch(function(err) { toast(err.message, 'error'); });
}

export function initAgentModal() {
  var form = document.querySelector('#modal-agent form');
  if (form) {
    form.onsubmit = function(e) {
      createAgent(e);
    };
  }
  var cancelBtn = document.querySelector('#modal-agent .btn[type="button"]');
  if (cancelBtn) {
    cancelBtn.onclick = function() {
      closeModal('modal-agent');
    };
  }

  // Dynamic model loading when provider changes
  var providerSelect = document.getElementById('agent-provider');
  var modelSelect = document.getElementById('agent-model');
  var modelInput = document.getElementById('agent-model-input');
  if (providerSelect && modelSelect) {
    providerSelect.addEventListener('change', function() {
      fetchProviderModels(providerSelect.value, modelSelect, modelInput);
    });
    // Load models for the default selected provider on init
    if (providerSelect.value) {
      fetchProviderModels(providerSelect.value, modelSelect, modelInput);
    }
  }
}

function fetchProviderModels(providerId, modelSelect, modelInput) {
  if (!providerId) {
    modelSelect.innerHTML = '<option value="">-- Select a provider first --</option>';
    modelSelect.style.display = '';
    if (modelInput) { modelInput.style.display = 'none'; modelInput.value = ''; }
    return;
  }
  modelSelect.innerHTML = '<option value="">Loading models...</option>';
  modelSelect.style.display = '';
  if (modelInput) { modelInput.style.display = 'none'; }

  api('/providers/' + encodeURIComponent(providerId) + '/models')
    .then(function(data) {
      var models = data.models || data || [];
      if (!Array.isArray(models) || models.length === 0) {
        modelSelect.style.display = 'none';
        if (modelInput) {
          modelInput.style.display = '';
          modelInput.value = '';
          modelInput.placeholder = 'Type a model ID (e.g. gpt-4o)';
        }
        return;
      }
      var html = '';
      models.forEach(function(m) {
        var id = typeof m === 'string' ? m : (m.id || m.modelId || '');
        var label = typeof m === 'string' ? m : (m.name || m.label || id);
        if (id) {
          html += '<option value="' + id.replace(/"/g, '&quot;') + '">' + label + '</option>';
        }
      });
      if (!html) {
        modelSelect.style.display = 'none';
        if (modelInput) {
          modelInput.style.display = '';
          modelInput.placeholder = 'Type a model ID (e.g. gpt-4o)';
        }
        return;
      }
      modelSelect.innerHTML = html;
      modelSelect.style.display = '';
      if (modelInput) { modelInput.style.display = 'none'; }
    })
    .catch(function() {
      modelSelect.style.display = 'none';
      if (modelInput) {
        modelInput.style.display = '';
        modelInput.placeholder = 'Type a model ID (e.g. gpt-4o)';
      }
    });
}

function createAgent(e) {
  e.preventDefault();
  var soulId = document.getElementById('agent-soul-id').value || undefined;
  var modelSelect = document.getElementById('agent-model');
  var modelInput = document.getElementById('agent-model-input');
  var modelValue = (modelSelect && modelSelect.style.display !== 'none') ? modelSelect.value : (modelInput ? modelInput.value : '');
  var body = {
    name: document.getElementById('agent-name').value,
    email: document.getElementById('agent-email').value || undefined,
    provider: document.getElementById('agent-provider').value || 'anthropic',
    model: modelValue || undefined,
    role: document.getElementById('agent-role').value,
    persona: {
      dateOfBirth: document.getElementById('agent-date-of-birth').value || undefined,
      gender: document.getElementById('agent-gender').value || undefined,
      maritalStatus: document.getElementById('agent-marital-status').value || undefined,
      culturalBackground: document.getElementById('agent-cultural-background').value || undefined,
      language: document.getElementById('agent-language').value || undefined,
      traits: {
        communication: document.getElementById('agent-trait-communication').value || 'direct',
        detail: document.getElementById('agent-trait-detail').value || 'detail-oriented',
        energy: document.getElementById('agent-trait-energy').value || 'calm',
        humor: document.getElementById('agent-humor')?.value || 'warm',
        formality: document.getElementById('agent-formality')?.value || 'adaptive',
        empathy: document.getElementById('agent-empathy')?.value || 'moderate',
        patience: document.getElementById('agent-patience')?.value || 'patient',
        creativity: document.getElementById('agent-creativity')?.value || 'creative',
      },
    },
  };
  if (soulId) { body.soulId = soulId; }
  api('/agents', {
    method: 'POST',
    body: body,
  })
    .then(function() {
      toast('Agent created!', 'success');
      closeModal('modal-agent');
      loadAgents();
    })
    .catch(function(err) { toast(err.message, 'error'); });
}
