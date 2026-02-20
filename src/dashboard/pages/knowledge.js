import { h, useState, useEffect, Fragment, useApp, engineCall } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';

export function KnowledgeBasePage() {
  const { toast } = useApp();
  const [kbs, setKbs] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

  const load = () => engineCall('/knowledge-bases').then(d => setKbs(d.knowledgeBases || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await engineCall('/knowledge-bases', { method: 'POST', body: JSON.stringify({ name: form.name, description: form.description, orgId: 'default' }) });
      toast('Knowledge base created', 'success');
      setCreating(false); setForm({ name: '', description: '' }); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null, h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Knowledge Bases'), h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Document ingestion and RAG retrieval for agents')),
      h('button', { className: 'btn btn-primary', onClick: () => setCreating(true) }, I.plus(), ' New Knowledge Base')
    ),
    creating && h(Modal, { title: 'Create Knowledge Base', onClose: () => setCreating(false), footer: h(Fragment, null, h('button', { className: 'btn btn-secondary', onClick: () => setCreating(false) }, 'Cancel'), h('button', { className: 'btn btn-primary', onClick: create, disabled: !form.name }, 'Create')) },
      h('div', { className: 'form-group' }, h('label', { className: 'form-label' }, 'Name'), h('input', { className: 'input', value: form.name, onChange: e => setForm(f => ({ ...f, name: e.target.value })) })),
      h('div', { className: 'form-group' }, h('label', { className: 'form-label' }, 'Description'), h('textarea', { className: 'input', value: form.description, onChange: e => setForm(f => ({ ...f, description: e.target.value })) }))
    ),
    kbs.length === 0
      ? h('div', { className: 'card' }, h('div', { className: 'card-body' }, h('div', { className: 'empty-state' }, I.knowledge(), h('h3', null, 'No knowledge bases'), h('p', null, 'Create a knowledge base to give agents access to your documents, policies, and data.'))))
      : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 } }, kbs.map(kb =>
          h('div', { key: kb.id, className: 'card' },
            h('div', { className: 'card-body' },
              h('h3', { style: { fontSize: 15, fontWeight: 600, marginBottom: 4 } }, kb.name),
              h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } }, kb.description || 'No description'),
              h('div', { style: { display: 'flex', gap: 8 } },
                h('span', { className: 'badge badge-info' }, (kb.documents?.length || 0) + ' documents'),
                h('span', { className: 'badge badge-neutral' }, (kb.agentIds?.length || 0) + ' agents')
              )
            )
          )
        ))
  );
}
