/**
 * Duplicate Agent Modal Component
 * Allows duplicating an agent with new name(s) and email(s).
 */
import { h, useState, apiCall } from './utils.js';
import { I } from './icons.js';

export function DuplicateAgentModal({ agent, onClose, onDuplicated, toast }) {
  var [agents, setAgents] = useState([{ name: '', email: '' }]);
  var [loading, setLoading] = useState(false);

  function addRow() {
    setAgents(agents.concat([{ name: '', email: '' }]));
  }

  function removeRow(idx) {
    if (agents.length <= 1) return;
    setAgents(agents.filter(function(_, i) { return i !== idx; }));
  }

  function updateRow(idx, field, value) {
    var next = agents.map(function(a, i) {
      if (i !== idx) return a;
      var updated = Object.assign({}, a);
      updated[field] = value;
      return updated;
    });
    setAgents(next);
  }

  async function handleDuplicate() {
    // Validate
    for (var i = 0; i < agents.length; i++) {
      if (!agents[i].name.trim()) { toast('Name is required for agent #' + (i + 1), 'error'); return; }
      if (!agents[i].email.trim() || !agents[i].email.includes('@')) { toast('Valid email is required for agent #' + (i + 1), 'error'); return; }
    }

    setLoading(true);
    try {
      var res = await apiCall('/agents/' + agent.id + '/duplicate', {
        method: 'POST',
        body: JSON.stringify({
          agents: agents.map(function(a) { return { name: a.name.trim(), email: a.email.trim() }; })
        })
      });
      if (res.ok) {
        toast(res.created + ' agent(s) duplicated successfully!', 'success');
        if (res.errors && res.errors.length > 0) {
          res.errors.forEach(function(e) { toast('Failed: ' + e.name + ' — ' + e.error, 'error'); });
        }
        if (onDuplicated) onDuplicated(res.agents);
        onClose();
      } else {
        toast(res.error || 'Duplication failed', 'error');
      }
    } catch (e) {
      toast(e.message || 'Duplication failed', 'error');
    }
    setLoading(false);
  }

  var _inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-secondary)', fontSize: 13 };

  return h('div', { className: 'modal-overlay', onClick: onClose },
    h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 580, maxHeight: '85vh', overflow: 'auto' } },
      h('div', { className: 'modal-header' },
        h('h2', { style: { fontSize: 16, flex: 1, display: 'flex', alignItems: 'center', gap: 8 } }, I('copy'), ' Duplicate Agent'),
        h('button', { className: 'btn btn-ghost btn-icon', onClick: onClose }, '\u00d7')
      ),
      h('div', { className: 'modal-body', style: { padding: 20 } },
        h('div', { style: { padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 16, fontSize: 13 } },
          h('div', { style: { fontWeight: 600, marginBottom: 4 } }, 'Duplicating: ', agent.name),
          h('div', { style: { color: 'var(--text-muted)', fontSize: 12 } },
            'Creates exact replicas with the same config, personality, memory, skills, and permissions. Only the name, email, and agent ID will be different.'
          )
        ),

        agents.map(function(a, idx) {
          return h('div', { key: idx, style: { padding: 12, border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10, background: agents.length > 1 ? 'var(--bg-secondary)' : 'transparent' } },
            agents.length > 1 && h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
              h('span', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' } }, 'Agent #' + (idx + 1)),
              h('button', { className: 'btn btn-sm btn-ghost', style: { fontSize: 11, color: '#ef4444' }, onClick: function() { removeRow(idx); } }, I('trash'), ' Remove')
            ),
            h('div', { style: { marginBottom: 8 } },
              h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Name *'),
              h('input', { type: 'text', value: a.name, placeholder: 'e.g. ' + agent.name + ' (Copy)', style: _inputStyle,
                onChange: function(e) { updateRow(idx, 'name', e.target.value); }
              })
            ),
            h('div', null,
              h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Email *'),
              h('input', { type: 'email', value: a.email, placeholder: 'e.g. agent-copy@agenticmail.io', style: _inputStyle,
                onChange: function(e) { updateRow(idx, 'email', e.target.value); }
              })
            )
          );
        }),

        h('button', { className: 'btn btn-sm btn-secondary', style: { width: '100%', marginTop: 4 }, onClick: addRow },
          I('plus'), ' Add Another Duplicate'
        )
      ),
      h('div', { className: 'modal-footer', style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
        h('button', { className: 'btn btn-secondary', onClick: onClose, disabled: loading }, 'Cancel'),
        h('button', { className: 'btn btn-primary', onClick: handleDuplicate, disabled: loading || agents.some(function(a) { return !a.name.trim() || !a.email.trim(); }) },
          loading ? 'Duplicating...' : (I('copy'), ' Duplicate ' + agents.length + ' Agent' + (agents.length > 1 ? 's' : ''))
        )
      )
    )
  );
}
