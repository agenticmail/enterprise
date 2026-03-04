import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { Badge, EmptyState, riskBadgeClass } from './shared.js?v=4';
import { HelpButton } from '../../components/help-button.js';

// ════════════════════════════════════════════════════════════
// PERMISSIONS SECTION
// ════════════════════════════════════════════════════════════

var ALL_SIDE_EFFECTS = ['sends-email', 'sends-message', 'sends-sms', 'posts-social', 'runs-code', 'modifies-files', 'deletes-data', 'controls-device', 'financial'];
var ALL_RISK_LEVELS = ['low', 'medium', 'high', 'critical'];

export function PermissionsSection(props) {
  var initialProfile = props.profile;
  var agentId = props.agentId;
  var engineAgent = props.engineAgent || {};
  var clientOrgId = engineAgent.client_org_id;
  var reload = props.reload;

  var app = useApp();
  var toast = app.toast;

  var _policies = useState([]);
  var policies = _policies[0]; var setPolicies = _policies[1];
  var _presets = useState([]);
  var presets = _presets[0]; var setPresets = _presets[1];
  var _soulCategories = useState({});
  var soulCategories = _soulCategories[0]; var setSoulCategories = _soulCategories[1];
  var _soulMeta = useState({});
  var soulMeta = _soulMeta[0]; var setSoulMeta = _soulMeta[1];
  var _soulSearch = useState('');
  var soulSearch = _soulSearch[0]; var setSoulSearch = _soulSearch[1];
  var _soulOpen = useState(false);
  var soulOpen = _soulOpen[0]; var setSoulOpen = _soulOpen[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _profile = useState(initialProfile);
  var profile = _profile[0]; var setProfile = _profile[1];
  var _editing = useState(false);
  var editing = _editing[0]; var setEditing = _editing[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];
  var _form = useState({});
  var form = _form[0]; var setForm = _form[1];
  var _applyingSoul = useState(null);
  var applyingSoul = _applyingSoul[0]; var setApplyingSoul = _applyingSoul[1];
  var _previewTpl = useState(null);
  var previewTpl = _previewTpl[0]; var setPreviewTpl = _previewTpl[1];
  var _confirmStep = useState(0); // 0=preview, 1=impact, 2=type-confirm, 3=applying
  var confirmStep = _confirmStep[0]; var setConfirmStep = _confirmStep[1];
  var _confirmText = useState('');
  var confirmText = _confirmText[0]; var setConfirmText = _confirmText[1];
  var _orgName = useState(null);
  var orgName = _orgName[0]; var setOrgName = _orgName[1];

  // Sync when parent passes new profile
  useEffect(function() { setProfile(initialProfile); }, [initialProfile]);

  // Fetch org name if agent belongs to a client org
  useEffect(function() {
    if (!clientOrgId) return;
    apiCall('/admin/client-orgs/' + clientOrgId).then(function(org) {
      setOrgName(org.name || org.org_name || 'Organization');
    }).catch(function() {});
  }, [clientOrgId]);

  // Load policies + presets + soul templates
  useEffect(function() {
    setLoading(true);
    Promise.all([
      engineCall('/policies/agent/' + agentId + '?orgId=' + getOrgId()).catch(function() { return { policies: [] }; }),
      engineCall('/profiles/presets').catch(function() { return { presets: [] }; }),
      engineCall('/souls/by-category').catch(function() { return { categories: {}, categoryMeta: {} }; })
    ]).then(function(results) {
      setPolicies(results[0].policies || results[0] || []);
      setPresets(results[1].presets || results[1] || []);
      setSoulCategories(results[2].categories || {});
      setSoulMeta(results[2].categoryMeta || {});
      setLoading(false);
    });
  }, [agentId]);

  // ─── Apply Preset ──────────────────────────────────────

  var applyPreset = function(presetName) {
    setSaving(true);
    engineCall('/profiles/' + agentId + '/apply-preset', {
      method: 'POST',
      body: JSON.stringify({ presetName: presetName })
    }).then(function(res) {
      toast('Preset "' + presetName + '" applied', 'success');
      setProfile(res.profile || res);
      setSaving(false);
      setEditing(false);
      reload();
    }).catch(function(err) {
      toast('Failed: ' + err.message, 'error');
      setSaving(false);
    });
  };

  // ─── Apply Soul Template ────────────────────────────────

  // ─── Role Preview & Confirmation Flow ────────────────────
  var openRolePreview = function(tpl) {
    setPreviewTpl(tpl);
    setConfirmStep(0);
    setConfirmText('');
  };

  var closeRolePreview = function() {
    setPreviewTpl(null);
    setConfirmStep(0);
    setConfirmText('');
  };

  var currentRole = (engineAgent.config && engineAgent.config.identity && engineAgent.config.identity.role) || engineAgent.role || 'Unknown';
  var isRunning = props.engineAgent && (props.engineAgent.state === 'running' || props.engineAgent.state === 'active');

  var executeRoleChange = function(tpl) {
    setConfirmStep(3);
    setApplyingSoul(tpl.id);

    var newRole = tpl.identity && tpl.identity.role || tpl.name || 'agent';

    // 1. Update agent config with role, personality, description from soul
    var configUpdates = {
      identity: {
        role: newRole,
        personality: tpl.personality || '',
        description: tpl.description || '',
      },
      description: tpl.description || '',
      // Store role transition history
      roleTransition: {
        previousRole: currentRole,
        newRole: newRole,
        transitionedAt: new Date().toISOString(),
        transitionedBy: 'dashboard',
        templateId: tpl.id,
        templateName: tpl.name,
      },
    };

    var configEndpoint = isRunning ? '/agents/' + agentId + '/hot-update' : '/agents/' + agentId + '/config';
    var configMethod = isRunning ? 'POST' : 'PATCH';

    // 2. Apply permission preset if soul suggests one
    var presetName = tpl.suggestedPreset || null;

    Promise.all([
      engineCall(configEndpoint, {
        method: configMethod,
        body: JSON.stringify({ updates: configUpdates, updatedBy: 'dashboard' })
      }).catch(function(err) { return { error: err.message }; }),
      presetName
        ? engineCall('/profiles/' + agentId + '/apply-preset', {
            method: 'POST',
            body: JSON.stringify({ presetName: presetName })
          }).catch(function(err) { return { error: err.message }; })
        : Promise.resolve(null),
      // 3. If agent is running, inject a role transition awareness message
      isRunning
        ? engineCall('/agents/' + agentId + '/inject-message', {
            method: 'POST',
            body: JSON.stringify({
              role: 'system',
              content: '[ROLE TRANSITION NOTICE]\n\n' +
                'Your role has been changed by your administrator.\n\n' +
                'Previous Role: ' + currentRole + '\n' +
                'New Role: ' + newRole + ' (' + tpl.name + ')\n\n' +
                'What this means:\n' +
                '- Your personality, approach, and expertise have been updated to match your new role.\n' +
                '- Your permissions and available tools may have changed.\n' +
                '- Your memory and knowledge from your previous role are still intact.\n' +
                '- Treat this like a human changing departments — you carry your experience forward but your responsibilities and approach shift.\n\n' +
                'Action required:\n' +
                '- Acknowledge this transition in your next response.\n' +
                '- Review your new role description and adjust your behavior accordingly.\n' +
                '- Continue to leverage relevant knowledge from your previous role where applicable.\n' +
                '- If you were in the middle of tasks from your old role, flag them to your administrator for reassignment or completion guidance.'
            })
          }).catch(function() { return null; })
        : Promise.resolve(null)
    ]).then(function(results) {
      if (results[1] && results[1].profile) {
        setProfile(results[1].profile);
      }
      toast('Role changed: ' + currentRole + ' → ' + tpl.name, 'success');
      setApplyingSoul(null);
      closeRolePreview();
      reload();
    }).catch(function(err) {
      toast('Failed: ' + err.message, 'error');
      setApplyingSoul(null);
      setConfirmStep(2);
    });
  };

  // ─── Edit Mode Init ────────────────────────────────────

  var startEdit = function() {
    var p = profile || {};
    var rl = p.rateLimits || p.rate_limits || {};
    var con = p.constraints || {};
    var appr = p.requireApproval || p.approvalSettings || p.approval || {};
    setForm({
      maxRiskLevel: p.maxRiskLevel || p.max_risk_level || 'medium',
      blockedSideEffects: (p.blockedSideEffects || p.blocked_side_effects || []).slice(),
      sandboxMode: p.sandboxMode || p.sandbox_mode || false,
      approvalEnabled: appr.enabled !== undefined ? appr.enabled : false,
      approvalRiskLevels: (appr.forRiskLevels || appr.riskLevels || appr.risk_levels || []).slice(),
      approvalSideEffects: (appr.forSideEffects || appr.sideEffects || appr.side_effects || []).slice(),
      approvalTimeout: appr.timeoutMinutes || appr.timeout || 30,
      callsPerMinute: rl.toolCallsPerMinute || rl.callsPerMinute || rl.calls_per_minute || 30,
      callsPerHour: rl.toolCallsPerHour || rl.callsPerHour || rl.calls_per_hour || 500,
      callsPerDay: rl.toolCallsPerDay || rl.callsPerDay || rl.calls_per_day || 5000,
      externalPerHour: rl.externalActionsPerHour || rl.externalPerHour || rl.external_per_hour || 50,
      maxConcurrentTasks: con.maxConcurrentTasks || con.max_concurrent_tasks || 5,
      maxSessionDuration: con.maxSessionDurationMinutes || con.maxSessionDuration || con.max_session_duration || 480,
    });
    setEditing(true);
  };

  var setField = function(key, value) {
    setForm(function(prev) { var n = Object.assign({}, prev); n[key] = value; return n; });
  };

  var toggleInArray = function(key, item) {
    setForm(function(prev) {
      var arr = (prev[key] || []).slice();
      var idx = arr.indexOf(item);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(item);
      var n = Object.assign({}, prev); n[key] = arr; return n;
    });
  };

  // ─── Save Custom Profile ───────────────────────────────

  var saveProfile = function() {
    setSaving(true);
    var updated = {
      id: agentId,
      name: (profile && profile.name) || 'Custom',
      maxRiskLevel: form.maxRiskLevel,
      blockedSideEffects: form.blockedSideEffects,
      sandboxMode: form.sandboxMode,
      requireApproval: {
        enabled: form.approvalEnabled,
        forRiskLevels: form.approvalRiskLevels,
        forSideEffects: form.approvalSideEffects,
        approvers: [],
        timeoutMinutes: Number(form.approvalTimeout) || 30,
      },
      rateLimits: {
        toolCallsPerMinute: Number(form.callsPerMinute) || 0,
        toolCallsPerHour: Number(form.callsPerHour) || 0,
        toolCallsPerDay: Number(form.callsPerDay) || 0,
        externalActionsPerHour: Number(form.externalPerHour) || 0,
      },
      constraints: {
        maxConcurrentTasks: Number(form.maxConcurrentTasks) || 5,
        maxSessionDurationMinutes: Number(form.maxSessionDuration) || 480,
        sandboxMode: form.sandboxMode,
      },
      createdAt: (profile && profile.createdAt) || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    engineCall('/profiles/' + agentId, {
      method: 'PUT',
      body: JSON.stringify(updated)
    }).then(function(res) {
      toast('Permissions saved', 'success');
      setProfile(res.profile || updated);
      setEditing(false);
      setSaving(false);
      reload();
    }).catch(function(err) {
      toast('Failed: ' + err.message, 'error');
      setSaving(false);
    });
  };

  // ─── Loading ───────────────────────────────────────────

  if (loading) {
    return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading permissions...');
  }

  // ─── Shared styles ─────────────────────────────────────

  var CATEGORY_COLORS = {
    code_of_conduct: '#6366f1', communication: '#0ea5e9', data_handling: '#991b1b',
    brand_voice: '#9d174d', security: '#ef4444', escalation: '#8b5cf6', custom: '#64748b'
  };
  var ENFORCEMENT_COLORS = { mandatory: '#ef4444', recommended: '#991b1b', informational: '#0ea5e9' };
  var inputStyle = { padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, width: '100%' };
  var labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };

  // ─── Edit Mode ─────────────────────────────────────────

  if (editing) {
    return h(Fragment, null,
      // Header
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
        h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, 'Edit Permissions'),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { className: 'btn btn-primary btn-sm', disabled: saving, onClick: saveProfile }, saving ? 'Saving...' : 'Save'),
          h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setEditing(false); } }, 'Cancel')
        )
      ),

      // Max Risk Level
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 8px', fontSize: 14, fontWeight: 600 } }, 'Maximum Risk Level'),
        h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } }, 'The highest risk level of tools this agent can use.'),
        h('div', { style: { display: 'flex', gap: 8 } },
          ALL_RISK_LEVELS.map(function(level) {
            return h('button', { key: level, className: 'btn btn-sm' + (form.maxRiskLevel === level ? ' btn-primary' : ' btn-secondary'), onClick: function() { setField('maxRiskLevel', level); }, style: { textTransform: 'capitalize' } }, level);
          })
        )
      ),

      // Blocked Side Effects
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 8px', fontSize: 14, fontWeight: 600 } }, 'Blocked Side Effects'),
        h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } }, 'Actions this agent is never allowed to perform.'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
          ALL_SIDE_EFFECTS.map(function(se) {
            var active = form.blockedSideEffects.indexOf(se) >= 0;
            return h('div', { key: se, style: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid ' + (active ? 'var(--danger)' : 'var(--border)'), background: active ? 'rgba(239,68,68,0.1)' : 'var(--bg-secondary)', fontSize: 12 }, onClick: function() { toggleInArray('blockedSideEffects', se); } },
              h('input', { type: 'checkbox', checked: active, readOnly: true, style: { accentColor: 'var(--danger)' } }),
              se
            );
          })
        )
      ),

      // Approval Settings
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 12px', fontSize: 14, fontWeight: 600 } }, 'Approval Settings'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 } },
          h('label', { style: { fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 } },
            h('input', { type: 'checkbox', checked: form.approvalEnabled, onChange: function() { setField('approvalEnabled', !form.approvalEnabled); } }),
            'Require approval for risky actions'
          )
        ),
        form.approvalEnabled && h(Fragment, null,
          h('div', { style: { marginBottom: 14 } },
            h('div', { style: labelStyle }, 'Risk levels requiring approval:'),
            h('div', { style: { display: 'flex', gap: 8 } },
              ALL_RISK_LEVELS.map(function(level) {
                var active = form.approvalRiskLevels.indexOf(level) >= 0;
                return h('button', { key: level, className: 'btn btn-sm' + (active ? ' btn-primary' : ' btn-secondary'), onClick: function() { toggleInArray('approvalRiskLevels', level); }, style: { textTransform: 'capitalize' } }, level);
              })
            )
          ),
          h('div', { style: { marginBottom: 14 } },
            h('div', { style: labelStyle }, 'Side effects requiring approval:'),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
              ALL_SIDE_EFFECTS.map(function(se) {
                var active = form.approvalSideEffects.indexOf(se) >= 0;
                return h('button', { key: se, className: 'btn btn-sm' + (active ? ' btn-info' : ' btn-ghost'), onClick: function() { toggleInArray('approvalSideEffects', se); }, style: { fontSize: 11 } }, se);
              })
            )
          ),
          h('div', { style: { maxWidth: 200 } },
            h('div', { style: labelStyle }, 'Timeout (minutes)'),
            h('input', { type: 'number', style: inputStyle, value: form.approvalTimeout, min: 1, onChange: function(e) { setField('approvalTimeout', e.target.value); } })
          )
        )
      ),

      // Rate Limits
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 12px', fontSize: 14, fontWeight: 600 } }, 'Rate Limits'),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
          h('div', null, h('div', { style: labelStyle }, 'Calls / Minute'), h('input', { type: 'number', style: inputStyle, value: form.callsPerMinute, min: 0, onChange: function(e) { setField('callsPerMinute', e.target.value); } })),
          h('div', null, h('div', { style: labelStyle }, 'Calls / Hour'), h('input', { type: 'number', style: inputStyle, value: form.callsPerHour, min: 0, onChange: function(e) { setField('callsPerHour', e.target.value); } })),
          h('div', null, h('div', { style: labelStyle }, 'Calls / Day'), h('input', { type: 'number', style: inputStyle, value: form.callsPerDay, min: 0, onChange: function(e) { setField('callsPerDay', e.target.value); } })),
          h('div', null, h('div', { style: labelStyle }, 'External Actions / Hour'), h('input', { type: 'number', style: inputStyle, value: form.externalPerHour, min: 0, onChange: function(e) { setField('externalPerHour', e.target.value); } }))
        )
      ),

      // Constraints
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 12px', fontSize: 14, fontWeight: 600 } }, 'Constraints'),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 } },
          h('div', null, h('div', { style: labelStyle }, 'Max Concurrent Tasks'), h('input', { type: 'number', style: inputStyle, value: form.maxConcurrentTasks, min: 1, onChange: function(e) { setField('maxConcurrentTasks', e.target.value); } })),
          h('div', null, h('div', { style: labelStyle }, 'Max Session Duration (min)'), h('input', { type: 'number', style: inputStyle, value: form.maxSessionDuration, min: 1, onChange: function(e) { setField('maxSessionDuration', e.target.value); } }))
        ),
        h('label', { style: { fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 } },
          h('input', { type: 'checkbox', checked: form.sandboxMode, onChange: function() { setField('sandboxMode', !form.sandboxMode); } }),
          'Sandbox Mode (restrict to safe tools only)'
        )
      ),

      // Bottom save bar
      h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        h('button', { className: 'btn btn-primary', disabled: saving, onClick: saveProfile }, saving ? 'Saving...' : 'Save Permissions'),
        h('button', { className: 'btn btn-ghost', onClick: function() { setEditing(false); } }, 'Cancel')
      )
    );
  }

  // ─── View Mode ─────────────────────────────────────────

  // ─── Soul Template / Role Selector ──────────────────────

  var filteredSoulCategories = {};
  var soulEntries = Object.entries(soulCategories);
  for (var si = 0; si < soulEntries.length; si++) {
    var sCat = soulEntries[si][0];
    var sTemplates = soulEntries[si][1];
    if (!soulSearch) { filteredSoulCategories[sCat] = sTemplates; continue; }
    var sq = soulSearch.toLowerCase();
    var sFiltered = sTemplates.filter(function(t) { return t.name.toLowerCase().indexOf(sq) >= 0 || t.description.toLowerCase().indexOf(sq) >= 0 || (t.tags || []).some(function(tag) { return tag.indexOf(sq) >= 0; }); });
    if (sFiltered.length > 0) filteredSoulCategories[sCat] = sFiltered;
  }

  var soulCard = h('div', { className: 'card', style: { marginBottom: 20 } },
    h('div', { className: 'card-header', style: { cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }, onClick: function() { setSoulOpen(!soulOpen); } },
      h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Role Templates', h(HelpButton, { label: 'Role Templates' },
        h('p', null, 'Pre-configured agent personas with identity, personality, skills, and permissions bundled together. Applying a template sets up the agent for a specific role in one click.'),
        h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Role templates are a great starting point. You can always customize individual settings after applying one.')
      )),
      h('span', { style: { fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 } },
        h('span', null, Object.values(soulCategories).reduce(function(sum, arr) { return sum + arr.length; }, 0) + ' templates'),
        h('span', { style: { transition: 'transform 0.2s', transform: soulOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block', lineHeight: 1 } },
          h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('polyline', { points: '6 9 12 15 18 9' }))
        )
      )
    ),
    soulOpen && h('div', { className: 'card-body' },
      h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } }, 'Apply a role template to configure this agent\'s personality, description, skills, and permissions in one click.'),
      h('div', { style: { marginBottom: 12 } },
        h('input', { className: 'input', type: 'text', placeholder: 'Search role templates...', value: soulSearch, onChange: function(e) { setSoulSearch(e.target.value); }, style: { maxWidth: 300 } })
      ),
      Object.keys(filteredSoulCategories).length > 0
        ? Object.entries(filteredSoulCategories).map(function(entry) {
            var cat = entry[0];
            var templates = entry[1];
            var meta = soulMeta[cat] || {};
            return h('div', { key: cat, style: { marginBottom: 16 } },
              h('h4', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 } },
                (meta.icon || '') + ' ' + (meta.name || cat)
              ),
              h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 } },
                templates.map(function(tpl) {
                  var isApplying = applyingSoul === tpl.id;
                  return h('div', { key: tpl.id, className: 'preset-card', style: { padding: '10px 14px', cursor: isApplying ? 'wait' : 'pointer', opacity: isApplying ? 0.6 : 1 }, onClick: function() { if (!isApplying && !applyingSoul) openRolePreview(tpl); } },
                    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                      h('h4', { style: { fontSize: 13, fontWeight: 600, margin: 0 } }, tpl.name),
                      isApplying && h('span', { style: { fontSize: 11, color: 'var(--accent)' } }, 'Applying...')
                    ),
                    h('p', { style: { fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' } }, tpl.description ? (tpl.description.length > 80 ? tpl.description.slice(0, 80) + '...' : tpl.description) : ''),
                    tpl.suggestedPreset && h('span', { className: 'badge badge-info', style: { fontSize: 10, marginTop: 6 } }, tpl.suggestedPreset)
                  );
                })
              )
            );
          })
        : h('div', { style: { fontSize: 13, color: 'var(--text-muted)', padding: 12 } }, 'No role templates found.')
    )
  );

  // Preset selector card (always visible)
  var presetCard = h('div', { className: 'card', style: { marginBottom: 20 } },
    h('div', { className: 'card-header' }, h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Apply a Permission Preset', h(HelpButton, { label: 'Permission Presets' },
      h('p', null, 'Quick permission profiles that configure risk levels, blocked actions, rate limits, and approval requirements. Presets replace the current permission profile entirely.'),
      h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
        h('li', null, h('strong', null, 'Restrictive'), ' — Low risk, many blocked actions, approval required.'),
        h('li', null, h('strong', null, 'Standard'), ' — Balanced defaults for most agents.'),
        h('li', null, h('strong', null, 'Permissive'), ' — High autonomy, fewer restrictions.')
      )
    ))),
    h('div', { className: 'card-body' },
      h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } }, 'Select a preset to quickly configure this agent\'s permissions. This will replace the current profile.'),
      presets.length > 0
        ? h('div', { className: 'preset-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 } },
            presets.map(function(p) {
              var isActive = profile && (profile.name === p.name);
              return h('div', { key: p.name, className: 'preset-card' + (isActive ? ' selected' : ''), style: { padding: '12px 16px', borderRadius: 8, border: '1px solid ' + (isActive ? 'var(--accent)' : 'var(--border)'), cursor: 'pointer', background: isActive ? 'var(--accent-soft)' : 'var(--bg-secondary)' }, onClick: function() { if (!isActive) applyPreset(p.name); } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } },
                  h('h4', { style: { fontSize: 13, fontWeight: 600, margin: 0 } }, p.name),
                  isActive && h('span', { style: { color: 'var(--accent)' } }, I.check())
                ),
                h('p', { style: { fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 6px' } }, p.description || ''),
                p.maxRiskLevel && h('span', { className: riskBadgeClass(p.maxRiskLevel), style: { fontSize: 10 } }, 'Risk: ' + p.maxRiskLevel)
              );
            })
          )
        : h('div', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'No presets available.')
    )
  );

  if (!profile) {
    return h(Fragment, null,
      clientOrgId && h('div', { style: { padding: '12px 16px', background: 'var(--info-soft, rgba(14,165,233,0.1))', borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--info, #0ea5e9)' } },
        I.building(),
        h('span', null, h('strong', null, 'Organization Policies: '), 'Permissions for this agent are governed by ', h('strong', null, orgName || 'organization'), ' policies.'),
        h('span', { className: 'badge', style: { fontSize: 10, padding: '1px 8px', background: 'var(--info, #0ea5e9)', color: '#fff', marginLeft: 'auto', flexShrink: 0 } }, orgName || 'Org')
      ),
      soulCard,
      presetCard,
      h(EmptyState, { icon: I.shield(), message: 'No permission profile assigned to this agent. Select a role template or preset above, or create a custom profile.' }),
      h('div', { style: { textAlign: 'center', marginTop: 12 } },
        h('button', { className: 'btn btn-primary', onClick: startEdit }, 'Create Custom Profile')
      )
    );
  }

  // ─── Derived Values ─────────────────────────────────────

  var maxRisk = profile.maxRiskLevel || profile.max_risk_level || 'medium';
  var blockedSideEffects = profile.blockedSideEffects || profile.blocked_side_effects || [];
  var sandboxMode = profile.sandboxMode || profile.sandbox_mode || false;
  var approval = profile.requireApproval || profile.approvalSettings || profile.approval || {};
  var approvalEnabled = approval.enabled !== undefined ? approval.enabled : false;
  var approvalRiskLevels = approval.forRiskLevels || approval.riskLevels || approval.risk_levels || [];
  var approvalSideEffects = approval.forSideEffects || approval.sideEffects || approval.side_effects || [];
  var approvalTimeout = approval.timeoutMinutes || approval.timeout || 30;
  var rateLimits = profile.rateLimits || profile.rate_limits || {};
  var callsPerMin = rateLimits.toolCallsPerMinute || rateLimits.callsPerMinute || rateLimits.calls_per_minute || 0;
  var callsPerHr = rateLimits.toolCallsPerHour || rateLimits.callsPerHour || rateLimits.calls_per_hour || 0;
  var callsPerDay = rateLimits.toolCallsPerDay || rateLimits.callsPerDay || rateLimits.calls_per_day || 0;
  var externalPerHr = rateLimits.externalActionsPerHour || rateLimits.externalPerHour || rateLimits.external_per_hour || 0;
  var constraints = profile.constraints || {};
  var maxConcurrent = constraints.maxConcurrentTasks || constraints.max_concurrent_tasks || '-';
  var maxSessionDuration = constraints.maxSessionDurationMinutes || constraints.maxSessionDuration || constraints.max_session_duration || '-';
  var allowedIPs = constraints.allowedIPs || constraints.allowed_ips || [];
  var skills = profile.skills || profile.tools || {};
  var blockedTools = skills.blocked || [];
  var allowedTools = skills.allowed || [];

  // ─── Role Change Preview & Confirmation Modal ────────────
  var roleChangeModal = previewTpl && h('div', { style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }, onClick: function(e) { if (e.target === e.currentTarget) closeRolePreview(); } },
    h('div', { style: { background: 'var(--bg-card)', borderRadius: 'var(--radius)', maxWidth: 640, width: '100%', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' } },

      // Header
      h('div', { style: { padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('div', null,
          h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 700 } }, confirmStep === 0 ? 'Role Preview' : confirmStep === 1 ? 'Impact Assessment' : confirmStep === 2 ? 'Final Confirmation' : 'Applying...'),
          h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, 'Step ' + (confirmStep + 1) + ' of 3')
        ),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: closeRolePreview, style: { fontSize: 18 } }, I.x())
      ),

      // Step 0: Preview
      confirmStep === 0 && h('div', { style: { padding: 20 } },
        // Role comparison
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, marginBottom: 20, alignItems: 'center' } },
          h('div', { style: { padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', textAlign: 'center' } },
            h('div', { style: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 } }, 'Current Role'),
            h('div', { style: { fontSize: 14, fontWeight: 700 } }, currentRole)
          ),
          h('div', { style: { fontSize: 18, color: 'var(--text-muted)' } }, '\u2192'),
          h('div', { style: { padding: 12, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 'var(--radius)', textAlign: 'center' } },
            h('div', { style: { fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 } }, 'New Role'),
            h('div', { style: { fontSize: 14, fontWeight: 700 } }, previewTpl.identity && previewTpl.identity.role || previewTpl.name)
          )
        ),

        // Description
        h('div', { style: { marginBottom: 16 } },
          h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 4 } }, 'Description'),
          h('div', { style: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 } }, previewTpl.description || 'No description')
        ),

        // Personality preview (collapsed)
        previewTpl.personality && h('div', { style: { marginBottom: 16 } },
          h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 4 } }, 'Personality & Approach'),
          h('div', { style: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, maxHeight: 120, overflow: 'auto', padding: 10, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', whiteSpace: 'pre-wrap' } },
            previewTpl.personality.length > 500 ? previewTpl.personality.slice(0, 500) + '...' : previewTpl.personality
          )
        ),

        // Suggested skills
        previewTpl.suggestedSkills && previewTpl.suggestedSkills.length > 0 && h('div', { style: { marginBottom: 16 } },
          h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 4 } }, 'Suggested Skills'),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
            previewTpl.suggestedSkills.map(function(sk) { return h('span', { key: sk, className: 'badge badge-neutral', style: { fontSize: 10 } }, sk); })
          )
        ),

        // Permission preset
        previewTpl.suggestedPreset && h('div', { style: { marginBottom: 16 } },
          h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 4 } }, 'Permission Preset'),
          h('span', { className: 'badge badge-info', style: { fontSize: 11 } }, previewTpl.suggestedPreset)
        ),

        // Tags
        previewTpl.tags && previewTpl.tags.length > 0 && h('div', { style: { marginBottom: 16 } },
          h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 4 } }, 'Tags'),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
            previewTpl.tags.map(function(t) { return h('span', { key: t, className: 'badge badge-neutral', style: { fontSize: 10 } }, t); })
          )
        ),

        // Footer
        h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--border)' } },
          h('button', { className: 'btn btn-secondary', onClick: closeRolePreview }, 'Cancel'),
          h('button', { className: 'btn btn-primary', onClick: function() { setConfirmStep(1); } }, 'Continue to Impact Assessment')
        )
      ),

      // Step 1: Impact Assessment
      confirmStep === 1 && h('div', { style: { padding: 20 } },
        // Warning banner
        h('div', { style: { padding: 14, background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 'var(--radius)', marginBottom: 16 } },
          h('div', { style: { fontWeight: 700, fontSize: 13, color: 'var(--warning)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 } }, I.warning(), ' Changing an agent\'s role is a significant action'),
          h('div', { style: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 } },
            'This is equivalent to moving an employee to a completely different department. The agent\'s entire personality, approach, expertise, and permissions will be rewritten.'
          )
        ),

        // What will change
        h('div', { style: { marginBottom: 16 } },
          h('div', { style: { fontSize: 13, fontWeight: 700, marginBottom: 8 } }, 'What will change:'),
          h('ul', { style: { margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 2, color: 'var(--text-secondary)' } },
            h('li', null, h('strong', null, 'Identity & Personality'), ' \u2014 The agent\'s entire persona, tone, and approach will be replaced'),
            h('li', null, h('strong', null, 'Skills & Tools'), ' \u2014 Available tools may change based on the new role\'s requirements'),
            previewTpl.suggestedPreset && h('li', null, h('strong', null, 'Permissions'), ' \u2014 Permission profile will be replaced with "', previewTpl.suggestedPreset, '"'),
            h('li', null, h('strong', null, 'System Prompt'), ' \u2014 The agent\'s core instructions will be completely rewritten'),
            isRunning && h('li', { style: { color: 'var(--warning)' } }, h('strong', null, 'Active Sessions'), ' \u2014 The agent is currently running. Active sessions will be notified of the role change.')
          )
        ),

        // What will NOT change
        h('div', { style: { marginBottom: 16 } },
          h('div', { style: { fontSize: 13, fontWeight: 700, marginBottom: 8 } }, 'What will be preserved:'),
          h('ul', { style: { margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 2, color: 'var(--text-secondary)' } },
            h('li', null, h('strong', null, 'Memory'), ' \u2014 All past conversations, knowledge, and memory files remain intact'),
            h('li', null, h('strong', null, 'Email & Integrations'), ' \u2014 Email config, connected accounts stay unchanged'),
            h('li', null, h('strong', null, 'Organization'), ' \u2014 Client org assignment and credentials are unaffected'),
            h('li', null, h('strong', null, 'Channels'), ' \u2014 Connected messaging channels (WhatsApp, Telegram, etc.) stay active')
          )
        ),

        // Recommendation
        h('div', { style: { padding: 14, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' } },
          h('strong', null, 'Recommendation: '), 'If this agent has been operating in its current role for a significant time and has built up specialized knowledge, consider ',
          h('strong', null, 'creating a new agent'), ' for the new role instead. This preserves the original agent\'s expertise and avoids confusion in its memory. You can always transfer relevant knowledge bases between agents.'
        ),

        h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--border)' } },
          h('button', { className: 'btn btn-secondary', onClick: function() { setConfirmStep(0); } }, 'Back'),
          h('button', { className: 'btn btn-danger', onClick: function() { setConfirmStep(2); } }, 'I understand, proceed')
        )
      ),

      // Step 2: Type confirmation
      confirmStep === 2 && h('div', { style: { padding: 20 } },
        h('div', { style: { textAlign: 'center', marginBottom: 20 } },
          h('div', { style: { marginBottom: 8 } }, I.warning()),
          h('div', { style: { fontSize: 15, fontWeight: 700, marginBottom: 4 } }, 'Final Confirmation'),
          h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } },
            'Type ', h('code', { style: { padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: 4, fontWeight: 700 } }, 'CHANGE ROLE'),
            ' to confirm changing this agent from ', h('strong', null, currentRole), ' to ', h('strong', null, previewTpl.identity && previewTpl.identity.role || previewTpl.name), '.'
          )
        ),
        h('input', {
          className: 'input', type: 'text', value: confirmText, autoFocus: true,
          placeholder: 'Type CHANGE ROLE...',
          onInput: function(e) { setConfirmText(e.target.value); },
          onKeyDown: function(e) { if (e.key === 'Enter' && confirmText.trim().toUpperCase() === 'CHANGE ROLE') executeRoleChange(previewTpl); },
          style: { textAlign: 'center', fontSize: 16, letterSpacing: '0.05em', fontFamily: 'var(--font-mono)', marginBottom: 16, borderColor: confirmText.trim().toUpperCase() === 'CHANGE ROLE' ? 'var(--danger)' : 'var(--border)' }
        }),
        h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          h('button', { className: 'btn btn-secondary', onClick: function() { setConfirmStep(1); setConfirmText(''); } }, 'Back'),
          h('button', { className: 'btn btn-danger', disabled: confirmText.trim().toUpperCase() !== 'CHANGE ROLE', onClick: function() { executeRoleChange(previewTpl); } }, 'Change Role')
        )
      ),

      // Step 3: Applying
      confirmStep === 3 && h('div', { style: { padding: 40, textAlign: 'center' } },
        h('div', { style: { fontSize: 14, fontWeight: 600, marginBottom: 8 } }, 'Applying role change...'),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Updating personality, permissions, and notifying active sessions.')
      )
    )
  );

  return h(Fragment, null,

    // Role change modal
    roleChangeModal,

    // Org policies banner
    clientOrgId && h('div', { style: { padding: '12px 16px', background: 'var(--info-soft, rgba(14,165,233,0.1))', borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--info, #0ea5e9)' } },
      I.building(),
      h('span', null,
        h('strong', null, 'Organization Policies: '),
        'Permissions for this agent are governed by ',
        h('strong', null, orgName || 'organization'),
        ' policies. Organization-level overrides may apply to risk levels, rate limits, and approval requirements.'
      ),
      h('span', { className: 'badge', style: { fontSize: 10, padding: '1px 8px', background: 'var(--info, #0ea5e9)', color: '#fff', marginLeft: 'auto', flexShrink: 0 } }, orgName || 'Org')
    ),

    // Role template selector
    soulCard,

    // Preset selector
    presetCard,

    // ─── Current Profile + Edit Button ──────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Current Permission Profile', h(HelpButton, { label: 'Permission Profile' },
          h('p', null, 'The active permission profile controls what this agent can do. It defines the maximum risk level, blocked side effects, sandbox mode, and approval requirements.')
        )),
        h('button', { className: 'btn btn-primary btn-sm', onClick: startEdit }, I.journal(), ' Edit')
      ),
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 } },
          h('h3', { style: { fontSize: 16, fontWeight: 600, margin: 0 } }, profile.name || profile.profileName || 'Custom Profile'),
          h('span', { className: riskBadgeClass(maxRisk) }, 'Max Risk: ' + maxRisk)
        ),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 } },
          h('span', { style: { fontSize: 12, color: 'var(--text-muted)', marginRight: 4 } }, 'Blocked Side Effects:'),
          blockedSideEffects.length > 0
            ? blockedSideEffects.map(function(se, i) {
                return h('span', { key: i, className: 'badge badge-danger', style: { fontSize: 11 } }, se);
              })
            : h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'None')
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Sandbox Mode:'),
          h('span', { className: sandboxMode ? 'badge badge-warning' : 'badge badge-neutral' }, sandboxMode ? 'Enabled' : 'Disabled')
        )
      )
    ),

    // ─── Approval Settings Card ─────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Approval Settings', h(HelpButton, { label: 'Approval Settings' },
        h('p', null, 'When enabled, the agent must get human approval before performing risky actions. You can configure which risk levels and side effects trigger approval, and how long to wait before timing out.')
      ))),
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 } },
          h('span', { style: { fontSize: 13, color: 'var(--text-secondary)' } }, 'Approval Required:'),
          h('span', { className: approvalEnabled ? 'badge badge-success' : 'badge badge-neutral' }, approvalEnabled ? 'Enabled' : 'Disabled')
        ),
        approvalEnabled && h(Fragment, null,
          h('div', { style: { marginBottom: 12 } },
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 } }, 'Risk Levels Requiring Approval:'),
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
              approvalRiskLevels.length > 0
                ? approvalRiskLevels.map(function(rl, i) { return h('span', { key: i, className: riskBadgeClass(rl) }, rl); })
                : h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'None')
            )
          ),
          h('div', { style: { marginBottom: 12 } },
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 } }, 'Side Effects Requiring Approval:'),
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
              approvalSideEffects.length > 0
                ? approvalSideEffects.map(function(se, i) { return h('span', { key: i, className: 'badge badge-info', style: { fontSize: 11 } }, se); })
                : h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'None')
            )
          ),
          h('div', { style: { fontSize: 12, color: 'var(--text-secondary)' } }, 'Timeout: ', h('strong', null, approvalTimeout + ' minutes'))
        )
      )
    ),

    // ─── Rate Limits Card ───────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Rate Limits', h(HelpButton, { label: 'Rate Limits' },
        h('p', null, 'Controls how many tool calls the agent can make per time period. Prevents runaway behavior and controls costs. External actions (email, messaging) have a separate limit.')
      ))),
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
          h('div', { style: { padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 } }, h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'Calls / Minute'), h('div', { style: { fontSize: 20, fontWeight: 700 } }, String(callsPerMin || 'Unlimited'))),
          h('div', { style: { padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 } }, h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'Calls / Hour'), h('div', { style: { fontSize: 20, fontWeight: 700 } }, String(callsPerHr || 'Unlimited'))),
          h('div', { style: { padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 } }, h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'Calls / Day'), h('div', { style: { fontSize: 20, fontWeight: 700 } }, String(callsPerDay || 'Unlimited'))),
          h('div', { style: { padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 } }, h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 } }, 'External / Hour'), h('div', { style: { fontSize: 20, fontWeight: 700 } }, String(externalPerHr || 'Unlimited')))
        )
      )
    ),

    // ─── Constraints Card ───────────────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Constraints', h(HelpButton, { label: 'Constraints' },
        h('p', null, 'Operational limits for concurrent tasks, session duration, sandbox mode, and IP allowlisting. These prevent the agent from consuming excessive resources.')
      ))),
      h('div', { className: 'card-body' },
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
          h('div', null, h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Max Concurrent Tasks'), h('div', { style: { fontSize: 14, fontWeight: 600 } }, String(maxConcurrent))),
          h('div', null, h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Max Session Duration'), h('div', { style: { fontSize: 14, fontWeight: 600 } }, String(maxSessionDuration))),
          h('div', null, h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Sandbox Mode'), h('span', { className: sandboxMode ? 'badge badge-warning' : 'badge badge-neutral' }, sandboxMode ? 'Enabled' : 'Disabled')),
          h('div', null, h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Allowed IPs'), allowedIPs.length > 0 ? h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } }, allowedIPs.map(function(ip, i) { return h('span', { key: i, className: 'badge badge-neutral', style: { fontSize: 11, fontFamily: 'monospace' } }, ip); })) : h('div', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'Any'))
        )
      )
    ),

    // ─── Tools Card ─────────────────────────────────────
    (blockedTools.length > 0 || allowedTools.length > 0) && h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', null, 'Tool Overrides')),
      h('div', { className: 'card-body' },
        blockedTools.length > 0 && h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 } },
          h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Blocked:'),
          blockedTools.map(function(t, i) { return h('span', { key: i, className: 'badge badge-danger', style: { fontSize: 11 } }, t); })
        ),
        allowedTools.length > 0 && h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
          h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Allowed:'),
          allowedTools.map(function(t, i) { return h('span', { key: i, className: 'badge badge-success', style: { fontSize: 11 } }, t); })
        )
      )
    ),

    // ─── Applicable Policies Table ──────────────────────
    h('div', { className: 'card', style: { marginBottom: 20 } },
      h('div', { className: 'card-header' }, h('span', { style: { display: 'flex', alignItems: 'center' } }, 'Applicable Policies', h(HelpButton, { label: 'Applicable Policies' },
        h('p', null, 'Organization-level policies that apply to this agent. Policies define rules of conduct, data handling requirements, brand voice guidelines, and escalation procedures. Mandatory policies are enforced; recommended and informational policies are advisory.')
      ))),
      policies.length > 0
        ? h('div', { className: 'card-body-flush' },
            h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null, h('th', null, 'Name'), h('th', null, 'Category'), h('th', null, 'Enforcement'), h('th', null, 'Status'))
              ),
              h('tbody', null,
                policies.map(function(p, i) {
                  var cat = p.category || 'custom';
                  var enf = p.enforcement || p.enforcementType || 'informational';
                  var enabled = p.enabled !== false;
                  return h('tr', { key: p.id || i },
                    h('td', { style: { fontWeight: 500, fontSize: 13 } }, p.name || p.title || 'Untitled'),
                    h('td', null, h(Badge, { color: CATEGORY_COLORS[cat] || '#64748b' }, cat.replace(/_/g, ' '))),
                    h('td', null, h(Badge, { color: ENFORCEMENT_COLORS[enf] || '#64748b' }, enf)),
                    h('td', null, h('span', { className: enabled ? 'badge badge-success' : 'badge badge-neutral' }, enabled ? 'Enabled' : 'Disabled'))
                  );
                })
              )
            )
          )
        : h('div', { className: 'card-body' },
            h('div', { style: { textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 } }, 'No policies applied to this agent.')
          )
    )
  );
}

