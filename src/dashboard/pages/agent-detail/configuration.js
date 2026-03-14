import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { HelpButton } from '../../components/help-button.js';

// ─── Help tooltip styles ───
var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };

// ─── Voice Voices ───

var BUILTIN_VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'Female', accent: 'American', style: 'Soft, warm' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'Female', accent: 'American', style: 'Calm, professional' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'Female', accent: 'British', style: 'Sophisticated' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'Female', accent: 'British', style: 'Warm, engaging' },
  { id: 'jBpfuIE2acCO8z3wKNLl', name: 'Emily', gender: 'Female', accent: 'American', style: 'Calm, gentle' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'Male', accent: 'American', style: 'Deep, narrative' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'Male', accent: 'American', style: 'Well-rounded' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', gender: 'Male', accent: 'American', style: 'Crisp, commanding' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', gender: 'Male', accent: 'American', style: 'Raspy, authentic' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', gender: 'Male', accent: 'American', style: 'Deep, warm' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: 'Male', accent: 'British', style: 'Authoritative' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', gender: 'Male', accent: 'British', style: 'Intense' },
];

var MODEL_CONTEXTS = [
  { key: 'chat',       label: 'Chat',              desc: 'Google Chat conversations',        rec: 'Sonnet 4 — fast replies' },
  { key: 'meeting',    label: 'Meetings (Voice)',   desc: 'Google Meet with voice',           rec: 'Sonnet 4 — low latency' },
  { key: 'email',      label: 'Email',              desc: 'Composing & replying to emails',   rec: 'Opus — professional quality' },
  { key: 'task',       label: 'Tasks & Projects',   desc: 'Complex work, analysis, research', rec: 'Opus — deep reasoning' },
  { key: 'scheduling', label: 'Scheduling',         desc: 'Calendar, reminders',              rec: 'Haiku — quick and cheap' },
];

// ─── Shared Styles ───

var labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
var inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 };
var fieldGroupStyle = { marginBottom: 16 };
var rowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };

// ─── Card Header with optional Edit button ───

function CardHeader(props) {
  return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
    h('h4', { style: { margin: 0, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center' } }, props.title, props.help || null),
    props.onEdit && !props.editing
      ? h('button', { className: 'btn btn-ghost btn-sm', onClick: props.onEdit }, 'Edit')
      : props.editing
        ? h('div', { style: { display: 'flex', gap: 6 } },
            h('button', { className: 'btn btn-primary btn-sm', disabled: props.saving, onClick: props.onSave }, props.saving ? 'Saving...' : 'Save'),
            h('button', { className: 'btn btn-ghost btn-sm', onClick: props.onCancel }, 'Cancel')
          )
        : null
  );
}

// ─── Provider + Model Picker (reusable) ───

function ProviderModelPicker(props) {
  var provider = props.provider || '';
  var modelId = props.modelId || '';
  var providers = props.providers || [];
  var onChange = props.onChange; // (provider, modelId) => void

  var _models = useState([]);
  var models = _models[0]; var setModels = _models[1];
  var _loading = useState(false);

  useEffect(function() {
    if (!provider) { setModels([]); return; }
    _loading[1](true);
    apiCall('/providers/' + provider + '/models')
      .then(function(d) { setModels(d.models || []); })
      .catch(function() { setModels([]); })
      .finally(function() { _loading[1](false); });
  }, [provider]);

  var configuredProviders = providers.filter(function(p) { return p.configured; });

  return h('div', { style: rowStyle },
    h('div', { style: fieldGroupStyle },
      h('label', { style: labelStyle }, 'Provider'),
      configuredProviders.length === 0
        ? h('div', { style: { padding: 10, background: 'var(--warning-soft)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--warning)' } },
            'No providers configured. Add API keys in Settings \u2192 Integrations.'
          )
        : h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: provider, onChange: function(e) { onChange(e.target.value, ''); } },
            h('option', { value: '' }, '-- Select provider --'),
            configuredProviders.map(function(p) { return h('option', { key: p.id, value: p.id }, p.name); })
          )
    ),
    h('div', { style: fieldGroupStyle },
      h('label', { style: labelStyle }, 'Model'),
      models.length > 0
        ? h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: modelId, onChange: function(e) { onChange(provider, e.target.value); } },
            h('option', { value: '' }, '-- Select model --'),
            models.map(function(m) { return h('option', { key: m.id, value: m.id }, m.name || m.id); })
          )
        : provider
          ? h('input', { style: inputStyle, value: modelId, onChange: function(e) { onChange(provider, e.target.value); }, placeholder: _loading[0] ? 'Loading models...' : 'Enter model ID' })
          : h('select', { style: Object.assign({}, inputStyle, { cursor: 'not-allowed', opacity: 0.5 }), disabled: true },
              h('option', null, 'Select a provider first')
            )
    )
  );
}

// ─── Voice Selector ───

