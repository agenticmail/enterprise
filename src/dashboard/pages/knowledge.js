import { h, useState, useEffect, useCallback, Fragment, useApp, engineCall, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { Modal } from '../components/modal.js';
import { KnowledgeImportWizard, ImportJobsList } from './knowledge-import.js';
import { HelpButton } from '../components/help-button.js';

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
  const [showImport, setShowImport] = useState(false);
  const [importKb, setImportKb] = useState(null);
  const [editingDoc, setEditingDoc] = useState(null);     // doc id being renamed
  const [editDocName, setEditDocName] = useState('');
  const [editingChunk, setEditingChunk] = useState(null);  // chunk id being edited
  const [editChunkContent, setEditChunkContent] = useState('');

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

  const saveDocName = async (docId) => {
    if (!selected || !editDocName.trim()) return;
    try {
      await engineCall('/knowledge-bases/' + selected.id + '/documents/' + docId, { method: 'PUT', body: JSON.stringify({ name: editDocName.trim() }) });
      toast('Document renamed', 'success');
      setEditingDoc(null);
      selectKb(selected); // reload
    } catch (e) { toast(e.message, 'error'); }
  };

  const saveChunkContent = async (chunkId) => {
    if (!selected) return;
    try {
      await engineCall('/knowledge-bases/' + selected.id + '/chunks/' + chunkId, { method: 'PUT', body: JSON.stringify({ content: editChunkContent }) });
      toast('Chunk updated', 'success');
      setEditingChunk(null);
      if (selectedDoc) loadDocChunks(selectedDoc); // reload chunks
    } catch (e) { toast(e.message, 'error'); }
  };

  const deleteChunk = async (chunkId) => {
    if (!selected) return;
    try {
      await engineCall('/knowledge-bases/' + selected.id + '/chunks/' + chunkId, { method: 'DELETE' });
      toast('Chunk deleted', 'success');
      setChunks(c => c.filter(x => x.id !== chunkId));
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

  var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
  var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
  var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };

  // ── Detail View ──
  if (selected) {
    return h(Fragment, null,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
          h('button', { className: 'btn btn-secondary btn-sm', onClick: () => setSelected(null) }, '\u2190 Back'),
          editing
            ? h('input', { className: 'input', value: editForm.name, onChange: e => setEditForm(f => ({ ...f, name: e.target.value })), style: { fontSize: 18, fontWeight: 700, padding: '4px 8px' } })
            : h('h1', { style: { fontSize: 20, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center' } }, selected.name, h(HelpButton, { label: 'Knowledge Base Detail' },
                h('p', null, 'This is the detail view for a single knowledge base. Here you can manage documents, view chunks, and import new content.'),
                h('h4', { style: _h4 }, 'Key Actions'),
                h('ul', { style: _ul },
                  h('li', null, h('strong', null, 'Import Docs'), ' — Add documents from GitHub, Google Drive, websites, or file uploads.'),
                  h('li', null, h('strong', null, 'Edit'), ' — Rename or update the description of this knowledge base.'),
                  h('li', null, h('strong', null, 'Delete'), ' — Permanently remove this knowledge base and all its documents.')
                ),
                h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Click a document on the left to preview its chunks on the right. You can edit individual chunks for fine-grained control.')
              ))
        ),
        h('div', { style: { display: 'flex', gap: 8 } },
          editing
            ? h(Fragment, null,
                h('button', { className: 'btn btn-secondary btn-sm', onClick: () => setEditing(false) }, 'Cancel'),
                h('button', { className: 'btn btn-primary btn-sm', onClick: saveEdit }, 'Save')
              )
            : h(Fragment, null,
                h('button', { className: 'btn btn-primary btn-sm', onClick: () => setShowImport(true) }, I.plus(), ' Import Docs'),
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
          { label: 'Documents', value: selected.stats?.documentCount || selected.stats?.documents || selected.stats?.totalDocuments || docs.length, help: 'Total number of source documents imported into this knowledge base.' },
          { label: 'Chunks', value: selected.stats?.chunkCount || selected.stats?.chunks || selected.stats?.totalChunks || 0, help: 'Total text segments created from your documents. More chunks = more granular retrieval.' },
          { label: 'Total Tokens', value: selected.stats?.totalTokens || 0, help: 'Total token count across all chunks. This affects storage costs and retrieval context size.' },
          { label: 'Queries', value: selected.stats?.queryCount || 0, help: 'Number of times agents have searched this knowledge base. Higher usage means this KB is valuable.' },
        ].map(s => h('div', { key: s.label, className: 'card', style: { textAlign: 'center', padding: 12 } },
          h('div', { style: { fontSize: 22, fontWeight: 700, color: 'var(--brand-color, #6366f1)' } }, typeof s.value === 'number' && s.value > 1000 ? (s.value / 1000).toFixed(1) + 'K' : s.value),
          h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, s.label, h(HelpButton, { label: s.label }, h('p', null, s.help)))
        ))
      ),

      // Two-panel layout: docs list + chunk preview
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },

        // Documents list
        h('div', { className: 'card' },
          h('div', { className: 'card-header' },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              h('h3', { style: { margin: 0, display: 'flex', alignItems: 'center' } }, 'Documents', h(HelpButton, { label: 'Documents' },
                h('p', null, 'Documents are the source files you\'ve imported into this knowledge base. Each document is automatically split into smaller chunks for efficient retrieval.'),
                h('h4', { style: _h4 }, 'Managing Documents'),
                h('ul', { style: _ul },
                  h('li', null, h('strong', null, 'Click'), ' a document to view its chunks in the right panel.'),
                  h('li', null, h('strong', null, 'Rename'), ' — Click the edit icon to rename a document.'),
                  h('li', null, h('strong', null, 'Delete'), ' — Remove a document and all its chunks.')
                ),
                h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Use "Import Docs" to add more documents from various sources like GitHub, Google Drive, or direct file upload.')
              )),
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
                      h('div', { style: { flex: 1, minWidth: 0 } },
                        editingDoc === doc.id
                          ? h('div', { style: { display: 'flex', gap: 4 }, onClick: e => e.stopPropagation() },
                              h('input', { className: 'input', value: editDocName, onChange: e => setEditDocName(e.target.value), onKeyDown: e => e.key === 'Enter' && saveDocName(doc.id), style: { fontSize: 13, padding: '2px 6px', flex: 1 }, autoFocus: true }),
                              h('button', { className: 'btn btn-sm btn-primary', style: { padding: '2px 8px', fontSize: 11 }, onClick: () => saveDocName(doc.id) }, 'Save'),
                              h('button', { className: 'btn btn-sm', style: { padding: '2px 6px', fontSize: 11 }, onClick: () => setEditingDoc(null) }, 'X'),
                            )
                          : h('div', { style: { fontWeight: 600, fontSize: 13 } }, doc.name || doc.id),
                        h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } },
                          [doc.sourceType, doc.mimeType, doc.size ? (doc.size > 1024 ? (doc.size / 1024).toFixed(1) + ' KB' : doc.size + ' B') : null, doc.chunks?.length ? doc.chunks.length + ' chunks' : null, doc.status].filter(Boolean).join(' \u2022 ')
                        )
                      ),
                      h('div', { style: { display: 'flex', gap: 4, marginLeft: 8 } },
                        editingDoc !== doc.id && h('button', { className: 'btn btn-sm', style: { padding: '2px 6px', fontSize: 11 }, onClick: (e) => { e.stopPropagation(); setEditingDoc(doc.id); setEditDocName(doc.name || ''); } }, I.journal()),
                        h('button', { className: 'btn btn-sm', style: { padding: '2px 6px', fontSize: 11, color: 'var(--danger)' }, onClick: (e) => { e.stopPropagation(); deleteDoc(doc.id); } }, I.trash()),
                      )
                    )
                  )
                )
          )
        ),

        // Chunk preview
        h('div', { className: 'card' },
          h('div', { className: 'card-header' },
            h('h3', { style: { margin: 0, display: 'flex', alignItems: 'center' } }, selectedDoc ? 'Chunks: ' + (selectedDoc.name || selectedDoc.id) : 'Select a document', h(HelpButton, { label: 'Chunks' },
              h('p', null, 'Chunks are the smaller text segments that documents are split into for RAG (Retrieval-Augmented Generation). When an agent queries the knowledge base, the most relevant chunks are retrieved and included in the prompt.'),
              h('h4', { style: _h4 }, 'Why Chunks Matter'),
              h('ul', { style: _ul },
                h('li', null, h('strong', null, 'Granularity'), ' — Smaller chunks allow more precise retrieval of relevant information.'),
                h('li', null, h('strong', null, 'Token count'), ' — Each chunk has a token count that affects how much context is used.'),
                h('li', null, h('strong', null, 'Editing'), ' — You can manually edit chunks to improve quality or fix errors.')
              ),
              h('div', { style: _tip }, h('strong', null, 'Tip: '), 'If an agent gives incorrect answers, check the relevant chunks — you may need to edit them for clarity or accuracy.')
            ))
          ),
          h('div', { className: 'card-body', style: { maxHeight: 500, overflow: 'auto' } },
            !selectedDoc
              ? h('div', { style: { textAlign: 'center', color: 'var(--text-muted)', padding: 24 } }, 'Click a document to preview its chunks')
              : chunks.length === 0
                ? h('div', { style: { textAlign: 'center', color: 'var(--text-muted)', padding: 24 } }, 'No chunks found. The document may not have been processed yet.')
                : chunks.map((chunk, i) =>
                    h('div', { key: chunk.id || i, style: { padding: '10px 0', borderBottom: '1px solid var(--border)' } },
                      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } },
                        h('span', { style: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' } }, 'Chunk #' + (chunk.position ?? i + 1)),
                        h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                          chunk.tokenCount && h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, chunk.tokenCount + ' tokens'),
                          editingChunk !== chunk.id && h('button', { className: 'btn btn-sm', style: { padding: '1px 5px', fontSize: 10 }, onClick: () => { setEditingChunk(chunk.id); setEditChunkContent(chunk.content || ''); } }, 'Edit'),
                          editingChunk !== chunk.id && h('button', { className: 'btn btn-sm', style: { padding: '1px 5px', fontSize: 10, color: 'var(--danger)' }, onClick: () => deleteChunk(chunk.id) }, I.trash()),
                        )
                      ),
                      editingChunk === chunk.id
                        ? h('div', null,
                            h('textarea', { className: 'input', value: editChunkContent, onChange: e => setEditChunkContent(e.target.value), rows: 8, style: { width: '100%', fontSize: 12, fontFamily: 'monospace', lineHeight: 1.5 } }),
                            h('div', { style: { display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' } },
                              h('button', { className: 'btn btn-sm btn-secondary', onClick: () => setEditingChunk(null) }, 'Cancel'),
                              h('button', { className: 'btn btn-sm btn-primary', onClick: () => saveChunkContent(chunk.id) }, 'Save'),
                            )
                          )
                        : h('div', { style: { fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' } }, chunk.content || '(empty)')
                    )
                  )
          )
        )
      ),

      // Import history
      h(ImportJobsList, { kbId: selected.id }),

      // Import wizard modal
      showImport && h(KnowledgeImportWizard, {
        kbId: selected.id,
        kbName: selected.name,
        onClose: () => { setShowImport(false); setImportKb(null); },
        onDone: () => selectKb(selected),
      }),
    );
  }

  // ── List View ──
  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('h1', { style: { fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center' } }, 'Knowledge Bases', h(HelpButton, { label: 'Knowledge Bases' },
          h('p', null, 'Knowledge bases store documents that your agents can search and reference when answering questions. This is the foundation of RAG (Retrieval-Augmented Generation).'),
          h('h4', { style: _h4 }, 'How It Works'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'Create'), ' a knowledge base to organize related documents together.'),
            h('li', null, h('strong', null, 'Import'), ' documents from GitHub, Google Drive, SharePoint, websites, or file uploads.'),
            h('li', null, h('strong', null, 'Assign'), ' knowledge bases to agents so they can search and retrieve relevant information.'),
            h('li', null, h('strong', null, 'Query'), ' — When an agent needs information, it searches the knowledge base and retrieves the most relevant chunks.')
          ),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Organize knowledge bases by topic or department. Smaller, focused knowledge bases often produce better search results than one large one.')
        )),
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
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 } },
                h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Click to view details \u2192'),
                h('button', { className: 'btn btn-sm', style: { fontSize: 11, padding: '3px 10px' }, onClick: (e) => { e.stopPropagation(); setImportKb(kb); setShowImport(true); } }, I.plus(), ' Import')
              )
            )
          )
        )),

    // Import wizard (from list view)
    showImport && importKb && h(KnowledgeImportWizard, {
      kbId: importKb.id,
      kbName: importKb.name,
      onClose: () => { setShowImport(false); setImportKb(null); },
      onDone: () => load(),
    }),
  );
}

