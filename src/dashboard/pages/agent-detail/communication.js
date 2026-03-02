import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { Badge, EmptyState } from './shared.js?v=4';
import { HelpButton } from '../../components/help-button.js';

// --- CommunicationSection -------------------------------------------

export function CommunicationSection(props) {
  var agentId = props.agentId;
  var agents = props.agents || [];
  var app = useApp();
  var toast = app.toast;

  var agentData = buildAgentDataMap(agents);

  var _tab = useState('all');
  var activeTab = _tab[0]; var setActiveTab = _tab[1];

  var _messages = useState([]);
  var messages = _messages[0]; var setMessages = _messages[1];
  var _inbox = useState([]);
  var inbox = _inbox[0]; var setInbox = _inbox[1];
  var _topology = useState(null);
  var topology = _topology[0]; var setTopology = _topology[1];
  var _showSend = useState(false);
  var showSend = _showSend[0]; var setShowSend = _showSend[1];
  var _form = useState({ toAgentId: '', subject: '', content: '', priority: 'normal' });
  var form = _form[0]; var setForm = _form[1];

  var loadMessages = function() {
    engineCall('/messages?agentId=' + agentId + '&orgId=' + getOrgId() + '&limit=50')
      .then(function(d) { setMessages(d.messages || []); })
      .catch(function() {});
  };
  var loadInbox = function() {
    engineCall('/messages/inbox/' + agentId + '?orgId=' + getOrgId())
      .then(function(d) { setInbox(d.messages || []); })
      .catch(function() {});
  };
  var loadTopology = function() {
    engineCall('/messages/topology?agentId=' + agentId + '&orgId=' + getOrgId())
      .then(function(d) { setTopology(d.topology || d || null); })
      .catch(function() {});
  };

  var loadAll = function() {
    loadMessages();
    loadInbox();
    loadTopology();
  };

  useEffect(loadAll, []);

  var markRead = function(id) {
    engineCall('/messages/' + id + '/read', { method: 'POST', body: JSON.stringify({}) })
      .then(function() { toast('Message marked as read', 'success'); loadInbox(); })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  var sendMessage = function() {
    if (!form.toAgentId || !form.subject) { toast('Recipient and subject are required', 'error'); return; }
    var body = {
      fromAgentId: agentId,
      toAgentId: form.toAgentId,
      orgId: getOrgId(),
      subject: form.subject,
      content: form.content,
      priority: form.priority
    };
    engineCall('/messages', { method: 'POST', body: JSON.stringify(body) })
      .then(function() {
        toast('Message sent', 'success');
        setShowSend(false);
        setForm({ toAgentId: '', subject: '', content: '', priority: 'normal' });
        loadMessages();
        loadInbox();
        loadTopology();
      })
      .catch(function(e) { toast(e.message, 'error'); });
  };

  var refreshCurrent = function() {
    if (activeTab === 'all') loadMessages();
    else if (activeTab === 'inbox') loadInbox();
    else if (activeTab === 'topology') loadTopology();
  };

  var directionBadge = function(msg) {
    var dir = msg.direction || (msg.fromAgentId === agentId ? 'sent' : 'received');
    if (dir === 'sent' || dir === 'outbound') return h('span', { className: 'badge badge-primary' }, 'Sent');
    if (dir === 'received' || dir === 'inbound') return h('span', { className: 'badge badge-success' }, 'Received');
    return h('span', { className: 'badge badge-neutral' }, dir);
  };

  var priorityBadge = function(p) {
    if (p === 'urgent') return h('span', { className: 'badge badge-danger' }, 'Urgent');
    if (p === 'high') return h('span', { className: 'badge badge-warning' }, 'High');
    if (p === 'normal') return h('span', { className: 'badge badge-neutral' }, 'Normal');
    return h('span', { className: 'badge badge-neutral' }, p || 'Normal');
  };

  // Derive topology partners list
  var partners = [];
  if (topology) {
    var edges = topology.edges || [];
    var partnerMap = {};
    edges.forEach(function(edge) {
      var partnerId = null;
      var sent = 0;
      var received = 0;
      if (edge.from === agentId) {
        partnerId = edge.to;
        sent = edge.count || edge.messageCount || 1;
      } else if (edge.to === agentId) {
        partnerId = edge.from;
        received = edge.count || edge.messageCount || 1;
      }
      if (partnerId) {
        if (!partnerMap[partnerId]) partnerMap[partnerId] = { id: partnerId, sent: 0, received: 0 };
        partnerMap[partnerId].sent += sent;
        partnerMap[partnerId].received += received;
      }
    });
    partners = Object.keys(partnerMap).map(function(k) { return partnerMap[k]; });
  }

  return h('div', { className: 'card' },
    h('div', { className: 'card-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center' } }, 'Communication', h(HelpButton, { label: 'Communication' },
        h('p', null, 'Inter-agent messaging system. Agents can send messages to each other for coordination, task delegation, and information sharing.'),
        h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
          h('li', null, h('strong', null, 'All Messages'), ' — Complete message history (sent and received).'),
          h('li', null, h('strong', null, 'Inbox'), ' — Unread messages waiting for this agent. Mark as read after review.'),
          h('li', null, h('strong', null, 'Topology'), ' — Visual map of which agents communicate with each other and how frequently.')
        ),
        h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Use priority levels (urgent, high, normal, low) to help agents triage incoming messages.')
      )),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { className: 'btn btn-primary btn-sm', onClick: function() { setShowSend(true); } }, I.plus(), ' Send Message'),
        h('button', { className: 'btn btn-ghost btn-sm', onClick: refreshCurrent }, I.refresh(), ' Refresh')
      )
    ),
    h('div', { style: { borderBottom: '1px solid var(--border)' } },
      h('div', { className: 'tabs', style: { padding: '0 16px' } },
        h('div', { className: 'tab' + (activeTab === 'all' ? ' active' : ''), onClick: function() { setActiveTab('all'); } }, 'All Messages'),
        h('div', { className: 'tab' + (activeTab === 'inbox' ? ' active' : ''), onClick: function() { setActiveTab('inbox'); } }, 'Inbox'),
        h('div', { className: 'tab' + (activeTab === 'topology' ? ' active' : ''), onClick: function() { setActiveTab('topology'); } }, 'Topology')
      )
    ),
    h('div', { className: 'card-body-flush' },

      // All Messages Tab
      activeTab === 'all' && (
        messages.length === 0
          ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'No messages found for this agent')
          : h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null,
                  h('th', null, 'Time'),
                  h('th', null, 'Direction'),
                  h('th', null, 'From'),
                  h('th', null, 'To'),
                  h('th', null, 'Subject'),
                  h('th', null, 'Type'),
                  h('th', null, 'Priority')
                )
              ),
              h('tbody', null,
                messages.map(function(msg, i) {
                  return h('tr', { key: msg.id || i },
                    h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, new Date(msg.createdAt || msg.timestamp).toLocaleString()),
                    h('td', null, directionBadge(msg)),
                    h('td', null, renderAgentBadge(msg.fromAgentId, agentData)),
                    h('td', null, renderAgentBadge(msg.toAgentId, agentData)),
                    h('td', { style: { maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 } }, msg.subject || '-'),
                    h('td', null, msg.type ? h('span', { className: 'badge badge-info' }, msg.type) : '-'),
                    h('td', null, priorityBadge(msg.priority))
                  );
                })
              )
            )
      ),

      // Inbox Tab
      activeTab === 'inbox' && (
        inbox.length === 0
          ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'No inbox messages for this agent')
          : h('table', { className: 'data-table' },
              h('thead', null,
                h('tr', null,
                  h('th', null, 'Time'),
                  h('th', null, 'From'),
                  h('th', null, 'Subject'),
                  h('th', null, 'Type'),
                  h('th', null, 'Priority'),
                  h('th', null, 'Status'),
                  h('th', null, 'Actions')
                )
              ),
              h('tbody', null,
                inbox.map(function(msg, i) {
                  var isRead = msg.read || msg.status === 'read';
                  return h('tr', { key: msg.id || i, style: !isRead ? { fontWeight: 500 } : {} },
                    h('td', { style: { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } }, new Date(msg.createdAt || msg.timestamp).toLocaleString()),
                    h('td', null, renderAgentBadge(msg.fromAgentId, agentData)),
                    h('td', { style: { maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 } }, msg.subject || '-'),
                    h('td', null, msg.type ? h('span', { className: 'badge badge-info' }, msg.type) : '-'),
                    h('td', null, priorityBadge(msg.priority)),
                    h('td', null,
                      isRead
                        ? h('span', { className: 'badge badge-neutral' }, 'Read')
                        : h('span', { className: 'badge badge-warning' }, 'Unread')
                    ),
                    h('td', null,
                      !isRead && h('button', { className: 'btn btn-ghost btn-sm', onClick: function() { markRead(msg.id); } }, I.check(), ' Mark Read')
                    )
                  );
                })
              )
            )
      ),

      // Topology Tab
      activeTab === 'topology' && (
        partners.length === 0
          ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'No communication data yet')
          : h('div', { style: { padding: 16 } },
              h('div', { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 } }, 'Communication partners for this agent:'),
              h('div', { style: { display: 'grid', gap: 10 } },
                partners.map(function(p) {
                  return h('div', { key: p.id, style: { display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' } },
                    h('div', { style: { flex: 1 } }, renderAgentBadge(p.id, agentData)),
                    h('div', { style: { display: 'flex', gap: 16, fontSize: 12 } },
                      h('div', { style: { textAlign: 'center' } },
                        h('div', { style: { fontWeight: 700, fontSize: 16, color: 'var(--info)' } }, p.sent),
                        h('div', { style: { color: 'var(--text-muted)' } }, 'Sent')
                      ),
                      h('div', { style: { textAlign: 'center' } },
                        h('div', { style: { fontWeight: 700, fontSize: 16, color: 'var(--success)' } }, p.received),
                        h('div', { style: { color: 'var(--text-muted)' } }, 'Received')
                      )
                    )
                  );
                })
              )
            )
      )
    ),

    // Send Message Modal
    showSend && h('div', { className: 'modal-overlay', onClick: function() { setShowSend(false); } },
      h('div', { className: 'modal', style: { maxWidth: 540 }, onClick: function(e) { e.stopPropagation(); } },
        h('div', { className: 'modal-header' },
          h('h2', null, 'Send Message'),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: function() { setShowSend(false); } }, I.x())
        ),
        h('div', { className: 'modal-body' },
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'To Agent'),
            h('select', { className: 'input', value: form.toAgentId, onChange: function(e) { setForm(Object.assign({}, form, { toAgentId: e.target.value })); } },
              h('option', { value: '' }, '-- Select Recipient --'),
              agents.filter(function(a) { return a.id !== agentId; }).map(function(a) {
                var name = (a.config && a.config.displayName) || (a.config && a.config.name) || a.name || 'Agent';
                var email = a.config && a.config.email && a.config.email.address;
                return h('option', { key: a.id, value: a.id }, name + (email ? ' (' + email + ')' : ''));
              })
            )
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Subject'),
            h('input', { className: 'input', placeholder: 'Message subject', value: form.subject, onChange: function(e) { setForm(Object.assign({}, form, { subject: e.target.value })); } })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Content'),
            h('textarea', { className: 'input', style: { minHeight: 120 }, placeholder: 'Message content...', value: form.content, onChange: function(e) { setForm(Object.assign({}, form, { content: e.target.value })); } })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Priority'),
            h('select', { className: 'input', value: form.priority, onChange: function(e) { setForm(Object.assign({}, form, { priority: e.target.value })); } },
              h('option', { value: 'low' }, 'Low'),
              h('option', { value: 'normal' }, 'Normal'),
              h('option', { value: 'high' }, 'High'),
              h('option', { value: 'urgent' }, 'Urgent')
            )
          )
        ),
        h('div', { className: 'modal-footer' },
          h('button', { className: 'btn btn-ghost', onClick: function() { setShowSend(false); } }, 'Cancel'),
          h('button', { className: 'btn btn-primary', onClick: sendMessage }, 'Send Message')
        )
      )
    )
  );
}