function VoiceSelector(props) {
  var voiceId = props.voiceId;
  var voiceName = props.voiceName;
  var onChange = props.onChange;
  var _customVoices = useState([]);
  var customVoices = _customVoices[0]; var setCustomVoices = _customVoices[1];
  var _loadingVoices = useState(false);
  var _hasApiKey = useState(false);
  var hasApiKey = _hasApiKey[0]; var setHasApiKey = _hasApiKey[1];

  useEffect(function() {
    engineCall('/oauth/status/elevenlabs?orgId=' + getOrgId())
      .then(function(d) {
        if (d.connected) {
          setHasApiKey(true);
          _loadingVoices[1](true);
          engineCall('/integrations/elevenlabs/voices?orgId=' + getOrgId())
            .then(function(d) { setCustomVoices(d.voices || []); })
            .catch(function() {})
            .finally(function() { _loadingVoices[1](false); });
        }
      })
      .catch(function() {});
  }, []);

  var allVoices = BUILTIN_VOICES.concat(customVoices.map(function(v) {
    return { id: v.voice_id, name: v.name, gender: v.labels?.gender || '', accent: v.labels?.accent || '', style: 'Custom', custom: true };
  }));
  var selectedVoice = allVoices.find(function(v) { return v.id === voiceId; });

  return h(Fragment, null,
    !hasApiKey && h('div', { style: { padding: 12, background: 'var(--warning-soft)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--warning)', marginBottom: 16 } },
      'Add your ElevenLabs API key in Settings \u2192 Integrations to enable voice.'
    ),
    voiceId && h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', marginBottom: 16 } },
      h('div', { style: { width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700 } }, (selectedVoice?.name || voiceName || '?').charAt(0)),
      h('div', { style: { flex: 1 } },
        h('div', { style: { fontSize: 14, fontWeight: 600 } }, selectedVoice?.name || voiceName || 'Custom Voice'),
        h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, voiceId)
      ),
      h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { onChange('', ''); } }, 'Clear')
    ),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 } },
      allVoices.map(function(v) {
        var isSelected = v.id === voiceId;
        return h('div', {
          key: v.id,
          style: { padding: '12px 14px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s', border: '2px solid ' + (isSelected ? 'var(--brand-color, #6366f1)' : 'var(--border)'), background: isSelected ? 'var(--brand-color-soft, rgba(99,102,241,0.08))' : 'transparent' },
          onClick: function() { onChange(v.id, v.name); }
        },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } },
            h('strong', { style: { fontSize: 13 } }, v.name),
            v.custom && h('span', { className: 'badge badge-info', style: { fontSize: 10 } }, 'Custom')
          ),
          h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, [v.gender, v.accent, v.style].filter(Boolean).join(' \u00B7 '))
        );
      })
    ),
    _loadingVoices[0] && h('div', { style: { textAlign: 'center', padding: 12, color: 'var(--text-muted)', fontSize: 13 } }, 'Loading custom voices...'),
    h('div', { style: { marginTop: 16 } },
      h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Or enter a voice ID manually'),
      h('input', { className: 'input', type: 'text', value: voiceId, placeholder: 'ElevenLabs voice ID...', onChange: function(e) { onChange(e.target.value, ''); } })
    )
  );
}

// ─── Single Routing Row Editor (provider → model) ───

function RoutingRowEditor(props) {
  var ctx = props.ctx;
  var value = props.value || ''; // "provider/modelId"
  var providers = props.providers || [];
  var onChange = props.onChange;

  var parts = value ? value.split('/') : ['', ''];
  var provider = parts[0] || '';
  var modelId = parts.slice(1).join('/') || '';

  return h('div', { style: { padding: '16px 0', borderBottom: '1px solid var(--border)' } },
    h('div', { style: { marginBottom: 10 } },
      h('div', { style: { fontSize: 13, fontWeight: 600 } }, ctx.label),
      h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, ctx.desc)
    ),
    h(ProviderModelPicker, {
      provider: provider,
      modelId: modelId,
      providers: providers,
      onChange: function(p, m) {
        if (p && m) onChange(p + '/' + m);
        else if (p) onChange(p + '/');
        else onChange('');
      }
    }),
    h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' } }, 'Recommended: ' + ctx.rec),
    value && h('button', { className: 'btn btn-ghost btn-sm', style: { marginTop: 6, fontSize: 11 }, onClick: function() { onChange(''); } }, 'Reset to default')
  );
}

// ─── Model Cost Estimates (per 1K tokens, approximate USD) ───

