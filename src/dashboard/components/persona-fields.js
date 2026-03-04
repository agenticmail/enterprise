/**
 * Shared Persona / Identity fields
 *
 * Reusable constants, avatar-upload handler, and PersonaForm component
 * used by both the Create-Agent wizard and the Agent-Detail "Personal" tab.
 */

import { h, useState, useRef, Fragment } from './utils.js';

// ─── Constants ───────────────────────────────────────────

export var CULTURES = [
  { id: 'north-american', name: 'North American', desc: 'Direct communication, informal greetings, action-oriented' },
  { id: 'british-european', name: 'British / European', desc: 'Polite understatement, structured formality, measured tone' },
  { id: 'latin-american', name: 'Latin American', desc: 'Warm, relationship-first, expressive and personable' },
  { id: 'middle-eastern', name: 'Middle Eastern', desc: 'Respectful, hospitable, context-aware formality' },
  { id: 'east-asian', name: 'East Asian', desc: 'Indirect harmony, respectful hierarchy, thoughtful precision' },
  { id: 'south-asian', name: 'South Asian', desc: 'Respectful, adaptable formality, relationship-aware' },
  { id: 'southeast-asian', name: 'Southeast Asian', desc: 'Gentle, diplomatic, consensus-seeking' },
  { id: 'african', name: 'African', desc: 'Community-oriented, warm, storytelling-rich' },
  { id: 'caribbean', name: 'Caribbean', desc: 'Friendly, vibrant, approachable warmth' },
  { id: 'australian-pacific', name: 'Australian / Pacific', desc: 'Casual, straightforward, egalitarian humor' },
];

