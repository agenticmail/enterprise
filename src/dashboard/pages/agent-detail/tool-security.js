import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { TagInput } from '../../components/tag-input.js';
import { Badge, EmptyState } from './shared.js?v=4';
import { HelpButton } from '../../components/help-button.js';

var _tsCardStyle = { border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 16 };
var _tsCardTitle = { fontSize: 15, fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 };
var _tsCardDesc = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 };
var _tsToggleRow = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 };
var _tsGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };
var _tsSectionTitle = { fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, marginTop: 8 };

function TSToggle(props) {
  var checked = props.checked;
  var onChange = props.onChange;
  var label = props.label;
  var inherited = props.inherited;
  return h('div', { style: _tsToggleRow },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
      h('span', { style: { fontSize: 13, fontWeight: 500 } }, label),
      inherited && h('span', { style: { fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontWeight: 600 } }, 'ORG DEFAULT')
    ),
    h('label', { style: { position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer' } },
      h('input', { type: 'checkbox', checked: checked, onChange: function(e) { onChange(e.target.checked); }, style: { opacity: 0, width: 0, height: 0 } }),
      h('span', { style: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: checked ? 'var(--brand-color, #6366f1)' : 'var(--bg-tertiary, #374151)',
        borderRadius: 11, transition: 'background 0.2s'
      } },
        h('span', { style: {
          position: 'absolute', top: 2, left: checked ? 20 : 2, width: 18, height: 18,
          background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        } })
      )
    )
  );
}

