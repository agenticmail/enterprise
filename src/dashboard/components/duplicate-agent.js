/**
 * Duplicate Agent Modal — creates exact replicas with progress bar.
 */
import { h, useState, apiCall } from './utils.js';
import { I } from './icons.js';

export function DuplicateAgentModal({ agent, onClose, onDuplicated, toast }) {
  var [agents, setAgents] = useState([{ name: '', email: '' }]);
  var [loading, setLoading] = useState(false);
  var [progress, setProgress] = useState(0);
  var [result, setResult] = useState(null);

  function addRow() { setAgents(agents.concat([{ name: '', email: '' }])); }
  function removeRow(idx) { if (agents.length > 1) setAgents(agents.filter(function(_, i) { return i !== idx; })); }
  function updateRow(idx, field, value) {
    setAgents(agents.map(function(a, i) { return i === idx ? Object.assign({}, a, { [field]: value }) : a; }));
  }

  async function handleDuplicate() {
    for (var i = 0; i < agents.length; i++) {
      if (!agents[i].name.trim()) { toast('Name required for agent #' + (i + 1), 'error'); return; }
      if (!agents[i].email.trim() || !agents[i].email.includes('@')) { toast('Valid email required for agent #' + (i + 1), 'error'); return; }
    }
    setLoading(true); setProgress(10);
    var interval = setInterval(function() { setProgress(function(p) { return Math.min(p + Math.random() * 15, 90); }); }, 400);
    try {
      var res = await apiCall('/agents/' + agent.id + '/duplicate', {
        method: 'POST', body: JSON.stringify({ agents: agents.map(function(a) { return { name: a.name.trim(), email: a.email.trim() }; }) })
      });
      clearInterval(interval); setProgress(100);
      if (res.ok) {
        setResult(res);
        if (res.errors && res.errors.length > 0) res.errors.forEach(function(e) { toast('Failed: ' + e.name + ' — ' + e.error, 'error'); });
        if (onDuplicated) onDuplicated(res.agents);
      } else { toast(res.error || 'Duplication failed', 'error'); setLoading(false); setProgress(0); }
    } catch (e) { clearInterval(interval); toast(e.message || 'Duplication failed', 'error'); setLoading(false); setProgress(0); }
  }

  var _input = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-secondary)', fontSize: 13 };

  return h('div', { className: 'modal-overlay', onClick: function() { if (!loading) onClose(); } },
    h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 580, maxHeight: '85vh', overflow: 'auto' } },
      h('div', { className: 'modal-header' },
        h('h2', { style: { fontSize: 16, flex: 1, display: 'flex', alignItems: 'center', gap: 8 } }, I.copy(), ' Duplicate Agent'),
        !loading && h('button', { className: 'btn btn-ghost btn-icon', onClick: onClose }, '\u00d7')
      ),
      h('div', { className: 'modal-body', style: { padding: 20 } },

        // Progress bar
        loading && h('div', { style: { marginBottom: 16 } },
          h('div', { style: { height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' } },
            h('div', { style: { height: '100%', width: progress + '%', background: 'var(--accent)', borderRadius: 3, transition: 'width 0.3s ease' } })
          ),
          h('div', { style: { textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 } },
            progress < 100 ? 'Duplicating... copying config, memory, permissions, skills, budget, security...' : 'Done!'
          )
        ),

        // Success result
        result && h('div', null,
          h('div', { style: { padding: 16, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, marginBottom: 16 } },
            h('div', { style: { fontWeight: 600, color: '#10b981', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 } }, '\u2714 ', result.created + ' agent(s) duplicated'),
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, result.message)
          ),
          result.agents && result.agents.map(function(a, i) {
            return h('div', { key: i, style: { padding: 12, border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, background: 'var(--bg-secondary)' } },
              h('div', { style: { fontWeight: 600, marginBottom: 4 } }, a.name),
              h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 } }, a.email),
              a.copiedSteps && h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 } }, 'Copied: ', a.copiedSteps.join(', ')),
              h('div', { style: { padding: 10, background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.2)', borderRadius: 6, fontSize: 12, color: '#b45309' } },
                h('strong', null, '\u26A0 Setup required: '), (a.needsSetup || []).join(', '),
                h('div', { style: { marginTop: 4, fontStyle: 'italic' } }, 'Go to this agent\'s detail page to configure these tabs.')
              )
            );
          }),
          h('div', { style: { marginTop: 12, textAlign: 'center' } }, h('button', { className: 'btn btn-primary', onClick: onClose }, 'Done'))
        ),

        // Form
        !result && !loading && h('div', null,
          h('div', { style: { padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 16, fontSize: 13 } },
            h('div', { style: { fontWeight: 600, marginBottom: 4 } }, 'Duplicating: ', agent.name),
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Creates exact replicas: same config, personality, memory, skills, permissions, budget, security, tool security, and workforce. Only name, email, and ID differ.'),
            h('div', { style: { fontSize: 11, color: '#b45309', marginTop: 6 } }, 'After duplication configure: Deployment, Channels (Telegram/WhatsApp), and Manager.')
          ),
          agents.map(function(a, idx) {
            return h('div', { key: idx, style: { padding: 12, border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10, background: agents.length > 1 ? 'var(--bg-secondary)' : 'transparent' } },
              agents.length > 1 && h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
                h('span', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' } }, 'Agent #' + (idx + 1)),
                h('button', { className: 'btn btn-sm btn-ghost', style: { fontSize: 11, color: '#ef4444' }, onClick: function() { removeRow(idx); } }, I.trash(), ' Remove')
              ),
              h('div', { style: { marginBottom: 8 } },
                h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Name *'),
                h('input', { type: 'text', value: a.name, placeholder: agent.name + ' (Copy)', style: _input, onChange: function(e) { updateRow(idx, 'name', e.target.value); } })
              ),
              h('div', null,
                h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Email *'),
                h('input', { type: 'email', value: a.email, placeholder: 'agent-copy@agenticmail.io', style: _input, onChange: function(e) { updateRow(idx, 'email', e.target.value); } })
              )
            );
          }),
          h('button', { className: 'btn btn-sm btn-secondary', style: { width: '100%', marginTop: 4 }, onClick: addRow }, I.plus(), ' Add Another Duplicate')
        )
      ),
      !result && !loading && h('div', { className: 'modal-footer', style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
        h('button', { className: 'btn btn-secondary', onClick: onClose }, 'Cancel'),
        h('button', { className: 'btn btn-primary', disabled: agents.some(function(a) { return !a.name.trim() || !a.email.trim(); }),
          onClick: handleDuplicate }, I.copy(), ' Duplicate ' + agents.length + ' Agent' + (agents.length > 1 ? 's' : ''))
      )
    )
  );
}
