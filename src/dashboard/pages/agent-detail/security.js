import { h, useState, useEffect, Fragment, useApp, apiCall } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { Badge, StatCard, EmptyState } from './shared.js?v=5';

export function AgentSecurityTab(props) {
  var agentId = props.agentId;

  var app = useApp();
  var toast = app.toast;

  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];
  var _dirty = useState(false);
  var dirty = _dirty[0]; var setDirty = _dirty[1];
  var _globalConfig = useState({});
  var globalConfig = _globalConfig[0]; var setGlobalConfig = _globalConfig[1];
  var _agentOverrides = useState({});
  var agentOverrides = _agentOverrides[0]; var setAgentOverrides = _agentOverrides[1];
  var _useGlobal = useState({
    promptInjection: true,
    sqlInjection: true,
    inputValidation: true,
    outputFiltering: true,
    portSecurity: true,
    bruteForce: true,
    contentSecurity: true,
    secretScanning: true,
    auditSecurity: true
  });
  var useGlobal = _useGlobal[0]; var setUseGlobal = _useGlobal[1];

  var _cardStyle = { border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 16 };
  var _cardTitleStyle = { fontSize: 16, fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 };
  var _cardDescStyle = { fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 };
  var _sectionTitleStyle = { fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, marginTop: 8 };

  var load = function() {
    setLoading(true);
    Promise.all([
      apiCall('/settings/security').catch(function() { return { securityConfig: {} }; }),
      apiCall('/agents/' + agentId + '/security').catch(function() { return { securityOverrides: {} }; })
    ]).then(function(results) {
      var globalData = results[0];
      var agentData = results[1];
      
      setGlobalConfig(globalData.securityConfig || {});
      setAgentOverrides(agentData.securityOverrides || {});
      
      // Determine which sections are using global settings
      var overrides = agentData.securityOverrides || {};
      setUseGlobal(function() {
        return {
          promptInjection: !overrides.promptInjection,
          sqlInjection: !overrides.sqlInjection,
          inputValidation: !overrides.inputValidation,
          outputFiltering: !overrides.outputFiltering,
          portSecurity: !overrides.portSecurity,
          bruteForce: !overrides.bruteForce,
          contentSecurity: !overrides.contentSecurity,
          secretScanning: !overrides.secretScanning,
          auditSecurity: !overrides.auditSecurity
        };
      });
      
      setDirty(false);
      setLoading(false);
    });
  };

  useEffect(function() { load(); }, [agentId]);

  function updateSection(section, updates) {
    setAgentOverrides(function(prev) {
      return Object.assign({}, prev, { [section]: Object.assign({}, prev[section] || {}, updates) });
    });
    setDirty(true);
  }

  function toggleGlobalUsage(section) {
    setUseGlobal(function(prev) {
      var newUseGlobal = Object.assign({}, prev, { [section]: !prev[section] });
      
      if (newUseGlobal[section]) {
        // Switch to global - remove override
        setAgentOverrides(function(overrides) {
          var newOverrides = Object.assign({}, overrides);
          delete newOverrides[section];
          return newOverrides;
        });
      } else {
        // Switch to custom - use global config as starting point
        var globalValue = globalConfig[section] || getDefaultSectionConfig(section);
        updateSection(section, globalValue);
      }
      
      setDirty(true);
      return newUseGlobal;
    });
  }

  function getDefaultSectionConfig(section) {
    var defaults = {
      promptInjection: { enabled: true, mode: 'sanitize', sensitivity: 'medium', customPatterns: [], allowedOverrideAgents: [], logDetections: true, blockResponse: '' },
      sqlInjection: { enabled: true, mode: 'block', scanToolInputs: true, scanApiInputs: true, logDetections: true },
      inputValidation: { enabled: true, maxInputLength: 100000, maxJsonDepth: 20, stripHtml: false, blockScripts: true, sanitizeUnicode: true },
      outputFiltering: { enabled: true, scanForSecrets: true, scanForPii: true, mode: 'redact', customRedactPatterns: [], logDetections: true },
      portSecurity: { enabled: false, monitorOpenPorts: false, allowedPorts: [22, 80, 443, 3000, 8080], scanIntervalMinutes: 60, alertOnNewPort: true },
      bruteForce: { enabled: true, maxLoginAttempts: 5, lockoutDurationMinutes: 15, maxApiKeyAttempts: 10, trackFailedAttempts: true },
      contentSecurity: { enabled: true, cspPolicy: '', frameAncestors: ['self'], scriptSrc: ['self', 'unsafe-inline'], connectSrc: ['self'] },
      secretScanning: { enabled: true, scanAgentOutputs: true, scanToolResults: true, patterns: 'default', customPatterns: [], alertOnDetection: true },
      auditSecurity: { enabled: true, logAllToolCalls: false, logPromptInjectionAttempts: true, logApiAccess: false, retentionDays: 90 }
    };
    return defaults[section] || {};
  }

  function getCurrentSectionConfig(section) {
    if (useGlobal[section]) {
      return globalConfig[section] || getDefaultSectionConfig(section);
    } else {
      return agentOverrides[section] || getDefaultSectionConfig(section);
    }
  }

  function ToggleSwitch(props) {
    return h('label', { style: { position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer' } },
      h('input', { type: 'checkbox', checked: props.checked, onChange: function(e) { props.onChange(e.target.checked); }, style: { opacity: 0, width: 0, height: 0 } }),
      h('span', { style: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: props.checked ? 'var(--brand-color, #6366f1)' : 'var(--bg-tertiary, #374151)',
        borderRadius: 11, transition: 'background 0.2s'
      } },
        h('span', { style: {
          position: 'absolute', top: 2, left: props.checked ? 20 : 2, width: 18, height: 18,
          background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        } })
      )
    );
  }

  function GlobalToggle(props) {
    var section = props.section;
    var label = props.label;
    
    return h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 6 } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('span', { style: { fontWeight: 500 } }, label),
        useGlobal[section] && h('span', { style: { fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'var(--brand-color)', color: 'white', fontWeight: 600 } }, 'GLOBAL')
      ),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
        h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, useGlobal[section] ? 'Using global settings' : 'Custom settings'),
        h(ToggleSwitch, { checked: !useGlobal[section], onChange: function() { toggleGlobalUsage(section); } })
      )
    );
  }

  var save = function() {
    setSaving(true);
    apiCall('/agents/' + agentId + '/security', {
      method: 'PUT',
      body: JSON.stringify({ securityOverrides: agentOverrides })
    }).then(function() {
      toast('Agent security settings updated', 'success');
      setDirty(false);
    }).catch(function(err) {
      toast('Failed to save: ' + err.message, 'error');
    }).finally(function() {
      setSaving(false);
    });
  };

  if (loading) {
    return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading security settings...');
  }

  return h('div', null,
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 } },
      h('div', null,
        h('h2', { style: { fontSize: 18, fontWeight: 700, margin: 0 } }, 'Agent Security Settings'),
        h('p', { style: { fontSize: 14, color: 'var(--text-muted)', margin: '4px 0 0' } }, 'Configure security overrides specific to this agent')
      ),
      h('button', {
        className: 'btn btn-primary',
        onClick: save,
        disabled: !dirty || saving,
        style: { minWidth: 80 }
      }, saving ? 'Saving...' : 'Save Changes')
    ),

    // Prompt Injection Defense
    h('div', { style: _cardStyle },
      h('div', { style: _cardTitleStyle }, I.shield(), 'Prompt Injection Defense'),
      h('p', { style: _cardDescStyle }, 'Multi-layer detection and prevention of prompt injection attacks'),
      h(GlobalToggle, { section: 'promptInjection', label: 'Prompt Injection Defense' }),
      !useGlobal.promptInjection && (function() {
        var config = getCurrentSectionConfig('promptInjection');
        return h('div', null,
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
            h('span', { style: { fontWeight: 500 } }, 'Enable Protection'),
            h(ToggleSwitch, { checked: config.enabled, onChange: function(v) { updateSection('promptInjection', { enabled: v }); } })
          ),
          config.enabled && h('div', null,
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 } },
              h('div', null,
                h('label', { className: 'form-label' }, 'Detection Mode'),
                h('select', { 
                  className: 'input', 
                  value: config.mode, 
                  onChange: function(e) { updateSection('promptInjection', { mode: e.target.value }); }
                },
                  h('option', { value: 'monitor' }, 'Monitor Only'),
                  h('option', { value: 'sanitize' }, 'Sanitize Content'),
                  h('option', { value: 'block' }, 'Block Request')
                )
              ),
              h('div', null,
                h('label', { className: 'form-label' }, 'Sensitivity Level'),
                h('select', { 
                  className: 'input', 
                  value: config.sensitivity, 
                  onChange: function(e) { updateSection('promptInjection', { sensitivity: e.target.value }); }
                },
                  h('option', { value: 'low' }, 'Low'),
                  h('option', { value: 'medium' }, 'Medium'),
                  h('option', { value: 'high' }, 'High'),
                  h('option', { value: 'maximum' }, 'Maximum')
                )
              )
            )
          )
        );
      })()
    ),

    // SQL Injection Prevention
    h('div', { style: _cardStyle },
      h('div', { style: _cardTitleStyle }, I.shield(), 'SQL Injection Prevention'),
      h('p', { style: _cardDescStyle }, 'Detect and block SQL injection attempts'),
      h(GlobalToggle, { section: 'sqlInjection', label: 'SQL Injection Prevention' }),
      !useGlobal.sqlInjection && (function() {
        var config = getCurrentSectionConfig('sqlInjection');
        return h('div', null,
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
            h('span', { style: { fontWeight: 500 } }, 'Enable Protection'),
            h(ToggleSwitch, { checked: config.enabled, onChange: function(v) { updateSection('sqlInjection', { enabled: v }); } })
          ),
          config.enabled && h('div', null,
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 } },
              h('div', null,
                h('label', { className: 'form-label' }, 'Detection Mode'),
                h('select', { 
                  className: 'input', 
                  value: config.mode, 
                  onChange: function(e) { updateSection('sqlInjection', { mode: e.target.value }); }
                },
                  h('option', { value: 'monitor' }, 'Monitor Only'),
                  h('option', { value: 'block' }, 'Block Request')
                )
              ),
              h('div', null,
                h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: 8 } },
                  h('input', { 
                    type: 'checkbox', 
                    checked: config.scanToolInputs, 
                    onChange: function(e) { updateSection('sqlInjection', { scanToolInputs: e.target.checked }); },
                    style: { marginRight: 8 }
                  }),
                  h('span', null, 'Scan tool arguments')
                ),
                h('div', { style: { display: 'flex', alignItems: 'center' } },
                  h('input', { 
                    type: 'checkbox', 
                    checked: config.scanApiInputs, 
                    onChange: function(e) { updateSection('sqlInjection', { scanApiInputs: e.target.checked }); },
                    style: { marginRight: 8 }
                  }),
                  h('span', null, 'Scan API requests')
                )
              )
            )
          )
        );
      })()
    ),

    // Output Filtering
    h('div', { style: _cardStyle },
      h('div', { style: _cardTitleStyle }, I.shield(), 'Output Filtering'),
      h('p', { style: _cardDescStyle }, 'Scan agent outputs for secrets and personal information'),
      h(GlobalToggle, { section: 'outputFiltering', label: 'Output Filtering' }),
      !useGlobal.outputFiltering && (function() {
        var config = getCurrentSectionConfig('outputFiltering');
        return h('div', null,
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
            h('span', { style: { fontWeight: 500 } }, 'Enable Filtering'),
            h(ToggleSwitch, { checked: config.enabled, onChange: function(v) { updateSection('outputFiltering', { enabled: v }); } })
          ),
          config.enabled && h('div', null,
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 } },
              h('div', null,
                h('label', { className: 'form-label' }, 'Filter Mode'),
                h('select', { 
                  className: 'input', 
                  value: config.mode, 
                  onChange: function(e) { updateSection('outputFiltering', { mode: e.target.value }); }
                },
                  h('option', { value: 'monitor' }, 'Monitor Only'),
                  h('option', { value: 'redact' }, 'Redact Secrets'),
                  h('option', { value: 'block' }, 'Block Output')
                )
              ),
              h('div', null,
                h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: 8 } },
                  h('input', { 
                    type: 'checkbox', 
                    checked: config.scanForSecrets, 
                    onChange: function(e) { updateSection('outputFiltering', { scanForSecrets: e.target.checked }); },
                    style: { marginRight: 8 }
                  }),
                  h('span', null, 'Scan for secrets')
                ),
                h('div', { style: { display: 'flex', alignItems: 'center' } },
                  h('input', { 
                    type: 'checkbox', 
                    checked: config.scanForPii, 
                    onChange: function(e) { updateSection('outputFiltering', { scanForPii: e.target.checked }); },
                    style: { marginRight: 8 }
                  }),
                  h('span', null, 'Scan for PII')
                )
              )
            )
          )
        );
      })()
    ),

    // Security Audit Log
    h('div', { style: _cardStyle },
      h('div', { style: _cardTitleStyle }, I.journal(), 'Security Audit Log'),
      h('p', { style: _cardDescStyle }, 'Agent-specific security logging settings'),
      h(GlobalToggle, { section: 'auditSecurity', label: 'Security Audit Log' }),
      !useGlobal.auditSecurity && (function() {
        var config = getCurrentSectionConfig('auditSecurity');
        return h('div', null,
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
            h('span', { style: { fontWeight: 500 } }, 'Enable Audit Logging'),
            h(ToggleSwitch, { checked: config.enabled, onChange: function(v) { updateSection('auditSecurity', { enabled: v }); } })
          ),
          config.enabled && h('div', null,
            h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: 8 } },
              h('input', { 
                type: 'checkbox', 
                checked: config.logAllToolCalls, 
                onChange: function(e) { updateSection('auditSecurity', { logAllToolCalls: e.target.checked }); },
                style: { marginRight: 8 }
              }),
              h('span', null, 'Log all tool calls for this agent')
            ),
            h('div', { style: { display: 'flex', alignItems: 'center' } },
              h('input', { 
                type: 'checkbox', 
                checked: config.logPromptInjectionAttempts, 
                onChange: function(e) { updateSection('auditSecurity', { logPromptInjectionAttempts: e.target.checked }); },
                style: { marginRight: 8 }
              }),
              h('span', null, 'Log prompt injection attempts')
            )
          )
        );
      })()
    )
  );
}