export var LANGUAGES = [
  // English Variants
  { id: 'en-us', name: 'English (American)', group: 'English' },
  { id: 'en-gb', name: 'English (British)', group: 'English' },
  { id: 'en-au', name: 'English (Australian)', group: 'English' },
  { id: 'en-ca', name: 'English (Canadian)', group: 'English' },
  { id: 'en-in', name: 'English (Indian)', group: 'English' },
  { id: 'en-za', name: 'English (South African)', group: 'English' },
  { id: 'en-ie', name: 'English (Irish)', group: 'English' },
  { id: 'en-ng', name: 'English (Nigerian)', group: 'English' },
  // Spanish Variants
  { id: 'es', name: 'Spanish (Spain)', group: 'Spanish' },
  { id: 'es-mx', name: 'Spanish (Mexican)', group: 'Spanish' },
  { id: 'es-ar', name: 'Spanish (Argentine)', group: 'Spanish' },
  { id: 'es-co', name: 'Spanish (Colombian)', group: 'Spanish' },
  { id: 'es-latam', name: 'Spanish (Latin American)', group: 'Spanish' },
  // Portuguese Variants
  { id: 'pt', name: 'Portuguese (Portugal)', group: 'Portuguese' },
  { id: 'pt-br', name: 'Portuguese (Brazilian)', group: 'Portuguese' },
  // French Variants
  { id: 'fr', name: 'French (France)', group: 'French' },
  { id: 'fr-ca', name: 'French (Canadian)', group: 'French' },
  { id: 'fr-be', name: 'French (Belgian)', group: 'French' },
  { id: 'fr-ch', name: 'French (Swiss)', group: 'French' },
  { id: 'fr-af', name: 'French (African)', group: 'French' },
  // Chinese Variants
  { id: 'zh', name: 'Chinese (Mandarin Simplified)', group: 'Chinese' },
  { id: 'zh-tw', name: 'Chinese (Mandarin Traditional)', group: 'Chinese' },
  { id: 'zh-yue', name: 'Chinese (Cantonese)', group: 'Chinese' },
  // Arabic Variants
  { id: 'ar', name: 'Arabic (Modern Standard)', group: 'Arabic' },
  { id: 'ar-eg', name: 'Arabic (Egyptian)', group: 'Arabic' },
  { id: 'ar-sa', name: 'Arabic (Saudi)', group: 'Arabic' },
  { id: 'ar-ma', name: 'Arabic (Moroccan)', group: 'Arabic' },
  // European
  { id: 'de', name: 'German', group: 'European' },
  { id: 'de-at', name: 'German (Austrian)', group: 'European' },
  { id: 'de-ch', name: 'German (Swiss)', group: 'European' },
  { id: 'it', name: 'Italian', group: 'European' },
  { id: 'nl', name: 'Dutch', group: 'European' },
  { id: 'nl-be', name: 'Dutch (Belgian/Flemish)', group: 'European' },
  { id: 'ru', name: 'Russian', group: 'European' },
  { id: 'pl', name: 'Polish', group: 'European' },
  { id: 'uk', name: 'Ukrainian', group: 'European' },
  { id: 'cs', name: 'Czech', group: 'European' },
  { id: 'sk', name: 'Slovak', group: 'European' },
  { id: 'ro', name: 'Romanian', group: 'European' },
  { id: 'hu', name: 'Hungarian', group: 'European' },
  { id: 'bg', name: 'Bulgarian', group: 'European' },
  { id: 'hr', name: 'Croatian', group: 'European' },
  { id: 'sr', name: 'Serbian', group: 'European' },
  { id: 'sl', name: 'Slovenian', group: 'European' },
  { id: 'el', name: 'Greek', group: 'European' },
  { id: 'sv', name: 'Swedish', group: 'Nordic' },
  { id: 'no', name: 'Norwegian', group: 'Nordic' },
  { id: 'da', name: 'Danish', group: 'Nordic' },
  { id: 'fi', name: 'Finnish', group: 'Nordic' },
  { id: 'is', name: 'Icelandic', group: 'Nordic' },
  // Turkic & Central Asian
  { id: 'tr', name: 'Turkish', group: 'Turkic' },
  { id: 'az', name: 'Azerbaijani', group: 'Turkic' },
  { id: 'kk', name: 'Kazakh', group: 'Turkic' },
  { id: 'uz', name: 'Uzbek', group: 'Turkic' },
  // South Asian
  { id: 'hi', name: 'Hindi', group: 'South Asian' },
  { id: 'bn', name: 'Bengali', group: 'South Asian' },
  { id: 'ur', name: 'Urdu', group: 'South Asian' },
  { id: 'ta', name: 'Tamil', group: 'South Asian' },
  { id: 'te', name: 'Telugu', group: 'South Asian' },
  { id: 'mr', name: 'Marathi', group: 'South Asian' },
  { id: 'gu', name: 'Gujarati', group: 'South Asian' },
  { id: 'kn', name: 'Kannada', group: 'South Asian' },
  { id: 'ml', name: 'Malayalam', group: 'South Asian' },
  { id: 'pa', name: 'Punjabi', group: 'South Asian' },
  { id: 'si', name: 'Sinhala', group: 'South Asian' },
  { id: 'ne', name: 'Nepali', group: 'South Asian' },
  // East Asian
  { id: 'ja', name: 'Japanese', group: 'East Asian' },
  { id: 'ko', name: 'Korean', group: 'East Asian' },
  { id: 'mn', name: 'Mongolian', group: 'East Asian' },
  // Southeast Asian
  { id: 'th', name: 'Thai', group: 'Southeast Asian' },
  { id: 'vi', name: 'Vietnamese', group: 'Southeast Asian' },
  { id: 'id', name: 'Indonesian', group: 'Southeast Asian' },
  { id: 'ms', name: 'Malay', group: 'Southeast Asian' },
  { id: 'tl', name: 'Filipino (Tagalog)', group: 'Southeast Asian' },
  { id: 'my', name: 'Burmese', group: 'Southeast Asian' },
  { id: 'km', name: 'Khmer', group: 'Southeast Asian' },
  // African
  { id: 'yo', name: 'Yoruba', group: 'African' },
  { id: 'ig', name: 'Igbo', group: 'African' },
  { id: 'ha', name: 'Hausa', group: 'African' },
  { id: 'sw', name: 'Swahili', group: 'African' },
  { id: 'am', name: 'Amharic', group: 'African' },
  { id: 'zu', name: 'Zulu', group: 'African' },
  { id: 'xh', name: 'Xhosa', group: 'African' },
  { id: 'rw', name: 'Kinyarwanda', group: 'African' },
  { id: 'so', name: 'Somali', group: 'African' },
  { id: 'wo', name: 'Wolof', group: 'African' },
  // Other
  { id: 'he', name: 'Hebrew', group: 'Other' },
  { id: 'fa', name: 'Persian (Farsi)', group: 'Other' },
  { id: 'ka', name: 'Georgian', group: 'Other' },
  { id: 'hy', name: 'Armenian', group: 'Other' },
  { id: 'et', name: 'Estonian', group: 'Other' },
  { id: 'lv', name: 'Latvian', group: 'Other' },
  { id: 'lt', name: 'Lithuanian', group: 'Other' },
  { id: 'mt', name: 'Maltese', group: 'Other' },
  { id: 'cy', name: 'Welsh', group: 'Other' },
  { id: 'ga', name: 'Irish (Gaeilge)', group: 'Other' },
  { id: 'eu', name: 'Basque', group: 'Other' },
  { id: 'ca', name: 'Catalan', group: 'Other' },
  { id: 'gl', name: 'Galician', group: 'Other' },
  { id: 'af', name: 'Afrikaans', group: 'Other' },
];