var MODEL_COSTS = {
  'claude-opus-4-20250514': { input: 0.015, output: 0.075 },
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'claude-haiku-3-20250414': { input: 0.00025, output: 0.00125 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  'gemini-2.5-pro': { input: 0.00125, output: 0.01 },
};

function estimateHeartbeatCost(modelId, intervalMin, tokensPerBeat) {
  tokensPerBeat = tokensPerBeat || 3000; // ~3K tokens per heartbeat round-trip
  var key = Object.keys(MODEL_COSTS).find(function(k) { return modelId && modelId.indexOf(k) !== -1; });
  var cost = key ? MODEL_COSTS[key] : { input: 0.003, output: 0.015 }; // default to sonnet pricing
  var beatsPerDay = (24 * 60) / intervalMin;
  var dailyCost = beatsPerDay * tokensPerBeat * ((cost.input + cost.output) / 2) / 1000;
  return { beatsPerDay: Math.round(beatsPerDay), dailyCost: dailyCost, monthlyCost: dailyCost * 30 };
}

// ─── Model Fallback Card ───

function ModelFallbackCard(props) {
  var config = props.config;
  var saving = props.saving;
  var providers = props.providers;
  var saveUpdates = props.saveUpdates;

  var fb = config.modelFallback || {};
  var _editing = useState(false);
  var editing = _editing[0]; var setEditing = _editing[1];
  var _form = useState({});
  var form = _form[0]; var setForm = _form[1];

  function startEdit() {
    setForm({
      enabled: fb.enabled !== false,
      fallbacks: (fb.fallbacks || []).slice(),
      maxRetries: fb.maxRetries || 2,
      retryDelayMs: fb.retryDelayMs || 1000,
    });
    setEditing(true);
  }

  function addFallback() {
    setForm(function(f) { return Object.assign({}, f, { fallbacks: f.fallbacks.concat(['']) }); });
  }

  function removeFallback(idx) {
    setForm(function(f) {
      var next = f.fallbacks.slice();
      next.splice(idx, 1);
      return Object.assign({}, f, { fallbacks: next });
    });
  }

  function updateFallback(idx, val) {
    setForm(function(f) {
      var next = f.fallbacks.slice();
      next[idx] = val;
      return Object.assign({}, f, { fallbacks: next });
    });
  }

  function save() {
    saveUpdates({
      modelFallback: {
        enabled: form.enabled,
        fallbacks: form.fallbacks.filter(Boolean),
        maxRetries: parseInt(form.maxRetries) || 2,
        retryDelayMs: parseInt(form.retryDelayMs) || 1000,
      }
    }, function() { setEditing(false); });
  }

  var configuredProviders = providers.filter(function(p) { return p.configured; });

  // Build flat list of all models from all configured providers for the dropdown
  var _allModels = useState([]);
  var allModels = _allModels[0]; var setAllModels = _allModels[1];
  useEffect(function() {
    if (!configuredProviders.length) return;
    Promise.all(configuredProviders.map(function(p) {
      return apiCall('/providers/' + p.id + '/models').then(function(d) {
        return (d.models || []).map(function(m) { return { id: p.id + '/' + (m.id || m.name), label: p.name + ' / ' + (m.name || m.id) }; });
      }).catch(function() { return []; });
    })).then(function(results) {
      setAllModels([].concat.apply([], results));
    });
  }, [providers]);

  return h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
    h(CardHeader, {
      title: 'Backup Model Providers',
      help: h(HelpButton, { label: 'Backup Model Providers' },
        h('p', null, 'Configure fallback models that activate automatically when the primary model fails (rate limits, outages, auth errors).'),
        h('h4', { style: _h4 }, 'How It Works'),
        h('ul', { style: _ul },
          h('li', null, 'When the primary model returns an error, the system tries the next model in the chain.'),
          h('li', null, h('strong', null, 'Rate limit / overload errors'), ' — retries the same model first (up to Max Retries), then moves to the next fallback.'),
          h('li', null, h('strong', null, 'Auth / invalid model errors'), ' — skips immediately to the next fallback (no retry).'),
          h('li', null, 'The chain is tried in order from top to bottom.')
        ),
        h('h4', { style: _h4 }, 'Settings'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Max Retries'), ' — How many times to retry a single model before moving to the next one.'),
          h('li', null, h('strong', null, 'Retry Delay'), ' — Wait time (ms) between retries. Increases with each attempt (exponential backoff).')
        ),
        h('div', { style: _tip }, h('strong', null, 'Tip: '), 'A good chain mixes providers — e.g., Anthropic primary → OpenAI fallback → Google fallback. This protects against single-provider outages.')
      ),
      editing: editing,
      saving: saving,
      onEdit: startEdit,
      onSave: save,
      onCancel: function() { setEditing(false); }
    }),

    editing
      ? h(Fragment, null,
          // Enable toggle
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 } },
            h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 } },
              h('input', { type: 'checkbox', checked: form.enabled, onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { enabled: e.target.checked }); }); } }),
              'Enable model fallback'
            )
          ),

          form.enabled && h(Fragment, null,
            // Fallback chain
            h('label', { style: labelStyle }, 'Fallback Chain (in priority order)'),
            h('div', { style: { display: 'grid', gap: 8, marginBottom: 16 } },
              form.fallbacks.map(function(fb, idx) {
                return h('div', { key: idx, style: { display: 'flex', gap: 8, alignItems: 'center' } },
                  h('span', { style: { fontSize: 11, color: 'var(--text-muted)', width: 20, textAlign: 'center', flexShrink: 0 } }, '#' + (idx + 1)),
                  allModels.length > 0
                    ? h('select', { style: Object.assign({}, inputStyle, { flex: 1, cursor: 'pointer' }), value: fb, onChange: function(e) { updateFallback(idx, e.target.value); } },
                        h('option', { value: '' }, '-- Select model --'),
                        allModels.map(function(m) { return h('option', { key: m.id, value: m.id }, m.label); })
                      )
                    : h('input', { style: Object.assign({}, inputStyle, { flex: 1 }), value: fb, placeholder: 'provider/model-id (e.g. openai/gpt-4o)', onChange: function(e) { updateFallback(idx, e.target.value); } }),
                  h('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--danger)', flexShrink: 0 }, onClick: function() { removeFallback(idx); } }, '\u2715')
                );
              }),
              h('button', { className: 'btn btn-ghost btn-sm', onClick: addFallback, style: { justifySelf: 'start' } }, '+ Add Fallback Model')
            ),

            // Settings row
            h('div', { style: rowStyle },
              h('div', { style: fieldGroupStyle },
                h('label', { style: labelStyle }, 'Max Retries per Model'),
                h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: form.maxRetries, onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { maxRetries: e.target.value }); }); } },
                  h('option', { value: 1 }, '1'),
                  h('option', { value: 2 }, '2 (recommended)'),
                  h('option', { value: 3 }, '3'),
                  h('option', { value: 5 }, '5')
                )
              ),
              h('div', { style: fieldGroupStyle },
                h('label', { style: labelStyle }, 'Retry Delay (ms)'),
                h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: form.retryDelayMs, onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { retryDelayMs: e.target.value }); }); } },
                  h('option', { value: 500 }, '500ms'),
                  h('option', { value: 1000 }, '1,000ms (recommended)'),
                  h('option', { value: 2000 }, '2,000ms'),
                  h('option', { value: 5000 }, '5,000ms')
                )
              )
            )
          )
        )
      : h(Fragment, null,
          fb.enabled === false
            ? h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'Model fallback is disabled.')
            : (fb.fallbacks || []).length > 0
              ? h(Fragment, null,
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 } },
                    h('span', { className: 'badge badge-success', style: { fontSize: 11 } }, 'Enabled'),
                    h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, (fb.fallbacks.length) + ' fallback' + (fb.fallbacks.length > 1 ? 's' : '') + ' \u00B7 ' + (fb.maxRetries || 2) + ' retries \u00B7 ' + (fb.retryDelayMs || 1000) + 'ms delay')
                  ),
                  h('div', { style: { display: 'grid', gap: 6 } },
                    fb.fallbacks.map(function(m, i) {
                      return h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' } },
                        h('span', { style: { fontSize: 11, color: 'var(--text-muted)', width: 20 } }, '#' + (i + 1)),
                        h('span', { className: 'badge badge-info', style: { fontSize: 11, fontFamily: 'var(--font-mono)' } }, m.split('/').pop()),
                        h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, m.split('/')[0])
                      );
                    })
                  )
                )
              : h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'No fallback models configured \u2014 if the primary model fails, requests will error.')
        )
  );
}

