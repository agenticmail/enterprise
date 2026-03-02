import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { HelpButton } from '../../components/help-button.js';
import { Badge, EmptyState, formatTime } from './shared.js?v=4';

// ════════════════════════════════════════════════════════════
// MANAGER & DAILY CATCH-UP SECTION
// ════════════════════════════════════════════════════════════

var COMMON_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo', 'America/Mexico_City',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam', 'Europe/Madrid',
  'Europe/Rome', 'Europe/Zurich', 'Europe/Stockholm', 'Europe/Warsaw', 'Europe/Istanbul',
  'Africa/Lagos', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Nairobi',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai',
  'Asia/Seoul', 'Asia/Hong_Kong', 'Asia/Bangkok', 'Asia/Jakarta',
  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland'
];

export function resolveManager(config, allAgents) {
  var mgr = config.manager || {};
  // Legacy: managerId at top level
  var legacyId = config.managerId;
  if (mgr.type === 'external') {
    return { type: 'external', name: mgr.name || '', email: mgr.email || '' };
  }
  var internalId = mgr.agentId || legacyId;
  if (internalId) {
    var found = (allAgents || []).find(function(a) { return a.id === internalId; });
    return { type: 'internal', agentId: internalId, name: found ? (found.config?.identity?.name || found.config?.displayName || found.name || internalId) : internalId };
  }
  return null;
}

