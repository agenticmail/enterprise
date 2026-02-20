import { h, useState } from './utils.js';
import { I } from './icons.js';
import { Modal } from './modal.js';

export function HelpButton(props) {
  var _open = useState(false);
  var isOpen = _open[0]; var setOpen = _open[1];

  return h('span', { style: { display: 'inline-flex', alignItems: 'center' } },
    h('button', {
      onClick: function(e) { e.stopPropagation(); setOpen(true); },
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
    isOpen && h(Modal, {
      title: props.label || 'Help',
      onClose: function() { setOpen(false); },
      large: true
    },
      h('div', { style: { fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary, #9ca3af)', padding: '4px 0' } },
        props.children
      )
    )
  );
}
