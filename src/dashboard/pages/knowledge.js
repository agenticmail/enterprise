import { h, useState, useEffect, useCallback, Fragment, useApp, engineCall, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';

export function KnowledgeBasePage() {
  const { toast } = useApp();
  const [kbs, setKbs] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [selected, setSelected] = useState(null); // full KB detail
  const [docs, setDocs] = useState([]);
  const [chunks, setChunks] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    engineCall('/knowledge-bases').then(d => setKbs(d.knowledgeBases || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      await engineCall('/knowledge-bases', { method: 'POST', body: JSON.stringify({ name: form.name, description: form.description, orgId: getOrgId() }) });
      toast('Knowledge base created', 'success');
      setCreating(false); setForm({ name: '', description: '' }); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const selectKb = async (kb) => {
    setLoading(true);
    try {
      const detail = await engineCall('/knowledge-bases/' + kb.id);
      const kbData = detail.knowledgeBase || detail;
      setSelected(kbData);
      setDocs(kbData.documents || []);
      setChunks([]);
      setSelectedDoc(null);
      setEditForm({ name: kbData.name || '', description: kbData.description || '' });
    } catch (e) {
      toast('Failed to load knowledge base: ' + e.message, 'error');
    }
    setLoading(false);
  };

  const loadDocChunks = async (doc) => {
    setSelectedDoc(doc);
    try {
      const res = await engineCall('/knowledge-bases/' + selected.id + '/documents/' + doc.id + '/chunks');
      setChunks(res.chunks || []);
    } catch {
      // chunks endpoint might not exist, try search with empty query
      setChunks([]);
    }
  };

  const deleteKb = async (id) => {
    try {
      await engineCall('/knowledge-bases/' + id, { method: 'DELETE' });
      toast('Knowledge base deleted', 'success');
      setSelected(null); load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const deleteDoc = async (docId) => {
    if (!selected) return;
    try {
      await engineCall('/knowledge-bases/' + selected.id + '/documents/' + docId, { method: 'DELETE' });
      toast('Document deleted', 'success');
      setDocs(d => d.filter(x => x.id !== docId));
      if (selectedDoc && selectedDoc.id === docId) { setSelectedDoc(null); setChunks([]); }
    } catch (e) { toast(e.message, 'error'); }
  };

  const saveEdit = async () => {
    if (!selected) return;
    try {
      await engineCall('/knowledge-bases/' + selected.id, { method: 'PUT', body: JSON.stringify({ name: editForm.name, description: editForm.description }) });
      toast('Knowledge base updated', 'success');
      setSelected(s => ({ ...s, name: editForm.name, description: editForm.description }));
      setEditing(false);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  // ── Detail View ──
  if (selected) {
    return h(Fragment, null,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
          h('button', { className: 'btn btn-secondary btn-sm', onClick: () => setSelected(null) }, '\u2190 Back'),
          editing
            ? h('input', { className: 'input', value: editForm.name, onChange: e => setEditForm(f => ({ ...f, name: e.target.value })), style: { fontSize: 18, fontWeight: 700, padding: '4px 8px' } })
            : h('h1', { style: { fontSize: 20, fontWeight: 700, margin: 0 } }, selected.name)
        ),
        h('div', { style: { display: 'flex', gap: 8 } },
          editing
            ? h(Fragment, null,
                h('button', { className: 'btn btn-secondary btn-sm', onClick: () => setEditing(false) }, 'Cancel'),
                h('button', { className: 'btn btn-primary btn-sm', onClick: saveEdit }, 'Save')
              )
            : h(Fragment, null,
                h('button', { className: 'btn btn-secondary btn-sm', onClick: () => setEditing(true) }, I.journal(), ' Edit'),
                h('button', { className: 'btn btn-danger btn-sm', onClick: () => deleteKb(selected.id) }, I.trash(), ' Delete')
              )
        )
      ),

      // Description
      h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-body' },
          editing
            ? h('textarea', { className: 'input', rows: 3, value: editForm.description, onChange: e => setEditForm(f => ({ ...f, description: e.target.value })), placeholder: 'Knowledge base description...' })
            : h('p', { style: { color: 'var(--text-secondary)', fontSize: 13, margin: 0 } }, selected.description || 'No description'),
          h('div', { style: { display: 'flex', gap: 12, marginTop: 12, fontSize: 12, color: 'var(--text-muted)' } },
            h('span', null, 'ID: ', h('code', null, selected.id)),
            selected.createdAt && h('span', null, 'Created: ', new Date(selected.createdAt).toLocaleDateString()),
            h('span', null, docs.length + ' document(s)'),
            selected.agentIds && h('span', null, (selected.agentIds.length || 0) + ' agent(s)')
          )
        )
      ),

      // Stats
      selected.stats && h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 } },
        [
          { label: 'Documents', value: selected.stats?.documentCount || selected.stats?.documents || selected.stats?.totalDocuments || docs.length },
          { label: 'Chunks', value: selected.stats?.chunkCount || selected.stats?.chunks || selected.stats?.totalChunks || 0 },
          { label: 'Total Tokens', value: selected.stats?.totalTokens || 0 },
          { label: 'Queries', value: selected.stats?.queryCount || 0 },
        ].map(s => h('div', { key: s.label, className: 'card', style: { textAlign: 'center', padding: 12 } },
          h('div', { style: { fontSize: 22, fontWeight: 700, color: 'var(--brand-color, #6366f1)' } }, typeof s.value === 'number' && s.value > 1000 ? (s.value / 1000).toFixed(1) + 'K' : s.value),
          h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 } }, s.label)
        ))
      ),

      // Two-panel layout: docs list + chunk preview
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },

        // Documents list
        h('div', { className: 'card' },
          h('div', { className: 'card-header' },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              h('h3', { style: { margin: 0 } }, 'Documents'),
              h('span', { className: 'badge badge-neutral' }, docs.length)
            )
          ),
          h('div', { className: 'card-body-flush' },
            docs.length === 0
              ? h('div', { style: { padding: 24, textAlign: 'center', color: 'var(--text-muted)' } }, 'No documents in this knowledge base')
              : docs.map(doc =>
                  h('div', { key: doc.id, style: {
                    padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    background: selectedDoc && selectedDoc.id === doc.id ? 'var(--bg-secondary)' : 'transparent',
                    transition: 'background 0.15s'
                  }, onClick: () => loadDocChunks(doc) },
                    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                      h('div', null,
                        h('div', { style: { fontWeight: 600, fontSize: 13 } }, doc.name || doc.id),
                        h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } },
                          [doc.sourceType, doc.mimeType, doc.size ? (doc.size > 1024 ? (doc.size / 1024).toFixed(1) + ' KB' : doc.size + ' B') : null, doc.status].filter(Boolean).join(' \u2022 ')
                        )
                      ),
                      h('button', { className: 'btn btn-sm', style: { padding: '2px 6px', fontSize: 11, color: 'var(--danger)' }, onClick: (e) => { e.stopPropagation(); deleteDoc(doc.id); } }, I.trash())
                    )
                  )
                )
          )
        ),

        // Chunk preview
        h('div', { className: 'card' },
          h('div', { className: 'card-header' },
            h('h3', { style: { margin: 0 } }, selectedDoc ? 'Chunks: ' + (selectedDoc.name || selectedDoc.id) : 'Select a document')
          ),
          h('div', { className: 'card-body', style: { maxHeight: 500, overflow: 'auto' } },
            !selectedDoc
              ? h('div', { style: { textAlign: 'center', color: 'var(--text-muted)', padding: 24 } }, 'Click a document to preview its chunks')
              : chunks.length === 0
                ? h('div', { style: { textAlign: 'center', color: 'var(--text-muted)', padding: 24 } }, 'No chunks found. The document may not have been processed yet.')
                : chunks.map((chunk, i) =>
                    h('div', { key: chunk.id || i, style: { padding: '10px 0', borderBottom: '1px solid var(--border)' } },
                      h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
                        h('span', { style: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' } }, 'Chunk #' + (chunk.position ?? i + 1)),
                        chunk.tokenCount && h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, chunk.tokenCount + ' tokens')
                      ),
                      h('div', { style: { fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' } }, chunk.content || '(empty)')
                    )
                  )
          )
        )
      )
    );
  }

  // ── List View ──
  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Knowledge Bases'),
        h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Document ingestion and RAG retrieval for agents')
      ),
      h('button', { className: 'btn btn-primary', onClick: () => setCreating(true) }, I.plus(), ' New Knowledge Base')
    ),

    creating && h(Modal, { title: 'Create Knowledge Base', onClose: () => setCreating(false), footer: h(Fragment, null, h('button', { className: 'btn btn-secondary', onClick: () => setCreating(false) }, 'Cancel'), h('button', { className: 'btn btn-primary', onClick: create, disabled: !form.name }, 'Create')) },
      h('div', { className: 'form-group' }, h('label', { className: 'form-label' }, 'Name'), h('input', { className: 'input', value: form.name, onChange: e => setForm(f => ({ ...f, name: e.target.value })) })),
      h('div', { className: 'form-group' }, h('label', { className: 'form-label' }, 'Description'), h('textarea', { className: 'input', value: form.description, onChange: e => setForm(f => ({ ...f, description: e.target.value })) }))
    ),

    loading && h('div', { style: { textAlign: 'center', padding: 40 } }, 'Loading...'),

    !loading && kbs.length === 0
      ? h('div', { className: 'card' }, h('div', { className: 'card-body' }, h('div', { className: 'empty-state' }, I.knowledge(), h('h3', null, 'No knowledge bases'), h('p', null, 'Create a knowledge base to give agents access to your documents, policies, and data.'))))
      : !loading && h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 } }, kbs.map(kb =>
          h('div', { key: kb.id, className: 'card', style: { cursor: 'pointer', transition: 'border-color 0.15s' }, onClick: () => selectKb(kb) },
            h('div', { className: 'card-body' },
              h('h3', { style: { fontSize: 15, fontWeight: 600, marginBottom: 4 } }, kb.name),
              h('p', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, minHeight: 32 } }, kb.description || 'No description'),
              h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
                h('span', { className: 'badge badge-info' }, (kb.stats?.documentCount || kb.stats?.documents || kb.stats?.totalDocuments || kb.documents?.length || 0) + ' docs'),
                h('span', { className: 'badge badge-neutral' }, (kb.stats?.chunkCount || kb.stats?.chunks || kb.stats?.totalChunks || 0) + ' chunks'),
                kb.agentIds && kb.agentIds.length > 0 && h('span', { className: 'badge badge-success' }, kb.agentIds.length + ' agent(s)')
              ),
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 8 } }, 'Click to view details \u2192')
            )
          )
        ))
  );
}
