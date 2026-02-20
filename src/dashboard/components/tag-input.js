/**
 * TagInput — Reusable tag/list input component
 *
 * For managing string arrays (allowedDirs, blockedPatterns, allowedHosts, etc.)
 * Renders list of badges with X remove buttons + an input field + Enter to add.
 *
 * Props:
 *   value: string[]        — current array of tags
 *   onChange: fn(string[])  — called when array changes
 *   placeholder: string     — input placeholder text
 *   label: string           — form label (optional)
 *   mono: boolean           — use monospace font for tags
 *   disabled: boolean       — disable input and remove buttons
 */
import { h, useState } from './utils.js';

var badgeStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '3px 8px', borderRadius: 4,
  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  fontSize: 12, lineHeight: 1.4, maxWidth: '100%', wordBreak: 'break-all'
};

var removeBtnStyle = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  fontSize: 14, lineHeight: 1, color: 'var(--text-muted)', fontWeight: 700,
  marginLeft: 2, flexShrink: 0
};

export function TagInput(props) {
  var value = props.value || [];
  var onChange = props.onChange || function() {};
  var disabled = props.disabled || false;

  var _input = useState('');
  var input = _input[0]; var setInput = _input[1];

  var addTag = function() {
    var trimmed = input.trim();
    if (!trimmed || value.indexOf(trimmed) !== -1) return;
    onChange(value.concat([trimmed]));
    setInput('');
  };

  var removeTag = function(idx) {
    var next = value.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  var tagStyle = props.mono
    ? Object.assign({}, badgeStyle, { fontFamily: 'var(--font-mono, monospace)', fontSize: 11 })
    : badgeStyle;

  return h('div', { style: { marginBottom: 12 } },
    props.label && h('label', {
      style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }
    }, props.label),

    // Tags list
    value.length > 0 && h('div', {
      style: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }
    },
      value.map(function(tag, i) {
        return h('span', { key: i, style: tagStyle },
          h('span', null, tag),
          !disabled && h('button', {
            style: removeBtnStyle,
            onClick: function() { removeTag(i); },
            title: 'Remove'
          }, '\u00D7')
        );
      })
    ),

    // Input row
    !disabled && h('div', { style: { display: 'flex', gap: 6 } },
      h('input', {
        className: 'input',
        style: { flex: 1, fontSize: 13 },
        value: input,
        onChange: function(e) { setInput(e.target.value); },
        onKeyDown: function(e) {
          if (e.key === 'Enter') { e.preventDefault(); addTag(); }
        },
        placeholder: props.placeholder || 'Type and press Enter'
      }),
      h('button', {
        className: 'btn btn-secondary btn-sm',
        onClick: addTag,
        disabled: !input.trim(),
        style: { whiteSpace: 'nowrap' }
      }, '+ Add')
    )
  );
}
