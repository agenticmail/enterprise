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
  { id: 'en-us', name: 'English (American)' },
  { id: 'en-gb', name: 'English (British)' },
  { id: 'en-au', name: 'English (Australian)' },
  { id: 'es', name: 'Spanish' },
  { id: 'pt', name: 'Portuguese' },
  { id: 'fr', name: 'French' },
  { id: 'de', name: 'German' },
  { id: 'ja', name: 'Japanese' },
  { id: 'ko', name: 'Korean' },
  { id: 'zh', name: 'Mandarin' },
  { id: 'hi', name: 'Hindi' },
  { id: 'ar', name: 'Arabic' },
  { id: 'yo', name: 'Yoruba' },
  { id: 'ig', name: 'Igbo' },
  { id: 'sw', name: 'Swahili' },
  { id: 'it', name: 'Italian' },
  { id: 'nl', name: 'Dutch' },
  { id: 'ru', name: 'Russian' },
  { id: 'tr', name: 'Turkish' },
  { id: 'pl', name: 'Polish' },
  { id: 'th', name: 'Thai' },
  { id: 'vi', name: 'Vietnamese' },
  { id: 'id', name: 'Indonesian' },
  { id: 'ms', name: 'Malay' },
  { id: 'tl', name: 'Filipino (Tagalog)' },
];

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
      h('select', { className: 'input', value: form.language || 'en-us', onChange: function(e) { set('language', e.target.value); }, style: { maxWidth: 300 } },
        LANGUAGES.map(function(l) { return h('option', { key: l.id, value: l.id }, l.name); })
      )
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