export function ManagerCatchUpSection(props) {
  var agentId = props.agentId;
  var engineAgent = props.engineAgent;
  var allAgents = props.agents || [];
  var reload = props.reload;
  var toast = useApp().toast;

  var ea = engineAgent || {};
  var config = ea.config || {};
  var catchUp = config.dailyCatchUp || {};

  var resolved = resolveManager(config, allAgents);

  var _editing = useState(false);
  var editing = _editing[0]; var setEditing = _editing[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];
  var _form = useState({});
  var form = _form[0]; var setForm = _form[1];

  var startEdit = function() {
    setForm({
      managerType: resolved ? resolved.type : 'none',
      managerAgentId: resolved && resolved.type === 'internal' ? resolved.agentId : '',
      managerName: resolved && resolved.type === 'external' ? resolved.name : '',
      managerEmail: resolved && resolved.type === 'external' ? resolved.email : '',
      managerWhatsApp: (config.messagingChannels?.managerIdentity?.whatsappNumber) || '',
      managerTelegram: (config.messagingChannels?.managerIdentity?.telegramId) || '',
      catchUpEnabled: catchUp.enabled !== false && (catchUp.enabled || catchUp.time),
      catchUpTime: catchUp.time || '09:00',
      catchUpTimezone: catchUp.timezone || 'America/New_York',
      catchUpPlatform: catchUp.platform || 'email',
    });
    setEditing(true);
  };

  var set = function(k, v) { setForm(function(f) { var n = Object.assign({}, f); n[k] = v; return n; }); };

  var save = function() {
    setSaving(true);
    var updates = {};

    // Build manager object
    if (form.managerType === 'external') {
      if (!form.managerName || !form.managerEmail) {
        toast('Manager name and email are required', 'error');
        setSaving(false);
        return;
      }
      updates.manager = { type: 'external', name: form.managerName, email: form.managerEmail };
      updates.managerId = null; // clear legacy
      // Save messaging platform identities
      if (form.managerWhatsApp || form.managerTelegram || form.managerIMessage) {
        updates.messagingChannels = Object.assign({}, config.messagingChannels || {}, {
          managerIdentity: {
            whatsappNumber: form.managerWhatsApp || '',
            telegramId: form.managerTelegram || '',
          }
        });
      }
    } else if (form.managerType === 'internal') {
      if (!form.managerAgentId) {
        toast('Select an agent', 'error');
        setSaving(false);
        return;
      }
      updates.manager = { type: 'internal', agentId: form.managerAgentId };
      updates.managerId = form.managerAgentId; // keep legacy compat
    } else {
      updates.manager = null;
      updates.managerId = null;
    }

    // Build dailyCatchUp
    if (form.catchUpEnabled) {
      updates.dailyCatchUp = {
        enabled: true,
        time: form.catchUpTime,
        timezone: form.catchUpTimezone,
        platform: form.catchUpPlatform || 'email',
      };
    } else {
      updates.dailyCatchUp = { enabled: false };
    }

    var isRunning = ea.state === 'running' || ea.state === 'active' || ea.state === 'degraded';
    var endpoint = isRunning ? '/agents/' + agentId + '/hot-update' : '/agents/' + agentId + '/config';
    var method = isRunning ? 'POST' : 'PATCH';

    engineCall(endpoint, { method: method, body: JSON.stringify({ updates: updates, updatedBy: 'dashboard' }) })
      .then(function() { toast('Manager & catch-up saved', 'success'); setEditing(false); setSaving(false); reload(); })
      .catch(function(err) { toast('Failed to save: ' + err.message, 'error'); setSaving(false); });
  };

  var labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  var inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 };
  var fieldGroupStyle = { marginBottom: 16 };
  var rowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };

  // Other agents this agent could report to (exclude self)
  var otherAgents = allAgents.filter(function(a) { return a.id !== agentId; });

  if (editing) {
    return h(Fragment, null,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
        h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, 'Edit Manager & Daily Catch-Up'),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setEditing(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary btn-sm', disabled: saving, onClick: save }, saving ? 'Saving...' : 'Save Changes')
        )
      ),

      // Manager Card
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Manager'),
        h('p', { style: { fontSize: 13, color: 'var(--text-muted)', marginTop: 0, marginBottom: 16 } }, 'Assign a manager this agent reports to. Can be another agent in the system or an external person (name + email).'),

        h('div', { style: fieldGroupStyle },
          h('label', { style: labelStyle }, 'Manager Type'),
          h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: form.managerType, onChange: function(e) {
            set('managerType', e.target.value);
            if (e.target.value === 'none') { set('managerAgentId', ''); set('managerName', ''); set('managerEmail', ''); }
          } },
            h('option', { value: 'none' }, 'No manager'),
            h('option', { value: 'internal' }, 'Another agent in this organization'),
            h('option', { value: 'external' }, 'External person (name + email)')
          )
        ),

        form.managerType === 'internal' && h('div', { style: fieldGroupStyle },
          h('label', { style: labelStyle }, 'Select Agent'),
          h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: form.managerAgentId, onChange: function(e) { set('managerAgentId', e.target.value); } },
            h('option', { value: '' }, '-- Select agent --'),
            otherAgents.map(function(a) {
              var name = a.config?.identity?.name || a.config?.displayName || a.name || a.id;
              var role = a.config?.identity?.role || a.config?.role || '';
              return h('option', { key: a.id, value: a.id }, name + (role ? ' (' + role + ')' : ''));
            })
          )
        ),

        form.managerType === 'external' && h(Fragment, null,
          h('div', { style: rowStyle },
            h('div', { style: fieldGroupStyle },
              h('label', { style: labelStyle }, 'Manager Name'),
              h('input', { style: inputStyle, type: 'text', value: form.managerName, placeholder: 'e.g. Sarah Johnson', onChange: function(e) { set('managerName', e.target.value); } })
            ),
            h('div', { style: fieldGroupStyle },
              h('label', { style: labelStyle }, 'Manager Email'),
              h('input', { style: inputStyle, type: 'email', value: form.managerEmail, placeholder: 'e.g. sarah@company.com', onChange: function(e) { set('managerEmail', e.target.value); } })
            )
          ),
          h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 16 } }, 'The agent will contact this person for daily catch-ups, status reports, and escalations via the platform you choose below.'),

          // Messaging platform identities
          h('div', { style: { padding: '16px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' } },
            h('h5', { style: { margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' } }, 'Manager Identity on Messaging Platforms'),
            h('p', { style: { fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' } }, 'So the agent recognizes the manager across WhatsApp and Telegram with full trust.'),
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 } },
              h('div', null,
                h('label', { style: labelStyle }, E.whatsapp(14), ' WhatsApp'),
                h('input', { style: inputStyle, type: 'text', value: form.managerWhatsApp || '', placeholder: '+1234567890', onChange: function(e) { set('managerWhatsApp', e.target.value); } })
              ),
              h('div', null,
                h('label', { style: labelStyle }, E.telegram(14), ' Telegram'),
                h('input', { style: inputStyle, type: 'text', value: form.managerTelegram || '', placeholder: 'User ID (from @userinfobot)', onChange: function(e) { set('managerTelegram', e.target.value); } })
              ),
            )
          )
        )
      ),

      // Daily Catch-Up Card
      h('div', { className: 'card', style: { padding: 20 } },
        h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Daily Catch-Up'),
        h('p', { style: { fontSize: 13, color: 'var(--text-muted)', marginTop: 0, marginBottom: 16 } }, 'When enabled, the agent sends a daily status update to its manager with goals, progress, and blockers via the chosen platform.'),

        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 } },
          h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 } },
            h('input', { type: 'checkbox', checked: form.catchUpEnabled, onChange: function(e) { set('catchUpEnabled', e.target.checked); } }),
            'Enable daily catch-up'
          )
        ),

        form.catchUpEnabled && h(Fragment, null,
          h('div', { style: rowStyle },
            h('div', { style: fieldGroupStyle },
              h('label', { style: labelStyle }, 'Time'),
              h('input', { style: inputStyle, type: 'time', value: form.catchUpTime, onChange: function(e) { set('catchUpTime', e.target.value); } })
            ),
            h('div', { style: fieldGroupStyle },
              h('label', { style: labelStyle }, 'Timezone'),
              h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: form.catchUpTimezone, onChange: function(e) { set('catchUpTimezone', e.target.value); } },
                COMMON_TIMEZONES.map(function(tz) { return h('option', { key: tz, value: tz }, tz.replace(/_/g, ' ')); })
              )
            )
          ),
          h('div', { style: Object.assign({}, fieldGroupStyle, { marginTop: 4 }) },
            h('label', { style: labelStyle }, 'Send via'),
            h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
              (function() {
                var channels = config.messagingChannels || {};
                var platforms = [{ id: 'email', label: 'Email', icon: E.email(14), always: true }];
                if (channels.whatsapp?.enabled || channels.whatsapp?.botToken || form.managerWhatsApp) {
                  platforms.push({ id: 'whatsapp', label: 'WhatsApp', icon: E.whatsapp(14) });
                }
                if (channels.telegram?.enabled || channels.telegram?.botToken) {
                  platforms.push({ id: 'telegram', label: 'Telegram', icon: E.telegram(14) });
                }
                // Always show all three if manager type is external (they might configure later)
                if (form.managerType === 'external') {
                  if (!platforms.find(function(p) { return p.id === 'whatsapp'; })) platforms.push({ id: 'whatsapp', label: 'WhatsApp', icon: E.whatsapp(14) });
                  if (!platforms.find(function(p) { return p.id === 'telegram'; })) platforms.push({ id: 'telegram', label: 'Telegram', icon: E.telegram(14) });
                }
                return platforms.map(function(p) {
                  var selected = form.catchUpPlatform === p.id;
                  return h('button', {
                    key: p.id, type: 'button',
                    className: 'btn btn-sm ' + (selected ? 'btn-primary' : 'btn-ghost'),
                    style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 13, borderRadius: 8 },
                    onClick: function() { set('catchUpPlatform', p.id); }
                  }, p.icon, ' ', p.label);
                });
              })()
            ),
            form.catchUpPlatform === 'whatsapp' && !form.managerWhatsApp && h('div', { style: { fontSize: 12, color: 'var(--warning-text, #b45309)', marginTop: 6 } }, 'Set the manager\'s WhatsApp number above to use this.'),
            form.catchUpPlatform === 'telegram' && !form.managerTelegram && h('div', { style: { fontSize: 12, color: 'var(--warning-text, #b45309)', marginTop: 6 } }, 'Set the manager\'s Telegram ID above to use this.')
          )
        ),

        form.catchUpEnabled && !form.managerType !== 'none' && form.managerType === 'none' && h('div', {
          style: { padding: '10px 14px', background: 'var(--warning-soft, #fff3cd)', borderRadius: 6, fontSize: 13, color: 'var(--warning-text, #856404)', marginTop: 12 }
        }, 'Note: Catch-up is enabled but no manager is assigned. The agent won\'t have anyone to report to.')
      )
    );
  }

  // View mode
  var catchUpEnabled = catchUp.enabled || catchUp.time;
  var catchUpTime = catchUp.time || '09:00';
  var catchUpTz = catchUp.timezone || 'America/New_York';

  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center' } }, 'Manager & Daily Catch-Up',
        h(HelpButton, { label: 'Manager & Daily Catch-Up' },
          h('p', null, 'Define who this agent reports to and configure automated daily briefings.'),
          h('h4', { style: { marginTop: 16, marginBottom: 8, fontSize: 14 } }, 'Manager'),
          h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
            h('li', null, h('strong', null, 'Internal Manager'), ' — Another agent in your organization that supervises this one. Escalations and reports go to them.'),
            h('li', null, h('strong', null, 'External Manager'), ' — A human outside the system (e.g., via email). The agent sends reports and escalations to this email address.'),
            h('li', null, h('strong', null, 'No Manager'), ' — The agent operates independently. Escalations go to the system admin.')
          ),
          h('h4', { style: { marginTop: 16, marginBottom: 8, fontSize: 14 } }, 'Daily Catch-Up'),
          h('p', null, 'When enabled, the agent sends a daily summary to its manager covering what it did, any issues encountered, and upcoming tasks. You can choose which platforms (email, chat, etc.) receive the catch-up.'),
          h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Daily catch-ups help you stay aware of what the agent is doing without manually checking. Start with email summaries, then add chat if you want real-time updates.')
        )
      ),
      h('button', { className: 'btn btn-primary btn-sm', onClick: startEdit }, I.journal(), ' Edit')
    ),

    // Manager Card
    h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
      h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Reports To'),
      resolved
        ? h(Fragment, null,
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 } },
              h('div', { style: {
                width: 40, height: 40, borderRadius: '50%', background: resolved.type === 'external' ? 'var(--accent)' : 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0
              } }, (resolved.name || '?').charAt(0).toUpperCase()),
              h('div', null,
                h('div', { style: { fontSize: 14, fontWeight: 600 } }, resolved.name),
                resolved.type === 'external'
                  ? h('div', { style: { fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' } }, resolved.email)
                  : h('span', { className: 'badge badge-neutral', style: { fontSize: 11 } }, 'Internal Agent')
              )
            ),
            // Show messaging identities if configured
            (function() {
              var mi = config.messagingChannels?.managerIdentity || {};
              var hasAny = mi.whatsappNumber || mi.telegramId;
              if (!hasAny) return null;
              return h('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 } },
                mi.whatsappNumber && h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)', padding: '3px 8px', background: 'var(--bg-secondary)', borderRadius: 12 } }, E.whatsapp(14), mi.whatsappNumber),
                mi.telegramId && h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)', padding: '3px 8px', background: 'var(--bg-secondary)', borderRadius: 12 } }, E.telegram(14), mi.telegramId)
              );
            })()
          )
        : h('div', { style: { fontSize: 14, color: 'var(--text-muted)' } }, 'No manager assigned')
    ),

    // Daily Catch-Up Card
    h('div', { className: 'card', style: { padding: 20 } },
      h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Daily Catch-Up'),
      catchUpEnabled
        ? h('div', null,
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
              h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' } }),
              h('span', { style: { fontSize: 14, fontWeight: 600 } }, 'Active')
            ),
            h('div', { style: { fontSize: 13, color: 'var(--text-secondary)' } },
              'Sends daily at ', h('strong', null, catchUpTime), ' ', catchUpTz.replace(/_/g, ' '),
              ' via ',
              (function() {
                var p = catchUp.platform || 'email';
                var iconMap = { email: E.email(14), whatsapp: E.whatsapp(14), telegram: E.telegram(14) };
                var labelMap = { email: 'Email', whatsapp: 'WhatsApp', telegram: 'Telegram' };
                return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 } }, iconMap[p] || null, ' ', labelMap[p] || p);
              })()
            ),
            !resolved && h('div', { style: { fontSize: 12, color: 'var(--warning-text, #856404)', marginTop: 8 } }, 'Warning: No manager assigned — catch-up emails have no recipient.')
          )
        : h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block' } }),
            h('span', { style: { fontSize: 14, color: 'var(--text-muted)' } }, 'Not configured')
          )
    )
  );
}