function TSRateLimitEditor(props) {
  var overrides = props.overrides || {};
  var onChange = props.onChange;
  var DEFAULT_LIMITS = { bash: { max: 10, rate: 10 }, browser: { max: 20, rate: 20 }, web_fetch: { max: 30, rate: 30 }, web_search: { max: 30, rate: 30 }, read: { max: 60, rate: 60 }, write: { max: 60, rate: 60 }, edit: { max: 60, rate: 60 }, glob: { max: 60, rate: 60 }, grep: { max: 60, rate: 60 }, memory: { max: 60, rate: 60 } };
  var tools = Object.keys(DEFAULT_LIMITS);

  var setOverride = function(tool, field, value) {
    var current = overrides[tool] || { maxTokens: DEFAULT_LIMITS[tool].max, refillRate: DEFAULT_LIMITS[tool].rate };
    var next = Object.assign({}, overrides);
    next[tool] = Object.assign({}, current);
    next[tool][field] = parseInt(value) || 0;
    onChange(next);
  };

  return h('div', { style: { fontSize: 12 } },
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 4, marginBottom: 4 } },
      h('span', { style: { fontWeight: 600, color: 'var(--text-secondary)' } }, 'Tool'),
      h('span', { style: { fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' } }, 'Max/min'),
      h('span', { style: { fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' } }, 'Refill/min')
    ),
    tools.map(function(tool) {
      var def = DEFAULT_LIMITS[tool];
      var ov = overrides[tool];
      return h('div', { key: tool, style: { display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 4, marginBottom: 2 } },
        h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 0' } }, tool),
        h('input', { className: 'input', type: 'number', min: 1, max: 1000, style: { fontSize: 11, padding: '2px 6px', textAlign: 'center' }, value: ov ? ov.maxTokens : def.max, onChange: function(e) { setOverride(tool, 'maxTokens', e.target.value); } }),
        h('input', { className: 'input', type: 'number', min: 1, max: 1000, style: { fontSize: 11, padding: '2px 6px', textAlign: 'center' }, value: ov ? ov.refillRate : def.rate, onChange: function(e) { setOverride(tool, 'refillRate', e.target.value); } })
      );
    })
  );
}

export function ToolSecuritySection(props) {
  var agentId = props.agentId;

  var app = useApp();
  var toast = app.toast;

  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];
  var _orgDefaults = useState({});
  var orgDefaults = _orgDefaults[0]; var setOrgDefaults = _orgDefaults[1];
  var _agentOverrides = useState({});
  var agentOverrides = _agentOverrides[0]; var setAgentOverrides = _agentOverrides[1];
  var _merged = useState({});
  var merged = _merged[0]; var setMerged = _merged[1];
  var _dirty = useState(false);
  var dirty = _dirty[0]; var setDirty = _dirty[1];

  var load = function() {
    setLoading(true);
    engineCall('/agents/' + agentId + '/tool-security')
      .then(function(d) {
        setOrgDefaults(d.orgDefaults || {});
        setAgentOverrides(d.agentOverrides || {});
        setMerged(d.toolSecurity || {});
        setDirty(false);
      })
      .catch(function(err) { toast('Failed to load tool security: ' + err.message, 'error'); })
      .finally(function() { setLoading(false); });
  };

  useEffect(function() { load(); }, [agentId]);

  // Track whether a field is overridden at agent level
  var isOverridden = function(section, field) {
    var ao = agentOverrides || {};
    if (section === 'security' || section === 'middleware') {
      return ao[section] !== undefined && ao[section] !== null;
    }
    var sec = ao.security || {};
    var mw = ao.middleware || {};
    var container = (section === 'pathSandbox' || section === 'ssrf' || section === 'commandSanitizer') ? sec : mw;
    if (!container[section]) return false;
    if (field) return container[section][field] !== undefined;
    return true;
  };

  // Update the local overrides (working copy derived from merged)
  var localConfig = dirty ? merged : merged;
  var sec = (localConfig.security || {});
  var mw = (localConfig.middleware || {});

  var updateMerged = function(next) {
    setMerged(next);
    setDirty(true);
  };

  var setSec = function(key, value) {
    var next = Object.assign({}, sec);
    next[key] = value;
    updateMerged({ security: next, middleware: mw });
  };

  var setMw = function(key, value) {
    var next = Object.assign({}, mw);
    next[key] = value;
    updateMerged({ security: sec, middleware: next });
  };

  var patchSec = function(section, field, value) {
    var current = sec[section] || {};
    var next = Object.assign({}, current);
    next[field] = value;
    setSec(section, next);
  };

  var patchMw = function(section, field, value) {
    var current = mw[section] || {};
    var next = Object.assign({}, current);
    next[field] = value;
    setMw(section, next);
  };

  // Compute the diff between merged and orgDefaults to get the overrides to save
  var computeOverrides = function() {
    var overrides = {};
    var orgSec = orgDefaults.security || {};
    var orgMw = orgDefaults.middleware || {};

    // Check each security section
    ['pathSandbox', 'ssrf', 'commandSanitizer'].forEach(function(key) {
      var orgVal = orgSec[key] || {};
      var curVal = sec[key] || {};
      if (JSON.stringify(orgVal) !== JSON.stringify(curVal)) {
        if (!overrides.security) overrides.security = {};
        overrides.security[key] = curVal;
      }
    });

    // Check each middleware section
    ['audit', 'rateLimit', 'circuitBreaker', 'telemetry'].forEach(function(key) {
      var orgVal = orgMw[key] || {};
      var curVal = mw[key] || {};
      if (JSON.stringify(orgVal) !== JSON.stringify(curVal)) {
        if (!overrides.middleware) overrides.middleware = {};
        overrides.middleware[key] = curVal;
      }
    });

    return overrides;
  };

  var save = function() {
    setSaving(true);
    var overrides = computeOverrides();
    engineCall('/agents/' + agentId + '/tool-security', {
      method: 'PATCH',
      body: JSON.stringify({ toolSecurity: overrides, updatedBy: 'dashboard' })
    })
      .then(function() {
        toast('Tool security saved', 'success');
        setAgentOverrides(overrides);
        setDirty(false);
      })
      .catch(function(err) { toast('Save failed: ' + err.message, 'error'); })
      .finally(function() { setSaving(false); });
  };

  var resetAll = function() {
    showConfirm({title: 'Reset to Org Defaults', message: 'This will remove all agent-level tool security overrides and revert to the organization defaults. Continue?'}).then(function() {
      setSaving(true);
      engineCall('/agents/' + agentId + '/tool-security', {
        method: 'PATCH',
        body: JSON.stringify({ toolSecurity: {}, updatedBy: 'dashboard' })
      })
        .then(function() {
          toast('Reset to org defaults', 'success');
          load();
        })
        .catch(function(err) { toast('Reset failed: ' + err.message, 'error'); })
        .finally(function() { setSaving(false); });
    });
  };

  if (loading) {
    return h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'Loading tool security config...');
  }

  var ps = sec.pathSandbox || {};
  var ssrf = sec.ssrf || {};
  var cs = sec.commandSanitizer || {};
  var audit = mw.audit || {};
  var rl = mw.rateLimit || {};
  var cb = mw.circuitBreaker || {};
  var tel = mw.telemetry || {};

  var hasOverrides = Object.keys(agentOverrides).length > 0 || dirty;

  return h(Fragment, null,
    // Header
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('h3', { style: { margin: 0, fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center' } }, 'Tool Security', h(HelpButton, { label: 'Tool Security' },
          h('p', null, 'Configure security sandboxes and middleware for this agent\'s tool usage. Unmodified settings inherit from organization defaults.'),
          h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
            h('li', null, h('strong', null, 'Path Sandbox'), ' — Restricts which directories the agent can read/write.'),
            h('li', null, h('strong', null, 'SSRF Protection'), ' — Blocks access to internal networks and metadata endpoints.'),
            h('li', null, h('strong', null, 'Command Sanitizer'), ' — Controls which shell commands are allowed.'),
            h('li', null, h('strong', null, 'Rate Limiting'), ' — Per-tool call limits to prevent runaway behavior.'),
            h('li', null, h('strong', null, 'Circuit Breaker'), ' — Auto-stops calling failing tools after repeated errors.')
          ),
          h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Only override settings you need to change. Agent-level overrides take precedence over org defaults. Use "Reset to Org Defaults" to remove all overrides.')
        )),
        h('p', { style: { margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' } },
          'Configure tool security overrides for this agent. Unmodified settings inherit from ',
          h('strong', null, 'org defaults'),
          '.'
        )
      ),
      h('div', { style: { display: 'flex', gap: 8 } },
        hasOverrides && h('button', {
          className: 'btn btn-secondary btn-sm',
          onClick: resetAll,
          disabled: saving
        }, 'Reset to Org Defaults'),
        h('button', {
          className: 'btn btn-primary',
          disabled: saving || !dirty,
          onClick: save
        }, saving ? 'Saving...' : 'Save Overrides')
      )
    ),

    // Overrides indicator
    !dirty && Object.keys(agentOverrides).length > 0 && h('div', {
      style: { padding: '8px 12px', borderRadius: 6, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }
    },
      I.shield(),
      'This agent has custom overrides for: ',
      h('strong', null,
        [].concat(
          Object.keys(agentOverrides.security || {}),
          Object.keys(agentOverrides.middleware || {})
        ).join(', ') || 'none'
      )
    ),

    // ── SECURITY SECTION ──
    h('div', { style: _tsSectionTitle }, 'Security Sandboxes'),
    h('div', { style: _tsGrid },

      // Path Sandbox
      h('div', { style: _tsCardStyle },
        h('div', { style: _tsCardTitle }, I.folder(), ' Path Sandbox', h(HelpButton, { label: 'Path Sandbox' },
          h('p', null, 'Restricts file system access to specific directories. Prevents agents from reading sensitive files like .env, SSH keys, or system configs.'),
          h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Add your project directory to allowed dirs. Use blocked patterns to exclude sensitive files like .env or credentials.')
        )),
        h('div', { style: _tsCardDesc }, 'Controls which directories this agent can read/write.'),
        h(TSToggle, { label: 'Enable path sandboxing', checked: ps.enabled !== false, inherited: !isOverridden('pathSandbox', 'enabled'), onChange: function(v) { patchSec('pathSandbox', 'enabled', v); } }),
        h(TagInput, { label: 'Allowed Directories', value: ps.allowedDirs || [], onChange: function(v) { patchSec('pathSandbox', 'allowedDirs', v); }, placeholder: '/path/to/allow', mono: true }),
        h(TagInput, { label: 'Blocked Patterns (regex)', value: ps.blockedPatterns || [], onChange: function(v) { patchSec('pathSandbox', 'blockedPatterns', v); }, placeholder: '\\.env$', mono: true })
      ),

      // SSRF Guard
      h('div', { style: _tsCardStyle },
        h('div', { style: _tsCardTitle }, I.globe(), ' SSRF Protection', h(HelpButton, { label: 'SSRF Protection' },
          h('p', null, 'Server-Side Request Forgery protection prevents the agent from accessing internal infrastructure like cloud metadata endpoints (169.254.x.x), private networks (10.x.x.x), or localhost services.')
        )),
        h('div', { style: _tsCardDesc }, 'Blocks this agent from accessing internal networks and metadata endpoints.'),
        h(TSToggle, { label: 'Enable SSRF protection', checked: ssrf.enabled !== false, inherited: !isOverridden('ssrf', 'enabled'), onChange: function(v) { patchSec('ssrf', 'enabled', v); } }),
        h(TagInput, { label: 'Allowed Hosts', value: ssrf.allowedHosts || [], onChange: function(v) { patchSec('ssrf', 'allowedHosts', v); }, placeholder: 'api.example.com', mono: true }),
        h(TagInput, { label: 'Blocked CIDRs', value: ssrf.blockedCidrs || [], onChange: function(v) { patchSec('ssrf', 'blockedCidrs', v); }, placeholder: '10.0.0.0/8', mono: true })
      )
    ),

    // Command Sanitizer (full width)
    h('div', { style: _tsCardStyle },
      h('div', { style: _tsCardTitle }, I.terminal(), ' Command Sanitizer', h(HelpButton, { label: 'Command Sanitizer' },
        h('p', null, 'Controls shell command execution. Use blocklist mode to deny dangerous commands, or allowlist mode to only permit specific safe commands.'),
        h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Allowlist mode is more secure but requires listing every allowed command. Blocklist mode is easier — just block dangerous patterns like "rm -rf" or "curl | sh".')
      )),
      h('div', { style: _tsCardDesc }, 'Controls which shell commands this agent can execute.'),
      h(TSToggle, { label: 'Enable command validation', checked: cs.enabled !== false, inherited: !isOverridden('commandSanitizer', 'enabled'), onChange: function(v) { patchSec('commandSanitizer', 'enabled', v); } }),
      h('div', { style: { marginBottom: 12 } },
        h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Mode'),
        h('select', { className: 'input', style: { width: 200 }, value: cs.mode || 'blocklist', onChange: function(e) { patchSec('commandSanitizer', 'mode', e.target.value); } },
          h('option', { value: 'blocklist' }, 'Blocklist (block specific patterns)'),
          h('option', { value: 'allowlist' }, 'Allowlist (only allow specific commands)')
        )
      ),
      h('div', { style: _tsGrid },
        h(TagInput, { label: 'Allowed Commands', value: cs.allowedCommands || [], onChange: function(v) { patchSec('commandSanitizer', 'allowedCommands', v); }, placeholder: 'git, npm, node', mono: true }),
        h(TagInput, { label: 'Blocked Patterns', value: cs.blockedPatterns || [], onChange: function(v) { patchSec('commandSanitizer', 'blockedPatterns', v); }, placeholder: 'curl.*\\|.*sh', mono: true })
      )
    ),

    // ── MIDDLEWARE SECTION ──
    h('div', { style: _tsSectionTitle }, 'Middleware & Observability'),
    h('div', { style: _tsGrid },

      // Audit Logging
      h('div', { style: _tsCardStyle },
        h('div', { style: _tsCardTitle }, I.journal(), ' Audit Logging', h(HelpButton, { label: 'Audit Logging' },
          h('p', null, 'Records every tool call this agent makes. Essential for compliance, debugging, and understanding agent behavior. Sensitive values are automatically redacted.')
        )),
        h('div', { style: _tsCardDesc }, 'Logs every tool invocation for this agent.'),
        h(TSToggle, { label: 'Enable audit logging', checked: audit.enabled !== false, inherited: !isOverridden('audit', 'enabled'), onChange: function(v) { patchMw('audit', 'enabled', v); } }),
        h(TagInput, { label: 'Keys to Redact', value: audit.redactKeys || [], onChange: function(v) { patchMw('audit', 'redactKeys', v); }, placeholder: 'custom_secret', mono: true })
      ),

      // Rate Limiting
      h('div', { style: _tsCardStyle },
        h('div', { style: _tsCardTitle }, I.clock(), ' Rate Limiting', h(HelpButton, { label: 'Rate Limiting' },
          h('p', null, 'Sets maximum calls per minute for each tool. Prevents runaway loops where the agent calls the same tool hundreds of times. Each tool has a token bucket that refills at the configured rate.')
        )),
        h('div', { style: _tsCardDesc }, 'Per-tool rate limits for this agent.'),
        h(TSToggle, { label: 'Enable rate limiting', checked: rl.enabled !== false, inherited: !isOverridden('rateLimit', 'enabled'), onChange: function(v) { patchMw('rateLimit', 'enabled', v); } }),
        h(TSRateLimitEditor, { overrides: rl.overrides || {}, onChange: function(v) { patchMw('rateLimit', 'overrides', v); } })
      ),

      // Circuit Breaker
      h('div', { style: _tsCardStyle },
        h('div', { style: _tsCardTitle }, I.pause(), ' Circuit Breaker', h(HelpButton, { label: 'Circuit Breaker' },
          h('p', null, 'Automatically stops calling a tool after consecutive failures. Prevents wasting tokens and API calls on broken integrations. The circuit "opens" after failures and "closes" after a cooldown period.')
        )),
        h('div', { style: _tsCardDesc }, 'Auto-stops calling failing tools after consecutive failures.'),
        h(TSToggle, { label: 'Enable circuit breaker', checked: cb.enabled !== false, inherited: !isOverridden('circuitBreaker', 'enabled'), onChange: function(v) { patchMw('circuitBreaker', 'enabled', v); } })
      ),

      // Telemetry
      h('div', { style: _tsCardStyle },
        h('div', { style: _tsCardTitle }, I.chart(), ' Telemetry', h(HelpButton, { label: 'Telemetry' },
          h('p', null, 'Collects timing data, success rates, and usage patterns for this agent\'s tools. Useful for identifying slow tools, optimizing workflows, and capacity planning.')
        )),
        h('div', { style: _tsCardDesc }, 'Collects execution timing and metrics for this agent\'s tools.'),
        h(TSToggle, { label: 'Enable telemetry', checked: tel.enabled !== false, inherited: !isOverridden('telemetry', 'enabled'), onChange: function(v) { patchMw('telemetry', 'enabled', v); } })
      )
    ),

    // Sticky save bar
    dirty && h('div', { style: { position: 'sticky', bottom: 0, padding: '12px 0', background: 'var(--bg-primary)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 } },
      h('button', { className: 'btn btn-secondary', onClick: function() { load(); } }, 'Discard Changes'),
      h('button', { className: 'btn btn-primary', disabled: saving, onClick: save }, saving ? 'Saving...' : 'Save Tool Security Overrides')
    )
  );
}