/* ContributionsTab removed — contributions live in Knowledge Contributions page */
/* DEAD CODE BELOW — kept as reference, will be cleaned up */
function _ContributionsTab_UNUSED({ toast, onBack }) {
  const [contributions, setContributions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [agents, setAgents] = useState([]);
  const [agentFilter, setAgentFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const PAGE_SIZE = 25;

  useEffect(() => {
    engineCall('/agents?orgId=' + getOrgId()).then(d => setAgents(d.agents || [])).catch(() => {});
  }, []);

  const agentData = buildAgentDataMap(agents);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (agentFilter) params.set('agentId', agentFilter);
    engineCall('/activity/knowledge-contributions?' + params).then(d => {
      setContributions(d.contributions || []);
      setTotal(d.total || 0);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [page, agentFilter]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.ceil(total / PAGE_SIZE);

  return h(Fragment, null,
    h('div', { style: { marginBottom: 20 } },
      h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Knowledge Hub'),
      h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Knowledge contributed by agents to the organization')
    ),

    h('div', { className: 'tabs', style: { marginBottom: 16 } },
      h('div', { className: 'tab', onClick: onBack }, 'Knowledge Bases'),
      h('div', { className: 'tab active' }, 'Agent Contributions')
    ),

    // Filter bar
    h('div', { style: { display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' } },
      h('select', {
        value: agentFilter,
        onChange: e => { setAgentFilter(e.target.value); setPage(0); },
        style: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' },
      },
        h('option', { value: '' }, 'All agents'),
        ...agents.map(a => h('option', { key: a.id, value: a.id }, a.config?.identity?.name || a.config?.displayName || a.name || a.id))
      ),
      h('span', { style: { color: 'var(--text-muted)', fontSize: 13 } }, total + ' contribution(s)')
    ),

    // Contributions grid
    h('div', { className: 'card', style: { position: 'relative' } },
      loading && h('div', { style: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: 12 } },
        h('div', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Loading...')
      ),
      h('div', { className: 'card-body-flush' },
        contributions.length === 0
          ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, loading ? 'Loading...' : 'No contributions yet')
          : h('table', null,
              h('thead', null, h('tr', null,
                h('th', null, 'Time'),
                h('th', null, 'Title'),
                h('th', null, 'Agent'),
                h('th', null, 'Importance'),
              )),
              h('tbody', null, contributions.map((c, i) =>
                h('tr', { key: c.id || i, onClick: () => setSelected(c), style: { cursor: 'pointer' }, title: 'Click to view details' },
                  h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, new Date(c.created_at).toLocaleString()),
                  h('td', { style: { fontWeight: 500, fontSize: 13 } }, (c.title || '').replace(/^knowledge-contrib-/, '').replace(/-/g, ' ')),
                  h('td', null, renderAgentBadge(c.agent_id, agentData)),
                  h('td', null, h('span', { className: 'badge badge-' + (c.importance === 'high' ? 'danger' : c.importance === 'medium' ? 'warning' : 'info') }, c.importance || 'normal')),
                )
              ))
            )
      ),

      // Pagination
      pages > 1 && h('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)' }
      },
        h('span', null, 'Showing ' + (page * PAGE_SIZE + 1) + '-' + Math.min((page + 1) * PAGE_SIZE, total) + ' of ' + total),
        h('div', { style: { display: 'flex', gap: 4 } },
          h('button', { onClick: () => setPage(p => Math.max(0, p - 1)), disabled: page === 0, style: pgBtn(false) }, '\u2039 Prev'),
          h('span', { style: { padding: '4px 8px', fontSize: 12 } }, (page + 1) + ' / ' + pages),
          h('button', { onClick: () => setPage(p => Math.min(pages - 1, p + 1)), disabled: page >= pages - 1, style: pgBtn(false) }, 'Next \u203A'),
        )
      ),
    ),

    // Detail modal
    selected && h(DetailModal, {
      title: 'Knowledge Contribution',
      onClose: () => setSelected(null),
      data: {
        title: (selected.title || '').replace(/^knowledge-contrib-/, '').replace(/-/g, ' '),
        agent: agentData[selected.agent_id]?.name || selected.agent_id || '-',
        importance: selected.importance || 'normal',
        confidence: selected.confidence || '-',
        category: selected.category,
        source: selected.source || '-',
        content: selected.content || '-',
        tags: selected.tags ? (Array.isArray(selected.tags) ? selected.tags.join(', ') : selected.tags) : '-',
        created: selected.created_at ? new Date(selected.created_at).toLocaleString() : '-',
        id: selected.id,
      },
      badge: { label: selected.importance || 'normal', color: selected.importance === 'high' ? 'var(--danger)' : 'var(--accent)' },
    }),
  );
}

function pgBtn(active) {
  return {
    padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'var(--bg-card)', color: active ? '#fff' : 'var(--text)',
    cursor: 'pointer', fontSize: 12,
  };
}
