import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { TimezoneSelect } from '../../components/timezones.js';
import { CULTURES, LANGUAGES, DEFAULT_TRAITS, computeAge, PersonaForm } from '../../components/persona-fields.js';
import { TagInput } from '../../components/tag-input.js';
import { Badge, StatCard, formatTime } from './shared.js?v=4';

// ════════════════════════════════════════════════════════════
// PERSONAL DETAILS SECTION
// ════════════════════════════════════════════════════════════

var ROLE_OPTIONS = ['agent', 'assistant', 'manager', 'specialist', 'analyst', 'coordinator', 'advisor', 'support', 'engineer', 'other'];

export function PersonalDetailsSection(props) {
  var agentId = props.agentId;
  var engineAgent = props.engineAgent;
  var reload = props.reload;
  var toast = useApp().toast;

  var ea = engineAgent || {};
  var config = ea.config || {};
  var identity = config.identity || {};

  var _editing = useState(false);
  var editing = _editing[0]; var setEditing = _editing[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];

  // Build form state from current config
  var _form = useState({});
  var form = _form[0]; var setForm = _form[1];

  // Initialize form when entering edit mode
  var startEdit = function() {
    setForm({
      name: identity.name || config.name || config.displayName || ea.name || '',
      displayName: config.displayName || identity.name || '',
      email: identity.email || config.email || ea.email || '',
      role: identity.role || config.role || 'agent',
      avatar: identity.avatar || null,
      gender: identity.gender || '',
      dateOfBirth: identity.dateOfBirth || '',
      maritalStatus: identity.maritalStatus || '',
      culturalBackground: identity.culturalBackground || '',
      language: identity.language || 'en-us',
      description: identity.description || config.description || '',
      traits: identity.traits && typeof identity.traits === 'object' && !Array.isArray(identity.traits)
        ? Object.assign({}, DEFAULT_TRAITS, identity.traits)
        : Object.assign({}, DEFAULT_TRAITS),
      // voice config moved to Configuration tab
    });
    setEditing(true);
  };

  var set = function(key, value) {
    setForm(function(prev) {
      var next = Object.assign({}, prev);
      next[key] = value;
      return next;
    });
  };

  var saveDetails = function() {
    setSaving(true);
    var updates = {
      name: form.name,
      displayName: form.displayName,
      email: form.email,
      description: form.description,
      identity: Object.assign({}, identity, {
        role: form.role,
        avatar: form.avatar,
        gender: form.gender,
        dateOfBirth: form.dateOfBirth,
        maritalStatus: form.maritalStatus,
        culturalBackground: form.culturalBackground,
        language: form.language,
        description: form.description,
        traits: form.traits,
        name: form.name,
        email: form.email,
      }),
      // voiceConfig moved to Configuration tab
    };

    // Use hot-update if running, else regular config update
    var isRunning = ea.state === 'running' || ea.state === 'active' || ea.state === 'degraded';
    var endpoint = isRunning
      ? '/agents/' + agentId + '/hot-update'
      : '/agents/' + agentId + '/config';
    var method = isRunning ? 'POST' : 'PATCH';

    engineCall(endpoint, {
      method: method,
      body: JSON.stringify({ updates: updates, updatedBy: 'dashboard' })
    }).then(function() {
      toast('Personal details saved', 'success');
      setEditing(false);
      setSaving(false);
      reload();
    }).catch(function(err) {
      toast('Failed to save: ' + err.message, 'error');
      setSaving(false);
    });
  };

  // ─── Display helpers ───────────────────────────────────

  var inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 };
  var labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  var fieldGroupStyle = { marginBottom: 16 };
  var rowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };
  var selectStyle = Object.assign({}, inputStyle, { cursor: 'pointer' });

  // ─── View Mode ─────────────────────────────────────────

  if (!editing) {
    var displayName = identity.name || config.name || config.displayName || ea.name || '—';
    var displayDisplayName = config.displayName || identity.name || '—';
    var displayEmail = identity.email || config.email || ea.email || '—';
    var displayRole = identity.role || config.role || 'agent';
    var displayAvatar = identity.avatar || '';
    var displayGender = identity.gender || '—';
    var displayDob = identity.dateOfBirth || '—';
    var displayMarital = identity.maritalStatus || '—';
    var displayCulture = identity.culturalBackground || '';
    var displayLang = identity.language || '—';
    var displayDesc = identity.description || config.description || '—';
    var displayTraits = identity.traits && typeof identity.traits === 'object' && !Array.isArray(identity.traits) ? identity.traits : {};
    var age = computeAge(identity.dateOfBirth);

    var cultureName = displayCulture ? (CULTURES.find(function(c) { return c.id === displayCulture; }) || {}).name || displayCulture : '—';
    var langName = displayLang !== '—' ? (LANGUAGES.find(function(l) { return l.id === displayLang; }) || {}).name || displayLang : '—';

    var fieldView = function(label, value) {
      return h('div', { style: fieldGroupStyle },
        h('div', { style: labelStyle }, label),
        h('div', { style: { fontSize: 14, color: 'var(--text-primary)' } }, value)
      );
    };

    return h(Fragment, null,
      // Header with Edit button
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
        h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, 'Personal Details'),
        h('button', { className: 'btn btn-primary btn-sm', onClick: startEdit }, I.journal(), ' Edit Details')
      ),

      // Avatar + Identity Card
      h('div', { className: 'card', style: { marginBottom: 20 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 20, padding: 20 } },
          h('div', { style: {
            width: 80, height: 80, borderRadius: '50%', flexShrink: 0,
            background: displayAvatar && displayAvatar.length > 2 ? 'none' : 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, fontWeight: 700, color: '#fff', overflow: 'hidden',
            border: '3px solid var(--border)'
          } },
            displayAvatar && displayAvatar.length > 2
              ? h('img', { src: displayAvatar, style: { width: '100%', height: '100%', objectFit: 'cover' } })
              : (displayName !== '—' ? displayName.charAt(0).toUpperCase() : '?')
          ),
          h('div', { style: { flex: 1 } },
            h('div', { style: { fontSize: 22, fontWeight: 700, marginBottom: 4 } }, displayName),
            displayDisplayName !== '—' && h('div', { style: { fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 } }, displayDisplayName),
            h('div', { style: { fontSize: 13, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-muted)', marginBottom: 6 } }, displayEmail),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('span', { className: 'badge badge-primary', style: { textTransform: 'capitalize' } }, displayRole),
              age !== null && h('span', { style: { padding: '2px 10px', background: 'var(--accent-soft)', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 600, color: 'var(--accent-text)' } }, age + ' years old')
            )
          )
        )
      ),

      // Identity Details Grid
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Identity Details'),
        h('div', { style: rowStyle },
          fieldView('Gender', displayGender),
          fieldView('Date of Birth', displayDob !== '—' ? displayDob + (age !== null ? ' (' + age + ' years old)' : '') : '—')
        ),
        h('div', { style: rowStyle },
          fieldView('Marital Status', displayMarital),
          fieldView('Language', langName)
        ),
        fieldView('Cultural Background', cultureName)
      ),

      // Description
      h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
        h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Description'),
        fieldView('Description', displayDesc)
      ),

      // Personality Traits
      h('div', { className: 'card', style: { padding: 20 } },
        h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Personality Traits'),
        Object.keys(displayTraits).length > 0
          ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
              Object.entries(displayTraits).map(function(pair) {
                return h('div', { key: pair[0], style: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)' } },
                  h('span', { style: { fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' } }, pair[0] + ':'),
                  h('span', { style: { fontSize: 13, fontWeight: 600, textTransform: 'capitalize' } }, pair[1])
                );
              })
            )
          : h('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'No traits configured')
      ),

      // Voice config moved to Configuration tab
    );
  }

  // ─── Edit Mode — uses shared PersonaForm ───────────────

  return h(Fragment, null,
    // Header
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, 'Edit Personal Details'),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { className: 'btn btn-primary btn-sm', disabled: saving, onClick: saveDetails }, saving ? 'Saving...' : 'Save Changes'),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { setEditing(false); } }, 'Cancel')
      )
    ),

    // Core Identity Fields (name, display name, email, role)
    h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
      h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Core Identity'),

      h('div', { style: rowStyle },
        h('div', { style: fieldGroupStyle },
          h('label', { style: labelStyle }, 'Name'),
          h('input', { className: 'input', type: 'text', value: form.name, placeholder: 'Agent name', onChange: function(e) { set('name', e.target.value); } })
        ),
        h('div', { style: fieldGroupStyle },
          h('label', { style: labelStyle }, 'Display Name'),
          h('input', { className: 'input', type: 'text', value: form.displayName, placeholder: 'Display name (optional)', onChange: function(e) { set('displayName', e.target.value); } })
        )
      ),

      h('div', { style: rowStyle },
        h('div', { style: fieldGroupStyle },
          h('label', { style: labelStyle }, 'Email'),
          h('input', { className: 'input', type: 'email', value: form.email, placeholder: 'agent@company.com', onChange: function(e) { set('email', e.target.value); } })
        ),
        h('div', { style: fieldGroupStyle },
          h('label', { style: labelStyle }, 'Role'),
          h('select', { className: 'input', style: { cursor: 'pointer' }, value: form.role, onChange: function(e) { set('role', e.target.value); } },
            ROLE_OPTIONS.map(function(r) { return h('option', { key: r, value: r }, r.charAt(0).toUpperCase() + r.slice(1)); })
          )
        )
      ),

      h('div', { style: fieldGroupStyle },
        h('label', { style: labelStyle }, 'Description'),
        h('textarea', { className: 'input', style: { minHeight: 80, resize: 'vertical' }, value: form.description, placeholder: 'Describe what this agent does...', onChange: function(e) { set('description', e.target.value); } })
      )
    ),

    // Persona Form (shared component: avatar, DOB, gender, marital, culture, language, traits)
    h('div', { className: 'card', style: { padding: 20, marginBottom: 20 } },
      h('h4', { style: { margin: '0 0 16px', fontSize: 14, fontWeight: 600 } }, 'Persona & Identity'),
      h(PersonaForm, { form: form, set: set, toast: toast })
    ),

    // Voice config moved to Configuration tab

    // Bottom save bar
    h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
      h('button', { className: 'btn btn-primary', disabled: saving, onClick: saveDetails }, saving ? 'Saving...' : 'Save All Changes'),
      h('button', { className: 'btn btn-ghost', onClick: function() { setEditing(false); } }, 'Cancel')
    )
  );
}