/** Get language display name by ID */
export function getLanguageName(id) {
  if (!id || id === '—') return '—';
  var lang = LANGUAGES.find(function(l) { return l.id === id; });
  return lang ? lang.name : id;
}

/** Get unique language groups in order */
export function getLanguageGroups() {
  var seen = {};
  var groups = [];
  LANGUAGES.forEach(function(l) {
    if (!seen[l.group]) { seen[l.group] = true; groups.push(l.group); }
  });
  return groups;
}

/** Comprehensive preset tags for agent role templates */
export var ROLE_TAGS = [
  // Function
  'customer-support', 'technical-support', 'sales', 'lead-generation', 'account-management',
  'onboarding', 'billing', 'scheduling', 'recruitment', 'hr',
  'legal', 'compliance', 'finance', 'accounting', 'procurement',
  'marketing', 'content-creation', 'social-media', 'seo', 'analytics',
  'engineering', 'devops', 'qa', 'security', 'architecture',
  'product-management', 'project-management', 'scrum-master', 'ux-research',
  'data-analysis', 'reporting', 'business-intelligence', 'forecasting',
  // Capability
  'email-handler', 'chat-agent', 'voice-agent', 'workflow-automation',
  'document-processing', 'data-entry', 'research', 'summarization',
  'translation', 'writing', 'editing', 'proofreading', 'copywriting',
  'code-review', 'debugging', 'api-integration', 'database-management',
  // Industry
  'healthcare', 'fintech', 'ecommerce', 'saas', 'real-estate',
  'education', 'nonprofit', 'government', 'logistics', 'hospitality',
  'insurance', 'banking', 'manufacturing', 'retail', 'media',
  'telecom', 'automotive', 'energy', 'agriculture', 'legal-services',
  // Trait
  'multilingual', 'empathetic', 'technical', 'creative', 'analytical',
  'concise', 'detail-oriented', 'fast-responder', 'escalation-handler',
  '24-7', 'high-volume', 'enterprise', 'smb', 'b2b', 'b2c',
];

/** Reusable language <select> with optgroups */
export function LanguageSelect(props) {
  var value = props.value || 'en-us';
  var onChange = props.onChange;
  var style = props.style || {};
  var groups = getLanguageGroups();
  return h('select', { className: props.className || 'input', value: value, onChange: onChange, style: style },
    groups.map(function(g) {
      var langs = LANGUAGES.filter(function(l) { return l.group === g; });
      return h('optgroup', { key: g, label: g },
        langs.map(function(l) { return h('option', { key: l.id, value: l.id }, l.name); })
      );
    })
  );
}