// ─── Heartbeat Configuration Card ───

function HeartbeatCard(props) {
  var config = props.config;
  var saving = props.saving;
  var modelObj = props.modelObj;
  var modelStr = props.modelStr;
  var saveUpdates = props.saveUpdates;

  var hb = config.heartbeat || {};
  var _editing = useState(false);
  var editing = _editing[0]; var setEditing = _editing[1];
  var _form = useState({});
  var form = _form[0]; var setForm = _form[1];

  function startEdit() {
    setForm({
      enabled: hb.enabled !== false,
      intervalMinutes: hb.intervalMinutes || 30,
      activeHoursStart: hb.activeHoursStart != null ? hb.activeHoursStart : 8,
      activeHoursEnd: hb.activeHoursEnd != null ? hb.activeHoursEnd : 23,
      prompt: hb.prompt || '',
      tokensPerBeat: hb.tokensPerBeat || 3000,
    });
    setEditing(true);
  }

  function save() {
    saveUpdates({
      heartbeat: {
        enabled: form.enabled,
        intervalMinutes: parseInt(form.intervalMinutes) || 30,
        activeHoursStart: parseInt(form.activeHoursStart),
        activeHoursEnd: parseInt(form.activeHoursEnd),
        prompt: form.prompt || '',
        tokensPerBeat: parseInt(form.tokensPerBeat) || 3000,
      }
    }, function() { setEditing(false); });
  }

  var modelId = modelStr || modelObj.modelId || '';
  var est = estimateHeartbeatCost(modelId, editing ? (parseInt(form.intervalMinutes) || 30) : (hb.intervalMinutes || 30), editing ? (parseInt(form.tokensPerBeat) || 3000) : (hb.tokensPerBeat || 3000));

  var INTERVAL_OPTIONS = [
    { value: 5, label: 'Every 5 minutes' },
    { value: 10, label: 'Every 10 minutes' },
    { value: 15, label: 'Every 15 minutes' },
    { value: 30, label: 'Every 30 minutes (recommended)' },
    { value: 60, label: 'Every 1 hour' },
    { value: 120, label: 'Every 2 hours' },
    { value: 360, label: 'Every 6 hours' },
    { value: 720, label: 'Every 12 hours' },
    { value: 1440, label: 'Once a day' },
  ];

  var hours = [];
  for (var i = 0; i < 24; i++) { hours.push({ value: i, label: (i === 0 ? '12' : i > 12 ? '' + (i - 12) : '' + i) + ':00 ' + (i < 12 ? 'AM' : 'PM') }); }

  return h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
    h(CardHeader, {
      title: 'Heartbeat',
      help: h(HelpButton, { label: 'Heartbeat Configuration' },
        h('p', null, 'Heartbeats are periodic check-ins where the agent wakes up, checks for pending work (emails, calendar, notifications), and takes proactive action.'),
        h('h4', { style: _h4 }, 'Settings'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Interval'), ' — How often the agent checks in. Shorter = more responsive but more expensive.'),
          h('li', null, h('strong', null, 'Active Hours'), ' — Only run heartbeats during these hours (agent\'s timezone). Saves cost overnight.'),
          h('li', null, h('strong', null, 'Custom Prompt'), ' — Override the default heartbeat prompt. Use this to tell the agent what to check during heartbeats.'),
          h('li', null, h('strong', null, 'Tokens per Beat'), ' — Estimated tokens consumed per heartbeat cycle (used for cost projection).')
        ),
        h('h4', { style: _h4 }, 'Cost Impact'),
        h('p', null, 'Each heartbeat is a full LLM call. A 30-minute interval = 48 calls/day. The cost estimate below uses your current default model\'s pricing.'),
        h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Use a cheaper model for heartbeats via Model Routing (set the "Scheduling" context). A 30-min interval with Haiku costs ~$0.10/day vs ~$5/day with Opus.')
      ),
      editing: editing,
      saving: saving,
      onEdit: startEdit,
      onSave: save,
      onCancel: function() { setEditing(false); }
    }),

    // Cost estimate banner (always visible)
    h('div', { style: { display: 'flex', gap: 16, padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', marginBottom: 16, alignItems: 'center' } },
      h('div', { style: { flex: 1 } },
        h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 } }, 'Estimated Cost'),
        h('div', { style: { fontSize: 16, fontWeight: 700 } }, '$' + est.dailyCost.toFixed(2) + '/day'),
        h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, '\u2248 $' + est.monthlyCost.toFixed(2) + '/month')
      ),
      h('div', { style: { flex: 1 } },
        h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 } }, 'Beats/Day'),
        h('div', { style: { fontSize: 16, fontWeight: 700 } }, '' + est.beatsPerDay)
      ),
      h('div', { style: { flex: 1 } },
        h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 } }, 'Model'),
        h('div', { style: { fontSize: 12, fontFamily: 'var(--font-mono)' } }, modelId ? modelId.split('/').pop() : 'Not set')
      )
    ),

    editing
      ? h(Fragment, null,
          // Enable toggle
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 } },
            h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 } },
              h('input', { type: 'checkbox', checked: form.enabled, onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { enabled: e.target.checked }); }); } }),
              'Enable heartbeat'
            )
          ),

          form.enabled && h(Fragment, null,
            // Interval
            h('div', { style: fieldGroupStyle },
              h('label', { style: labelStyle }, 'Interval'),
              h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: form.intervalMinutes, onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { intervalMinutes: e.target.value }); }); } },
                INTERVAL_OPTIONS.map(function(o) { return h('option', { key: o.value, value: o.value }, o.label); })
              )
            ),

            // Active hours
            h('div', { style: rowStyle },
              h('div', { style: fieldGroupStyle },
                h('label', { style: labelStyle }, 'Active From'),
                h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: form.activeHoursStart, onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { activeHoursStart: e.target.value }); }); } },
                  hours.map(function(hr) { return h('option', { key: hr.value, value: hr.value }, hr.label); })
                )
              ),
              h('div', { style: fieldGroupStyle },
                h('label', { style: labelStyle }, 'Active Until'),
                h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: form.activeHoursEnd, onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { activeHoursEnd: e.target.value }); }); } },
                  hours.map(function(hr) { return h('option', { key: hr.value, value: hr.value }, hr.label); })
                )
              )
            ),
            h('p', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: -8, marginBottom: 16 } },
              'Heartbeats only run between these hours. Set to 12:00 AM \u2013 12:00 AM for 24/7.'
            ),

            // Tokens per beat
            h('div', { style: fieldGroupStyle },
              h('label', { style: labelStyle }, 'Estimated Tokens per Beat'),
              h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: form.tokensPerBeat, onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { tokensPerBeat: e.target.value }); }); } },
                h('option', { value: 1000 }, '~1K (minimal — just HEARTBEAT_OK)'),
                h('option', { value: 3000 }, '~3K (typical — light checks)'),
                h('option', { value: 5000 }, '~5K (moderate — email/calendar checks)'),
                h('option', { value: 10000 }, '~10K (heavy — full inbox scan + actions)')
              )
            ),

            // Custom prompt
            h('div', { style: fieldGroupStyle },
              h('label', { style: labelStyle }, 'Custom Heartbeat Prompt (optional)'),
              h('textarea', {
                style: Object.assign({}, inputStyle, { minHeight: 60, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }),
                value: form.prompt,
                onChange: function(e) { setForm(function(f) { return Object.assign({}, f, { prompt: e.target.value }); }); },
                placeholder: 'Leave empty for default. E.g.: Check emails, calendar events in next 2h, and Slack mentions.'
              }),
              h('p', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'This prompt is sent to the agent each heartbeat cycle. The agent can reply HEARTBEAT_OK if nothing needs attention.')
            )
          )
        )
      : h(Fragment, null,
          hb.enabled === false
            ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('span', { className: 'badge badge-neutral', style: { fontSize: 11 } }, 'Disabled'),
                h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'Heartbeat is turned off. Agent won\'t check in proactively.')
              )
            : h(Fragment, null,
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
                  h('span', { className: 'badge badge-success', style: { fontSize: 11 } }, 'Enabled'),
                  h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } },
                    'Every ' + (hb.intervalMinutes || 30) + ' min' +
                    (hb.activeHoursStart != null ? ' \u00B7 ' + (hb.activeHoursStart === 0 ? '12' : hb.activeHoursStart > 12 ? (hb.activeHoursStart - 12) : hb.activeHoursStart) + ':00' + (hb.activeHoursStart < 12 ? 'AM' : 'PM') + '\u2013' + (hb.activeHoursEnd === 0 ? '12' : hb.activeHoursEnd > 12 ? (hb.activeHoursEnd - 12) : hb.activeHoursEnd) + ':00' + (hb.activeHoursEnd < 12 ? 'AM' : 'PM') : ' \u00B7 24/7')
                  )
                ),
                hb.prompt && h('div', { style: { padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'auto' } }, hb.prompt)
              )
        )
  );
}