// ════════════════════════════════════════════════════════════
// VOICE SELECTOR
// ════════════════════════════════════════════════════════════

var BUILTIN_VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'Female', accent: 'American', style: 'Soft, warm' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'Female', accent: 'American', style: 'Calm, professional' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'Female', accent: 'British', style: 'Sophisticated' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'Female', accent: 'British', style: 'Warm, engaging' },
  { id: 'jBpfuIE2acCO8z3wKNLl', name: 'Emily', gender: 'Female', accent: 'American', style: 'Calm, gentle' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'Male', accent: 'American', style: 'Deep, narrative' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'Male', accent: 'American', style: 'Well-rounded, conversational' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', gender: 'Male', accent: 'American', style: 'Crisp, commanding' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', gender: 'Male', accent: 'American', style: 'Raspy, authentic' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', gender: 'Male', accent: 'American', style: 'Deep, warm' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: 'Male', accent: 'British', style: 'Authoritative, deep' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', gender: 'Male', accent: 'British', style: 'Intense, transatlantic' },
];

function VoiceSelector(props) {
  var voiceId = props.voiceId;
  var voiceName = props.voiceName;
  var onChange = props.onChange;

  var _customVoices = useState([]);
  var customVoices = _customVoices[0]; var setCustomVoices = _customVoices[1];
  var _loadingVoices = useState(false);
  var loadingVoices = _loadingVoices[0]; var setLoadingVoices = _loadingVoices[1];
  var _hasApiKey = useState(false);
  var hasApiKey = _hasApiKey[0]; var setHasApiKey = _hasApiKey[1];
  var _previewPlaying = useState(null);
  var previewPlaying = _previewPlaying[0]; var setPreviewPlaying = _previewPlaying[1];

  useEffect(function() {
    // Check if ElevenLabs integration is connected
    engineCall('/oauth/status/elevenlabs?orgId=' + getOrgId())
      .then(function(d) {
        if (d.connected) {
          setHasApiKey(true);
          // Fetch custom voices from ElevenLabs
          setLoadingVoices(true);
          engineCall('/integrations/elevenlabs/voices?orgId=' + getOrgId())
            .then(function(d) { setCustomVoices(d.voices || []); })
            .catch(function() {})
            .finally(function() { setLoadingVoices(false); });
        }
      })
      .catch(function() {});
  }, []);

  var allVoices = BUILTIN_VOICES.concat(customVoices.map(function(v) {
    return { id: v.voice_id, name: v.name, gender: v.labels?.gender || '', accent: v.labels?.accent || '', style: 'Custom', custom: true };
  }));

  var selectedVoice = allVoices.find(function(v) { return v.id === voiceId; });

  var cardStyle = function(v) {
    var isSelected = v.id === voiceId;
    return {
      padding: '12px 14px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
      border: '2px solid ' + (isSelected ? 'var(--brand-color, #6366f1)' : 'var(--border)'),
      background: isSelected ? 'var(--brand-color-soft, rgba(99,102,241,0.08))' : 'transparent',
    };
  };

  return h(Fragment, null,
    !hasApiKey && h('div', { style: { padding: 12, background: 'var(--warning-soft)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--warning)', marginBottom: 16 } },
      'Add your ElevenLabs API key in Settings \u2192 Integrations to enable voice. Built-in voices shown below will work once connected.'
    ),

    // Current selection
    voiceId && h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', marginBottom: 16 } },
      h('div', { style: { width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700 } }, (selectedVoice?.name || voiceName || '?').charAt(0)),
      h('div', { style: { flex: 1 } },
        h('div', { style: { fontSize: 14, fontWeight: 600 } }, selectedVoice?.name || voiceName || 'Custom Voice'),
        h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, voiceId)
      ),
      h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { onChange('', ''); } }, 'Clear')
    ),

    // Voice grid
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 } },
      allVoices.map(function(v) {
        return h('div', {
          key: v.id, style: cardStyle(v),
          onClick: function() { onChange(v.id, v.name); }
        },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } },
            h('strong', { style: { fontSize: 13 } }, v.name),
            v.custom && h('span', { className: 'badge badge-info', style: { fontSize: 10 } }, 'Custom')
          ),
          h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } },
            [v.gender, v.accent, v.style].filter(Boolean).join(' \u00B7 ')
          )
        );
      })
    ),

    loadingVoices && h('div', { style: { textAlign: 'center', padding: 12, color: 'var(--text-muted)', fontSize: 13 } }, 'Loading custom voices...'),

    // Manual voice ID input
    h('div', { style: { marginTop: 16 } },
      h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Or enter a voice ID manually'),
      h('input', {
        className: 'input', type: 'text', value: voiceId,
        placeholder: 'ElevenLabs voice ID...',
        onChange: function(e) { onChange(e.target.value, ''); }
      })
    )
  );
}

