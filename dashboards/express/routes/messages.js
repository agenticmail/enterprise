/**
 * AgenticMail Enterprise Dashboard — Messages Routes
 * GET /messages, POST /messages/send
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { apiGet, apiPost } = require('../utils/api');
const { layout } = require('../views/layout');
const { buildTable } = require('../views/components/table');
const { esc, badge, timeAgo } = require('../utils/helpers');

const router = Router();

router.get('/messages', requireAuth, async (req, res) => {
  const flash = req.session.flash;
  delete req.session.flash;

  const result = await apiGet('/engine/messages', req.session.token);
  const messages = result.status === 200
    ? (Array.isArray(result.body.messages) ? result.body.messages : (Array.isArray(result.body) ? result.body : []))
    : [];

  const directionVariant = { inbound: 'info', outbound: 'success', internal: 'default' };
  const channelVariant = { email: 'primary', api: 'warning', internal: 'default', webhook: 'info' };

  const rows = messages.map(m => [
    `<strong>${esc(m.from || m.sender || '-')}</strong>`,
    esc(m.to || m.recipient || '-'),
    esc(m.subject || '-'),
    badge(m.direction || '-', directionVariant[m.direction] || 'default'),
    badge(m.channel || '-', channelVariant[m.channel] || 'default'),
    `<span style="color:var(--text-muted);font-size:12px;max-width:200px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((m.body || m.content || '').substring(0, 80))}</span>`,
    `<span style="color:var(--text-muted)">${timeAgo(m.created_at || m.createdAt)}</span>`,
  ]);

  const table = buildTable(
    ['From', 'To', 'Subject', 'Direction', 'Channel', 'Preview', 'Sent'],
    rows,
    '&#9993;',
    'No messages found.'
  );

  const content = `
    <div class="page-header">
      <h1>Messages</h1>
      <p>View and send messages through AI agents</p>
    </div>
    <div class="card">
      <h3>Send Message</h3>
      <form method="post" action="/messages/send">
        <div class="form-row">
          <div class="form-group">
            <label>From</label>
            <input type="text" name="from" required placeholder="agent@company.com">
          </div>
          <div class="form-group">
            <label>To</label>
            <input type="text" name="to" required placeholder="recipient@example.com">
          </div>
        </div>
        <div class="form-group">
          <label>Subject</label>
          <input type="text" name="subject" required placeholder="Message subject">
        </div>
        <div class="form-group">
          <label>Body</label>
          <textarea name="body" rows="4" required placeholder="Message content..."></textarea>
        </div>
        <button class="btn btn-primary" type="submit">Send Message</button>
      </form>
    </div>
    <div class="card">
      <h3>All Messages (${messages.length})</h3>
      ${table}
    </div>`;

  res.send(layout('messages', req.session.user, content, flash));
});

router.post('/messages/send', requireAuth, async (req, res) => {
  const result = await apiPost('/engine/messages', req.session.token, {
    from: req.body.from,
    to: req.body.to,
    subject: req.body.subject,
    body: req.body.body,
  });

  if (result.status < 300) {
    req.session.flash = { message: 'Message sent', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to send message', type: 'danger' };
  }
  res.redirect('/messages');
});

module.exports = router;