/** Reusable tag picker with preset suggestions + custom input */
export function TagPicker(props) {
  var tags = props.value || [];
  var onChange = props.onChange; // receives new array
  var presets = props.presets || ROLE_TAGS;
  var placeholder = props.placeholder || 'Add custom tag...';
  var _ref = useState(''); var input = _ref[0]; var setInput = _ref[1];
  var _ref2 = useState(false); var showSuggest = _ref2[0]; var setShowSuggest = _ref2[1];

  var addTag = function(t) {
    t = t.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && tags.indexOf(t) < 0) onChange(tags.concat([t]));
  };
  var removeTag = function(t) { onChange(tags.filter(function(x) { return x !== t; })); };

  var filtered = presets.filter(function(p) {
    return tags.indexOf(p) < 0 && (!input || p.indexOf(input.toLowerCase()) >= 0);
  }).slice(0, 20);

  return h('div', null,
    // Selected tags
    tags.length > 0 && h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 } },
      tags.map(function(t) {
        return h('span', { key: t, style: { padding: '3px 10px', fontSize: 11, background: 'var(--accent-soft)', borderRadius: 20, color: 'var(--accent)', border: '1px solid var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }, onClick: function() { removeTag(t); }, title: 'Click to remove' },
          t.replace(/-/g, ' '), ' \u00d7'
        );
      })
    ),
    // Input row
    h('div', { style: { display: 'flex', gap: 6, position: 'relative' } },
      h('input', { className: 'input', value: input, onChange: function(e) { setInput(e.target.value); setShowSuggest(true); }, onFocus: function() { setShowSuggest(true); }, onKeyDown: function(e) { if (e.key === 'Enter') { e.preventDefault(); addTag(input); setInput(''); } }, placeholder: placeholder, style: { flex: 1, fontSize: 12 } }),
      h('button', { className: 'btn btn-secondary btn-sm', type: 'button', onClick: function() { setShowSuggest(!showSuggest); } }, showSuggest ? 'Hide' : 'Browse')
    ),
    // Suggestions dropdown
    showSuggest && filtered.length > 0 && h('div', { style: { marginTop: 4, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-primary)' } },
      filtered.map(function(p) {
        return h('div', { key: p, style: { padding: '5px 10px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid var(--border)' }, onClick: function() { addTag(p); }, onMouseEnter: function(e) { e.target.style.background = 'var(--bg-tertiary)'; }, onMouseLeave: function(e) { e.target.style.background = 'transparent'; } },
          p.replace(/-/g, ' ')
        );
      })
    )
  );
}

export var GENDER_OPTIONS = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'non-binary', label: 'Non-binary' },
  { id: '', label: 'Not specified' },
];

export var MARITAL_OPTIONS = [
  { id: 'single', label: 'Single' },
  { id: 'married', label: 'Married' },
  { id: 'divorced', label: 'Divorced' },
  { id: '', label: 'Not specified' },
];

export var DEFAULT_TRAITS = {
  communication: 'direct',
  detail: 'detail-oriented',
  energy: 'calm',
  humor: 'warm',
  formality: 'adaptive',
  empathy: 'moderate',
  patience: 'patient',
  creativity: 'creative',
};

export var TRAIT_DEFINITIONS = [
  { key: 'communication', label: 'Style', options: [{ id: 'direct', label: 'Direct' }, { id: 'diplomatic', label: 'Diplomatic' }] },
  { key: 'detail', label: 'Focus', options: [{ id: 'big-picture', label: 'Big-picture' }, { id: 'detail-oriented', label: 'Detail-oriented' }] },
  { key: 'energy', label: 'Energy', options: [{ id: 'enthusiastic', label: 'Enthusiastic' }, { id: 'calm', label: 'Calm & measured' }] },
  { key: 'humor', label: 'Humor', options: [{ id: 'witty', label: 'Witty' }, { id: 'dry', label: 'Dry' }, { id: 'warm', label: 'Warm' }, { id: 'none', label: 'None' }] },
  { key: 'formality', label: 'Formality', options: [{ id: 'formal', label: 'Formal' }, { id: 'casual', label: 'Casual' }, { id: 'adaptive', label: 'Adaptive' }] },
  { key: 'empathy', label: 'Empathy', options: [{ id: 'high', label: 'High' }, { id: 'moderate', label: 'Moderate' }, { id: 'reserved', label: 'Reserved' }] },
  { key: 'patience', label: 'Patience', options: [{ id: 'patient', label: 'Patient' }, { id: 'efficient', label: 'Efficient' }] },
  { key: 'creativity', label: 'Creativity', options: [{ id: 'creative', label: 'Creative' }, { id: 'conventional', label: 'Conventional' }] },
];

