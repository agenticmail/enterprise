// Messages page — list and send messages

import { api } from '../api.js';
import { esc } from '../utils/escape.js';
import { toast } from '../utils/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { renderTable } from '../components/table.js';

var directionColors = {
  inbound:  { bg: 'rgba(43,138,62,0.08)',  color: 'var(--success)' },
  outbound: { bg: 'rgba(232,67,147,0.08)', color: 'var(--primary)' },
  internal: { bg: 'rgba(230,119,0,0.08)',   color: 'var(--warning)' }
};

var channelColors = {
  email:    { bg: 'rgba(43,138,62,0.08)',   color: 'var(--success)' },
  api:      { bg: 'rgba(232,67,147,0.08)',  color: 'var(--primary)' },
  internal: { bg: 'rgba(230,119,0,0.08)',    color: 'var(--warning)' },
  webhook:  { bg: 'rgba(136,136,160,0.12)', color: 'var(--text-dim)' }
};

function directionBadge(dir) {
  var c = directionColors[dir] || { bg: 'rgba(136,136,160,0.08)', color: 'var(--text-muted)' };
  return '<span class="badge" style="background:' + c.bg + ';color:' + c.color + '">' + esc(dir) + '</span>';
}

function channelBadge(chan) {
  var c = channelColors[chan] || { bg: 'rgba(136,136,160,0.08)', color: 'var(--text-muted)' };
  return '<span class="badge" style="background:' + c.bg + ';color:' + c.color + '">' + esc(chan) + '</span>';
}

export function loadMessages() {
  var el = document.getElementById('page-content');
  el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px"><div><h2 class="page-title">Messages</h2><p class="page-desc" style="margin:0">View and send messages through AI agents</p></div><button class="btn btn-primary" style="width:auto" id="btn-new-message">+ Send Message</button></div><div class="card"><div class="page-desc">Loading...</div></div>';

  document.getElementById('btn-new-message').onclick = function() {
    openModal('modal-message');
  };

  api('/engine/messages').then(function(d) {
    var messages = d.messages || [];
    if (messages.length === 0) {
      el.querySelector('.card').innerHTML = '<div class="empty"><div class="empty-icon">&#9993;</div>No messages found.</div>';
      return;
    }
    var rows = messages.map(function(m) {
      var preview = (m.body || m.content || '').substring(0, 80);
      var dir = m.direction || 'unknown';
      var chan = m.channel || 'unknown';
      return '<tr><td style="font-weight:600">' + esc(m.from || m.sender) + '</td><td>' + esc(m.to || m.recipient) + '</td><td>' + esc(m.subject) + '</td><td>' + directionBadge(dir) + '</td><td>' + channelBadge(chan) + '</td><td style="color:var(--text-muted);font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(preview) + '</td><td style="color:var(--text-muted);font-size:12px">' + new Date(m.created_at || m.createdAt).toLocaleDateString() + '</td></tr>';
    }).join('');
    el.querySelector('.card').innerHTML = renderTable(['From', 'To', 'Subject', 'Direction', 'Channel', 'Preview', 'Sent'], rows);
  }).catch(function() {
    el.querySelector('.card').innerHTML = '<div class="empty"><div class="empty-icon">&#9993;</div>No messages found.</div>';
  });
}

export function initMessageModal() {
  var form = document.querySelector('#modal-message form');
  if (form) {
    form.onsubmit = function(e) {
      sendMessage(e);
    };
  }
  var cancelBtn = document.querySelector('#modal-message .btn[type="button"]');
  if (cancelBtn) {
    cancelBtn.onclick = function() {
      closeModal('modal-message');
    };
  }
}

function sendMessage(e) {
  e.preventDefault();
  api('/engine/messages', {
    method: 'POST',
    body: {
      from: document.getElementById('msg-from').value,
      to: document.getElementById('msg-to').value,
      subject: document.getElementById('msg-subject').value,
      body: document.getElementById('msg-body').value,
    },
  })
    .then(function() {
      toast('Message sent!', 'success');
      closeModal('modal-message');
      loadMessages();
    })
    .catch(function(err) { toast(err.message, 'error'); });
}
