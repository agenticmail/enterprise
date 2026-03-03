import { h, useState, useEffect, useCallback } from './utils.js';
import { I } from './icons.js';

export function HelpButton(props) {
  var _open = useState(false);
  var isOpen = _open[0]; var setOpen = _open[1];

  // Close on Escape key
  useEffect(function() {
    if (!isOpen) return;
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    return function() { document.removeEventListener('keydown', onKey); };
  }, [isOpen]);

  return h('span', { style: { display: 'inline-flex', alignItems: 'center' } },
    h('button', {
      onClick: function(e) { e.stopPropagation(); e.preventDefault(); setOpen(!isOpen); },
      title: 'Learn more about ' + (props.label || 'this section'),
      style: {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: '50%',
        border: '1.5px solid var(--text-muted, #6b7280)', background: 'transparent',
        color: 'var(--text-muted, #6b7280)', fontSize: 12, fontWeight: 700,
        cursor: 'pointer', marginLeft: 8, padding: 0, lineHeight: 1,
        transition: 'border-color 0.15s, color 0.15s'
      },
      onMouseEnter: function(e) { e.currentTarget.style.borderColor = 'var(--brand-color, #6366f1)'; e.currentTarget.style.color = 'var(--brand-color, #6366f1)'; },
      onMouseLeave: function(e) { e.currentTarget.style.borderColor = 'var(--text-muted, #6b7280)'; e.currentTarget.style.color = 'var(--text-muted, #6b7280)'; }
    }, '?'),
    isOpen && h('div', {
      id: 'help-overlay',
      onMouseDown: function(e) { if (e.target.id === 'help-overlay') setOpen(false); },
      style: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }
    },
      h('div', {
        style: {
          background: 'var(--bg-card, #181b28)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl, 14px)', width: 520, maxWidth: '92vw', maxHeight: '80vh',
          overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
        }
      },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' } },
          h('h3', { style: { fontSize: 15, fontWeight: 700, margin: 0 } }, props.label || 'Help'),
          h('button', {
            onMouseDown: function(e) { e.stopPropagation(); setOpen(false); },
            style: {
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 6, border: 'none',
              background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
              cursor: 'pointer', fontSize: 14,
            }
          }, I.x())
        ),
        h('div', { style: { padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(80vh - 60px)', fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary, #9ca3af)' } },
          props.children
        )
      )
    )
  );
}