// ─── Main Component ───

export function ConfigurationSection(props) {
  var agentId = props.agentId;
  var engineAgent = props.engineAgent;
  var reload = props.reload;
  var toast = useApp().toast;

  var ea = engineAgent || {};
  var config = ea.config || {};
  var identity = config.identity || {};
  var modelObj = typeof config.model === 'object' ? config.model : {};
  var modelStr = typeof config.model === 'string' ? config.model : null;

  // Provider list (shared across all cards)
  var _providers = useState([]);
  var providers = _providers[0]; var setProviders = _providers[1];

  useEffect(function() {
    apiCall('/providers').then(function(d) { setProviders(d.providers || []); }).catch(function() {});
  }, []);

  // ─── Per-card edit state ───
  var _editingModel = useState(false);
  var editingModel = _editingModel[0]; var setEditingModel = _editingModel[1];
  var _editingVoice = useState(false);
  var editingVoice = _editingVoice[0]; var setEditingVoice = _editingVoice[1];
  var _editingRouting = useState(false);
  var editingRouting = _editingRouting[0]; var setEditingRouting = _editingRouting[1];
  var _editingDesc = useState(false);
  var editingDesc = _editingDesc[0]; var setEditingDesc = _editingDesc[1];

  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];

  // ─── Per-card form state ───
  var _modelForm = useState({});
  var modelForm = _modelForm[0]; var setModelForm = _modelForm[1];
  var _voiceForm = useState({});
  var voiceForm = _voiceForm[0]; var setVoiceForm = _voiceForm[1];
  var _routingForm = useState({});
  var routingForm = _routingForm[0]; var setRoutingForm = _routingForm[1];
  var _descForm = useState({});
  var descForm = _descForm[0]; var setDescForm = _descForm[1];

  // ─── Save helper ───
  var saveUpdates = function(updates, onDone) {
    setSaving(true);
    var isRunning = ea.state === 'running' || ea.state === 'active' || ea.state === 'degraded';
    var endpoint = isRunning ? '/agents/' + agentId + '/hot-update' : '/agents/' + agentId + '/config';
    var method = isRunning ? 'POST' : 'PATCH';
    engineCall(endpoint, { method: method, body: JSON.stringify({ updates: updates, updatedBy: 'dashboard' }) })
      .then(function() { toast('Saved', 'success'); setSaving(false); if (onDone) onDone(); reload(); })
      .catch(function(err) { toast('Failed: ' + err.message, 'error'); setSaving(false); });
  };

  // ─── Render ───

  var configuredProviders = providers.filter(function(p) { return p.configured; });
  var displayProvider = modelObj.provider || 'Not set';
  var displayModel = modelStr || modelObj.modelId || 'Not set';
  var displayThinking = modelObj.thinkingLevel || 'medium';
  var displayDescription = identity.description || config.description || '';

  return h(Fragment, null,
    h('h3', { style: { margin: '0 0 20px', fontSize: 16, fontWeight: 600 } }, 'Configuration'),

    // ═══ Card 1: Default LLM Model ═══
    h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
      h(CardHeader, {
        title: 'Default LLM Model',
        help: h(HelpButton, { label: 'Default LLM Model' },
          h('p', null, 'The primary AI model this agent uses for all conversations and tasks.'),
          h('h4', { style: _h4 }, 'Settings'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Provider'), ' — The AI provider (Anthropic, OpenAI, Google, etc.). Must have an API key configured in Settings > API Keys.'),
            h('li', null, h('strong', null, 'Model'), ' — The specific model to use (e.g., claude-sonnet-4-20250514, gpt-4o). Newer models are generally smarter but cost more.'),
            h('li', null, h('strong', null, 'Thinking Level'), ' — Extended reasoning capability. Higher levels let the model "think step by step" before responding, improving quality for complex tasks at the cost of more tokens.')
          ),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Use Model Routing below to assign different models for different task types — e.g., a cheaper model for chat and a smarter one for complex tasks.')
        ),
        editing: editingModel,
        saving: saving,
        onEdit: function() {
          setModelForm({ provider: modelObj.provider || '', modelId: modelStr || modelObj.modelId || '', thinkingLevel: modelObj.thinkingLevel || 'medium' });
          setEditingModel(true);
        },
        onSave: function() {
          saveUpdates({ model: { provider: modelForm.provider, modelId: modelForm.modelId, thinkingLevel: modelForm.thinkingLevel } }, function() { setEditingModel(false); });
        },
        onCancel: function() { setEditingModel(false); }
      }),

      editingModel
        ? h(Fragment, null,
            h(ProviderModelPicker, {
              provider: modelForm.provider,
              modelId: modelForm.modelId,
              providers: providers,
              onChange: function(p, m) { setModelForm(function(f) { return Object.assign({}, f, { provider: p, modelId: m }); }); }
            }),
            h('div', { style: fieldGroupStyle },
              h('label', { style: labelStyle }, 'Thinking Level'),
              h('select', { style: Object.assign({}, inputStyle, { cursor: 'pointer' }), value: modelForm.thinkingLevel, onChange: function(e) { setModelForm(function(f) { return Object.assign({}, f, { thinkingLevel: e.target.value }); }); } },
                h('option', { value: 'off' }, 'Off'),
                h('option', { value: 'low' }, 'Low (2K tokens)'),
                h('option', { value: 'medium' }, 'Medium (8K tokens)'),
                h('option', { value: 'high' }, 'High (16K tokens)')
              ),
              h('p', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'Extended thinking for step-by-step reasoning. Higher = better but slower.')
            )
          )
        : h(Fragment, null,
            h('div', { style: rowStyle },
              h('div', { style: fieldGroupStyle },
                h('div', { style: labelStyle }, 'Provider'),
                h('div', { style: { fontSize: 14, textTransform: 'capitalize' } }, displayProvider)
              ),
              h('div', { style: fieldGroupStyle },
                h('div', { style: labelStyle }, 'Model'),
                h('div', { style: { fontSize: 13, fontFamily: 'var(--font-mono)' } }, displayModel)
              )
            ),
            h('div', { style: fieldGroupStyle },
              h('div', { style: labelStyle }, 'Thinking Level'),
              h('span', { className: 'badge badge-' + (displayThinking === 'high' ? 'primary' : displayThinking === 'medium' ? 'info' : 'neutral'), style: { textTransform: 'capitalize' } }, displayThinking)
            )
          )
    ),

    // ═══ Card 2: Model Routing ═══
    h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
      h(CardHeader, {
        title: 'Model Routing',
        help: h(HelpButton, { label: 'Model Routing' },
          h('p', null, 'Assign different AI models to different types of tasks. This lets you optimize for cost and quality.'),
          h('h4', { style: _h4 }, 'Task Types'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Chat'), ' — Real-time conversations (Slack, Teams, WhatsApp). Usually benefits from a fast model.'),
            h('li', null, h('strong', null, 'Meeting'), ' — Meeting summaries and follow-ups. Often needs a larger context window.'),
            h('li', null, h('strong', null, 'Email'), ' — Composing and replying to emails. Benefits from a capable writing model.'),
            h('li', null, h('strong', null, 'Task'), ' — Delegated tasks from managers or other agents.'),
            h('li', null, h('strong', null, 'Scheduling'), ' — Calendar management and scheduling tasks.')
          ),
          h('p', null, 'Leave a route empty to use the Default LLM Model for that task type.'),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Use cheaper models (e.g., claude-haiku, gpt-4o-mini) for simple chat and expensive ones (claude-opus, gpt-4o) for complex tasks to save costs.')
        ),
        editing: editingRouting,
        saving: saving,
        onEdit: function() {
          var r = config.modelRouting || {};
          var vc = config.voiceConfig || {};
          setRoutingForm({
            chat: r.chat || vc.chatModel || '',
            meeting: r.meeting || vc.meetingModel || '',
            email: r.email || '',
            task: r.task || '',
            scheduling: r.scheduling || '',
          });
          setEditingRouting(true);
        },
        onSave: function() {
          // Clean routing: strip entries with provider but no model (e.g. "anthropic/")
          var cleanRouting = {};
          Object.keys(routingForm).forEach(function(k) {
            var v = routingForm[k] || '';
            cleanRouting[k] = v.endsWith('/') ? '' : v;
          });
          saveUpdates({
            modelRouting: cleanRouting,
            voiceConfig: Object.assign({}, config.voiceConfig || {}, { chatModel: cleanRouting.chat || '', meetingModel: cleanRouting.meeting || '' }),
          }, function() { setEditingRouting(false); });
        },
        onCancel: function() { setEditingRouting(false); }
      }),

      editingRouting
        ? h(Fragment, null,
            h('p', { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 } },
              'Assign different models to different tasks. Select provider first, then model. Unset contexts use the default model.'
            ),
            configuredProviders.length === 0
              ? h('div', { style: { padding: 14, background: 'var(--warning-soft)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--warning)', marginBottom: 16 } },
                  'No AI providers configured. Go to ', h('strong', null, 'Settings \u2192 Integrations'), ' to add API keys first.'
                )
              : null,
            MODEL_CONTEXTS.map(function(ctx) {
              return h(RoutingRowEditor, {
                key: ctx.key,
                ctx: ctx,
                value: routingForm[ctx.key] || '',
                providers: providers,
                onChange: function(v) { setRoutingForm(function(f) { var n = Object.assign({}, f); n[ctx.key] = v; return n; }); }
              });
            })
          )
        : h(Fragment, null,
            (function() {
              var routing = config.modelRouting || {};
              var vc = config.voiceConfig || {};
              var entries = MODEL_CONTEXTS.map(function(ctx) {
                var val = routing[ctx.key] || (ctx.key === 'chat' ? vc.chatModel : ctx.key === 'meeting' ? vc.meetingModel : '') || '';
                return { label: ctx.label, value: val, desc: ctx.desc };
              });
              var hasAny = entries.some(function(e) { return e.value; });
              if (!hasAny) return h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'No model routing configured \u2014 all tasks use the default model.');
              return h('div', { style: { display: 'grid', gap: 8 } },
                entries.map(function(e) {
                  return h('div', { key: e.label, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' } },
                    h('div', null,
                      h('span', { style: { fontSize: 13, fontWeight: 600 } }, e.label),
                      h('span', { style: { fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 } }, e.desc)
                    ),
                    e.value
                      ? h('span', { className: 'badge badge-info', style: { fontSize: 11, fontFamily: 'var(--font-mono)' } }, e.value.split('/').pop())
                      : h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Default')
                  );
                })
              );
            })()
          )
    ),

    // ═══ Card 3: Model Fallback / Backup Providers ═══
    h(ModelFallbackCard, { config: config, saving: saving, providers: providers, saveUpdates: saveUpdates }),

    // ═══ Card 4: Heartbeat Configuration ═══
    h(HeartbeatCard, { config: config, saving: saving, modelObj: modelObj, modelStr: modelStr, saveUpdates: saveUpdates }),

    // ═══ Card 5: Meeting Voice ═══
    h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
      h(CardHeader, {
        title: 'Meeting Voice (ElevenLabs)',
        help: h(HelpButton, { label: 'Meeting Voice' },
          h('p', null, 'Configure a text-to-speech voice for this agent to use in meetings and voice interactions via ElevenLabs.'),
          h('ul', { style: _ul },
            h('li', null, 'The voice ID comes from your ElevenLabs dashboard (elevenlabs.io > Voices > Copy Voice ID).'),
            h('li', null, 'Name is just a label for your reference.')
          ),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'ElevenLabs offers free tier voices. Clone a custom voice for your agent\'s unique identity.')
        ),
        editing: editingVoice,
        saving: saving,
        onEdit: function() {
          setVoiceForm({ voiceId: config.voiceConfig?.voiceId || '', voiceName: config.voiceConfig?.voiceName || '' });
          setEditingVoice(true);
        },
        onSave: function() {
          saveUpdates({
            voiceConfig: Object.assign({}, config.voiceConfig || {}, { voiceId: voiceForm.voiceId, voiceName: voiceForm.voiceName }),
          }, function() { setEditingVoice(false); });
        },
        onCancel: function() { setEditingVoice(false); }
      }),

      editingVoice
        ? h(VoiceSelector, {
            voiceId: voiceForm.voiceId || '',
            voiceName: voiceForm.voiceName || '',
            onChange: function(id, name) { setVoiceForm({ voiceId: id, voiceName: name }); }
          })
        : config.voiceConfig?.voiceName || config.voiceConfig?.voiceId
          ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
              h('div', { style: { width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18 } }, E.microphone ? E.microphone(20) : '\u{1F3A4}'),
              h('div', null,
                h('div', { style: { fontSize: 14, fontWeight: 600 } }, config.voiceConfig.voiceName || 'Custom Voice'),
                h('div', { style: { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' } }, config.voiceConfig.voiceId || '')
              )
            )
          : h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'No voice configured \u2014 agent uses text only in meetings')
    ),

    // ═══ Card 6: Description ═══
    h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
      h(CardHeader, {
        title: 'Description',
        help: h(HelpButton, { label: 'Agent Description' },
          h('p', null, 'A human-readable description of what this agent does. This is shown to other agents and team members, and is included in the agent\'s system prompt to help it understand its role.'),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Be specific about the agent\'s responsibilities. "Handles customer support for billing questions" is better than "support agent".')
        ),
        editing: editingDesc,
        saving: saving,
        onEdit: function() {
          setDescForm({ description: displayDescription });
          setEditingDesc(true);
        },
        onSave: function() {
          saveUpdates({
            description: descForm.description,
            identity: Object.assign({}, identity, { description: descForm.description }),
          }, function() { setEditingDesc(false); });
        },
        onCancel: function() { setEditingDesc(false); }
      }),

      editingDesc
        ? h('textarea', { style: Object.assign({}, inputStyle, { minHeight: 80, resize: 'vertical' }), value: descForm.description || '', onChange: function(e) { setDescForm({ description: e.target.value }); }, placeholder: 'What does this agent do?' })
        : h('div', { style: { fontSize: 14, color: displayDescription ? 'var(--text-primary)' : 'var(--text-muted)', lineHeight: 1.6 } }, displayDescription || 'No description set.')
    ),

    // ═══ Card 7: Soul Template (only if set) ═══
    config.soulId && h('div', { className: 'card', style: { padding: 20 } },
      h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Role Template'),
      h('span', { className: 'badge badge-primary' }, config.soulId.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }))
    )
  );
}
