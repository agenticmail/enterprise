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
        onChange(p && m ? p + '/' + m : '');
      }
    }),
    h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' } }, 'Recommended: ' + ctx.rec),
    value && h('button', { className: 'btn btn-ghost btn-sm', style: { marginTop: 6, fontSize: 11 }, onClick: function() { onChange(''); } }, 'Reset to default')
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
          saveUpdates({
            modelRouting: routingForm,
            voiceConfig: Object.assign({}, config.voiceConfig || {}, { chatModel: routingForm.chat || '', meetingModel: routingForm.meeting || '' }),
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

    // ═══ Card 3: Meeting Voice ═══
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

    // ═══ Card 4: Description ═══
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

    // ═══ Card 5: Soul Template (only if set) ═══
    config.soulId && h('div', { className: 'card', style: { padding: 20 } },
      h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Role Template'),
      h('span', { className: 'badge badge-primary' }, config.soulId.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }))
    )
  );
}