// ─── Avatar Upload Helper ────────────────────────────────

/**
 * Reads an image File, auto-resizes if too large, and calls onResult(dataUrl).
 * @param {File} file
 * @param {(dataUrl: string) => void} onResult
 * @param {(msg: string, level: string) => void} toast
 */
export function handleAvatarFile(file, onResult, toast) {
  if (!file) return;
  if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
    toast('Please upload a JPG, PNG, or WebP image', 'error');
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    var dataUrl = e.target.result;
    if (dataUrl.length <= 512000) {
      onResult(dataUrl);
      return;
    }
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var maxDim = 256;
      var w = img.width; var ht = img.height;
      if (w > ht) { ht = Math.round(ht * maxDim / w); w = maxDim; }
      else { w = Math.round(w * maxDim / ht); ht = maxDim; }
      canvas.width = w; canvas.height = ht;
      canvas.getContext('2d').drawImage(img, 0, 0, w, ht);
      var quality = 0.8;
      var result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > 512000 && quality > 0.1) {
        quality -= 0.1;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      onResult(result);
      toast('Image auto-resized to fit', 'info');
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

// ─── Computed Age ────────────────────────────────────────

export function computeAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  var dob = new Date(dateOfBirth);
  var today = new Date();
  var age = today.getFullYear() - dob.getFullYear();
  var m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// ─── PersonaForm Component ──────────────────────────────
//
// Renders the full persona editing UI — avatar upload, DOB,
// gender, marital status, cultural background, language, and
// personality trait toggles.
//
// Props:
//   form      — object with { avatar, dateOfBirth, gender, maritalStatus,
//                              culturalBackground, language, traits }
//   set       — (key, value) => void   — updates a single form field
//   toast     — (msg, level) => void
//   compact   — (optional) if true, uses a slightly tighter layout

export function PersonaForm(props) {
  var form = props.form;
  var set = props.set;
  var toast = props.toast;
  var fileInputRef = useRef(null);

  var onAvatarFile = function(file) {
    handleAvatarFile(file, function(dataUrl) { set('avatar', dataUrl); }, toast);
  };

  var traits = form.traits || DEFAULT_TRAITS;

  var setTrait = function(key, value) {
    set('traits', Object.assign({}, traits, (function() { var o = {}; o[key] = value; return o; })()));
  };

  var maxDob = new Date(new Date().getFullYear() - 18, new Date().getMonth(), new Date().getDate()).toISOString().split('T')[0];
  var age = computeAge(form.dateOfBirth);

  return h(Fragment, null,
    // ─── Avatar + DOB + Gender + Marital ─────────────
    h('div', { style: { display: 'flex', gap: 24, marginBottom: 24, alignItems: 'flex-start' } },

      // Avatar upload
      h('div', { style: { textAlign: 'center' } },
        h('div', {
          className: 'avatar-upload',
          onClick: function() { fileInputRef.current && fileInputRef.current.click(); },
          onDragOver: function(e) { e.preventDefault(); e.stopPropagation(); },
          onDrop: function(e) { e.preventDefault(); e.stopPropagation(); onAvatarFile(e.dataTransfer.files[0]); }
        },
          form.avatar
            ? h('img', { src: form.avatar, alt: 'Avatar' })
            : h('div', { className: 'avatar-upload-hint' }, h('div', { style: { fontSize: 24, marginBottom: 2 } }, '+'), 'Upload', h('br'), 'photo'),
          h('input', { ref: fileInputRef, type: 'file', accept: 'image/jpeg,image/png,image/webp', style: { display: 'none' }, onChange: function(e) { onAvatarFile(e.target.files[0]); } })
        ),
        form.avatar && h('button', { className: 'btn btn-ghost btn-sm', style: { marginTop: 6, fontSize: 11 }, onClick: function() { set('avatar', null); } }, 'Remove'),
        h('p', { className: 'form-help', style: { marginTop: 4 } }, 'JPG, PNG, WebP. Large images auto-resized.')
      ),

      // DOB + Gender + Marital
      h('div', { style: { flex: 1 } },

        // Date of birth + computed age
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' } },
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Date of Birth'),
            h('input', { className: 'input', type: 'date', value: form.dateOfBirth || '', onChange: function(e) { set('dateOfBirth', e.target.value); }, max: maxDob }),
            h('p', { className: 'form-help' }, 'They\'ll age naturally — and get a birthday email each year')
          ),
          age !== null && h('div', { style: { padding: '8px 14px', background: 'var(--accent-soft)', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 600, color: 'var(--accent-text)', whiteSpace: 'nowrap', marginBottom: 24 } }, age + ' years old')
        ),

        // Gender
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Gender'),
          h('div', { className: 'persona-cards' },
            GENDER_OPTIONS.map(function(g) {
              return h('div', { key: g.id, className: 'persona-card' + (form.gender === g.id ? ' selected' : ''), onClick: function() { set('gender', g.id); } }, g.label);
            })
          )
        ),

        // Marital status
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Marital Status'),
          h('div', { className: 'persona-cards' },
            MARITAL_OPTIONS.map(function(m) {
              return h('div', { key: m.id, className: 'persona-card' + (form.maritalStatus === m.id ? ' selected' : ''), onClick: function() { set('maritalStatus', m.id); } }, m.label);
            })
          )
        )
      )
    ),

    // ─── Cultural Background ─────────────────────────
    h('div', { className: 'form-group', style: { marginBottom: 20 } },
      h('label', { className: 'form-label' }, 'Cultural Background'),
      h('p', { className: 'form-help', style: { marginTop: -2, marginBottom: 8 } }, 'Shapes communication style, formality, greetings, and cultural references.'),
      h('div', { className: 'culture-grid' },
        CULTURES.map(function(c) {
          return h('div', { key: c.id, className: 'culture-card' + (form.culturalBackground === c.id ? ' selected' : ''), onClick: function() { set('culturalBackground', form.culturalBackground === c.id ? '' : c.id); } },
            h('h4', null, c.name),
            h('p', null, c.desc)
          );
        })
      )
    ),

    // ─── Language ────────────────────────────────────
    h('div', { className: 'form-group', style: { marginBottom: 20 } },
      h('label', { className: 'form-label' }, 'Language & Dialect'),
      h(LanguageSelect, { value: form.language || 'en-us', onChange: function(e) { set('language', e.target.value); }, style: { maxWidth: 300 } })
    ),

    // ─── Personality Traits ──────────────────────────
    h('div', { className: 'form-group' },
      h('label', { className: 'form-label' }, 'Personality Traits'),
      h('p', { className: 'form-help', style: { marginTop: -2, marginBottom: 10 } }, 'Fine-tune how this agent expresses itself.'),
      TRAIT_DEFINITIONS.map(function(td) {
        return h('div', { key: td.key, className: 'trait-row' },
          h('span', { className: 'trait-label' }, td.label),
          h('div', { className: 'trait-toggle' },
            td.options.map(function(opt) {
              return h('div', { key: opt.id, className: 'trait-option' + (traits[td.key] === opt.id ? ' active' : ''), onClick: function() { setTrait(td.key, opt.id); } }, opt.label);
            })
          )
        );
      })
    )
  );
}
