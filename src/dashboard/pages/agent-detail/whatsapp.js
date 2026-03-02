import { h, useState, useEffect, Fragment, useApp, engineCall } from '../../components/utils.js';
import { E } from '../../assets/icons/emoji-icons.js';

// ─── Styles ───
var card = { background: 'var(--bg-secondary)', borderRadius: '12px', padding: '24px', marginBottom: '16px', border: '1px solid var(--border)' };
var headerRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' };
var field = { marginBottom: '14px' };
var label = { display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' };
var input = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box' };
var btn = { padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' };
var btnP = Object.assign({}, btn, { background: 'var(--accent)', color: 'white' });
var btnS = Object.assign({}, btn, { background: 'var(--bg-tertiary)', color: 'var(--text-primary)' });
var btnD = Object.assign({}, btn, { background: '#dc3545', color: 'white' });
var btnSuccess = Object.assign({}, btn, { background: '#28a745', color: 'white' });
var tag = { display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', marginRight: '4px' };
var help = { fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' };
var dot = function(on) { return { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: on ? '#28a745' : '#6c757d', marginRight: '6px' }; };
var sectionTitle = { fontSize: '15px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' };
var divider = { borderTop: '1px solid var(--border)', margin: '20px 0' };
var textareaStyle = { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' };
var infoBox = function(color) { return { padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', border: '1px solid var(--border)', lineHeight: '1.5' }; };

// ════════════════════════════════════════
// Business Connection Card (own QR / own number)
// ════════════════════════════════════════
function BusinessConnectionCard(props) {
  var agentId = props.agentId;
  var config = props.config;
  var onSave = props.onSave;
  var toast = useApp().toast;
  var _qr = useState(null); var qr = _qr[0]; var setQr = _qr[1];
  var _status = useState(null); var status = _status[0]; var setStatus = _status[1];

  // Check business WhatsApp connection
  useEffect(function() {
    engineCall('/bridge/agents/' + agentId + '/whatsapp/status?mode=business').then(setStatus).catch(function() {});
  }, [agentId]);

  // Poll while QR shown
  useEffect(function() {
    if (!qr) return;
    var iv = setInterval(function() {
      engineCall('/bridge/agents/' + agentId + '/whatsapp/status?mode=business').then(function(s) {
        if (s.connected) {
            setQr(null); setStatus(s); toast('Business WhatsApp connected!', 'success'); clearInterval(iv);
            // Auto-send intro message to validate connection
            var phone = s.phone || s.selfJid;
            if (phone) {
              engineCall('/bridge/agents/' + agentId + '/whatsapp/test', {
                method: 'POST', body: JSON.stringify({ to: phone, mode: 'business' })
              }).then(function(r) {
                if (r.ok) toast('Intro message sent to verify connection!', 'success');
              }).catch(function() {});
            }
          }
      }).catch(function() {});
    }, 3000);
    return function() { clearInterval(iv); };
  }, [qr, agentId]);

  var connect = function() {
    toast('Connecting business number...', 'info');
    engineCall('/bridge/agents/' + agentId + '/whatsapp/connect', { method: 'POST', body: JSON.stringify({ mode: 'business' }) }).then(function(r) {
      if (r.qr) { setQr(r.qr); toast('QR code ready — scan it with your business WhatsApp', 'info'); }
      else if (r.status === 'connected') { toast('Already connected!', 'success'); setStatus({ connected: true, phone: r.phone, name: r.name }); }
    }).catch(function(e) { toast('Failed: ' + e.message, 'error'); });
  };

  var disconnect = function() {
    if (!confirm('Disconnect business WhatsApp? Customers will not be able to reach the agent until reconnected.')) return;
    engineCall('/bridge/agents/' + agentId + '/whatsapp/disconnect', { method: 'POST', body: JSON.stringify({ mode: 'business', logout: true }) })
      .then(function() { toast('Disconnected', 'info'); setStatus(null); setQr(null); onSave({ businessMode: false }); })
      .catch(function(e) { toast('Failed: ' + e.message, 'error'); });
  };

  var connected = status?.connected;
  var sameNumberActive = !!config.sameNumber;
  var effectivelyConnected = connected || sameNumberActive; // sameNumber uses personal connection
  var enabled = !!config.businessMode;

  return h('div', { style: Object.assign({}, card, effectivelyConnected ? { border: '1px solid #28a74550' } : {}) },
    h('div', { style: headerRow },
      h('div', { style: sectionTitle }, E.whatsapp(20), ' Business Number'),
      sameNumberActive
        ? h('span', { style: Object.assign({}, tag, { background: '#6366f120', color: '#6366f1' }) }, h('span', { style: dot(true) }), 'Shared number')
        : connected
          ? h('span', { style: Object.assign({}, tag, { background: '#28a74520', color: '#28a745' }) }, h('span', { style: dot(true) }), 'Connected')
          : h('span', { style: Object.assign({}, tag, { background: '#6c757d20', color: '#6c757d' }) }, 'Not connected')
    ),

    h('div', { style: { padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', lineHeight: '1.5', border: '1px solid var(--border)' } },
      h('strong', null, 'How it works:'), ' Link a dedicated phone number for your business. ',
      'Customers message this number and your agent handles their queries automatically.'
    ),

    // Same Number Mode toggle
    h('div', { style: { padding: '14px', background: 'var(--bg-tertiary)', borderRadius: '10px', marginBottom: '16px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } },
        h('div', null,
          h('div', { style: { fontWeight: '700', fontSize: '14px', marginBottom: '2px' } }, 'Use same phone number for both'),
          h('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' } },
            config.sameNumber
              ? 'Your personal WhatsApp connection (Channels tab) is also used for business. The agent recognizes your manager number and prioritizes you over customers.'
              : 'Business uses a separate dedicated phone number. Your personal WhatsApp stays private.'
          )
        ),
        h('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flexShrink: 0 } },
          h('input', { type: 'checkbox', checked: !!config.sameNumber,
            onChange: function(e) { onSave({ sameNumber: e.target.checked }); }
          }),
          h('span', { style: { fontSize: '13px', fontWeight: '600', color: config.sameNumber ? '#28a745' : 'var(--text-secondary)' } }, config.sameNumber ? 'On' : 'Off')
        )
      ),
      config.sameNumber && h('div', { style: { padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)', border: '1px solid var(--border)', marginTop: '8px', lineHeight: '1.5' } },
        E.check(14), ' Using your personal WhatsApp connection. Make sure it\'s connected in the ',
        h('strong', null, 'Channels'), ' tab. Set your manager phone number below so the agent knows who you are.'
      )
    ),

    // Manager Phone Number (shown when sameNumber is on, or always useful)
    h('div', { style: { marginBottom: '16px' } },
      h('div', { style: field },
        h('label', { style: label }, 'Manager Phone Number'),
        h('input', { type: 'tel', style: input,
          placeholder: '+13362763915',
          value: config.managerPhone || '',
          onBlur: function(e) { onSave({ managerPhone: e.target.value.trim() }); }
        }),
        h('div', { style: help },
          'Your phone number. When you message the agent on this number, it knows you\'re the manager and prioritizes your messages — even if multiple customer chats are active. ',
          h('strong', null, 'Required for same-number mode.'))
      )
    ),

    !config.sameNumber && h('div', { style: { padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', color: 'var(--text-secondary)', border: '1px solid var(--border)', lineHeight: '1.5' } },
      h('strong', null, 'Separate number mode.'), ' The personal connection in the ',
      h('strong', null, 'Channels'), ' tab is for you (the manager) to chat with your AI privately. ',
      'This page connects a second phone number for customer support. Two independent WhatsApp connections.'
    ),

    // Not connected — show setup (skip if sameNumber mode)
    !connected && !config.sameNumber && h('div', null,
      h('div', { style: { padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '10px', marginBottom: '16px' } },
        h('div', { style: { fontWeight: '700', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' } }, E.bolt(16), ' Setup Guide'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' } },
          h('div', { style: { display: 'flex', gap: '8px' } },
            h('div', { style: { width: '22px', height: '22px', borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 } }, '1'),
            h('div', null, h('strong', null, 'Get a phone number'), ' — Use a dedicated number for your business. Can be a new SIM, Google Voice, or existing WhatsApp Business number.')
          ),
          h('div', { style: { display: 'flex', gap: '8px' } },
            h('div', { style: { width: '22px', height: '22px', borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 } }, '2'),
            h('div', null, h('strong', null, 'Register on WhatsApp'), ' — Install WhatsApp or WhatsApp Business on a phone with that number. Set up the account.')
          ),
          h('div', { style: { display: 'flex', gap: '8px' } },
            h('div', { style: { width: '22px', height: '22px', borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 } }, '3'),
            h('div', null, h('strong', null, 'Scan the QR code below'), ' — Open WhatsApp on the business phone \u2192 Settings \u2192 Linked Devices \u2192 Link a Device \u2192 Scan the code.')
          )
        )
      ),
      !qr && h('div', { style: { textAlign: 'center' } },
        h('button', { style: Object.assign({}, btnP, { padding: '10px 24px', fontSize: '14px' }), onClick: connect }, 'Connect Business Number')
      ),
      qr && h('div', { style: { textAlign: 'center', padding: '16px' } },
        h('p', { style: { margin: '0 0 4px', fontWeight: '600', fontSize: '14px' } }, 'Scan with your business phone'),
        h('p', { style: { margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: '12px' } }, 'WhatsApp \u2192 Settings \u2192 Linked Devices \u2192 Link a Device'),
        h('div', { style: { background: 'white', borderRadius: '12px', display: 'inline-block', padding: '12px' } },
          h('img', { src: 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(qr), alt: 'QR', style: { width: '220px', height: '220px' } })
        )
      )
    ),

    // Same number mode — show shared connection status
    sameNumberActive && h('div', null,
      h('div', { style: { padding: '12px', background: '#6366f110', borderRadius: '8px', border: '1px solid #6366f130', marginBottom: '16px' } },
        h('div', { style: { fontSize: '14px', fontWeight: '600' } }, E.link(16), ' Using personal WhatsApp connection'),
        h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.5' } },
          'All messages come through your personal number. ',
          config.managerPhone
            ? h('span', null, 'Messages from ', h('strong', null, config.managerPhone), ' are recognized as the manager and get priority.')
            : h('span', { style: { color: '#ffc107' } }, 'Set your manager phone number above so the agent can identify you.')
        ),
        h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
          h('button', { style: Object.assign({}, btnP, { fontSize: '12px', padding: '4px 12px' }), onClick: function() {
            var to = prompt('Send test message to (e.g. +13362763915):');
            if (!to) return;
            engineCall('/bridge/agents/' + agentId + '/whatsapp/test', { method: 'POST', body: JSON.stringify({ to: to }) })
              .then(function(r) { toast(r.ok ? 'Sent!' : ('Failed: ' + (r.error || 'Unknown')), r.ok ? 'success' : 'error'); })
              .catch(function(e) { toast('Failed: ' + e.message, 'error'); });
          } }, 'Send Test Message')
        )
      )
    ),

    // Connected (separate number mode) — show status + enable toggle
    !sameNumberActive && connected && h('div', null,
      h('div', { style: { padding: '12px', background: '#28a74510', borderRadius: '8px', border: '1px solid #28a74530', marginBottom: '16px' } },
        h('div', { style: { fontSize: '14px', fontWeight: '600' } }, '\u2713 Connected as ', h('strong', null, status.phone || 'linked device')),
        status.name && h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' } }, status.name),
        h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
          h('button', { style: Object.assign({}, btnP, { fontSize: '12px', padding: '4px 12px' }), onClick: function() {
            var to = prompt('Send test message to (e.g. +13362763915):');
            if (!to) return;
            engineCall('/bridge/agents/' + agentId + '/whatsapp/test', { method: 'POST', body: JSON.stringify({ to: to, mode: 'business' }) })
              .then(function(r) { toast(r.ok ? 'Sent!' : ('Failed: ' + (r.error || 'Unknown')), r.ok ? 'success' : 'error'); })
              .catch(function(e) { toast('Failed: ' + e.message, 'error'); });
          } }, 'Send Test Message'),
          h('button', { style: Object.assign({}, btnD, { fontSize: '12px', padding: '4px 12px' }), onClick: disconnect }, 'Disconnect')
        )
      ),

      // Enable/disable business mode
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' } },
        h('div', null,
          h('div', { style: { fontWeight: '600', fontSize: '14px' } }, 'Accept customer messages'),
          h('div', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, enabled ? 'Customers can message this number and the agent will respond.' : 'Currently only trusted contacts can reach the agent on this number.')
        ),
        h('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' } },
          h('input', { type: 'checkbox', checked: enabled,
            onChange: function(e) { onSave({ businessMode: e.target.checked }); }
          }),
          h('span', { style: { fontSize: '13px', fontWeight: '600', color: enabled ? '#28a745' : 'var(--text-secondary)' } }, enabled ? 'Active' : 'Off')
        )
      ),

      enabled && h('div', { style: { marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px' } },
        h('span', { style: Object.assign({}, tag, { background: '#28a74520', color: '#28a745' }) }, 'Customer pairing'),
        h('span', { style: Object.assign({}, tag, { background: '#dc354520', color: '#dc3545' }) }, 'Prompt injection protection'),
        h('span', { style: Object.assign({}, tag, { background: '#6f42c120', color: '#6f42c1' }) }, 'Rate limiting'),
        h('span', { style: Object.assign({}, tag, { background: '#fd7e1420', color: '#fd7e14' }) }, 'Tool restrictions')
      )
    ),

    // Same number mode — show enable toggle (without needing separate connection)
    sameNumberActive && h('div', null,
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' } },
        h('div', null,
          h('div', { style: { fontWeight: '600', fontSize: '14px' } }, 'Accept customer messages'),
          h('div', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, enabled
            ? 'Anyone who messages your number (except you) is treated as a customer.'
            : 'Business mode is off. Only trusted contacts and your manager number can reach the agent.'
          )
        ),
        h('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' } },
          h('input', { type: 'checkbox', checked: enabled,
            onChange: function(e) { onSave({ businessMode: e.target.checked }); }
          }),
          h('span', { style: { fontSize: '13px', fontWeight: '600', color: enabled ? '#28a745' : 'var(--text-secondary)' } }, enabled ? 'Active' : 'Off')
        )
      ),

      enabled && h('div', { style: { marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px' } },
        h('span', { style: Object.assign({}, tag, { background: '#6366f120', color: '#6366f1' }) }, 'Manager priority'),
        h('span', { style: Object.assign({}, tag, { background: '#28a74520', color: '#28a745' }) }, 'Customer pairing'),
        h('span', { style: Object.assign({}, tag, { background: '#dc354520', color: '#dc3545' }) }, 'Prompt injection protection'),
        h('span', { style: Object.assign({}, tag, { background: '#6f42c120', color: '#6f42c1' }) }, 'Rate limiting')
      )
    )
  );
}

// ════════════════════════════════════════
// Customer Access Card (Pairing)
// ════════════════════════════════════════
function CustomerAccessCard(props) {
  var config = props.config;
  var onSave = props.onSave;
  var agentId = props.agentId;
  var toast = useApp().toast;
  var _pending = useState([]); var pending = _pending[0]; var setPending = _pending[1];

  useEffect(function() {
    engineCall('/bridge/agents/' + agentId + '/whatsapp/pairing-requests')
      .then(function(r) { setPending(r.requests || []); })
      .catch(function() {});
  }, [agentId]);

  var approvePairing = function(req) {
    engineCall('/bridge/agents/' + agentId + '/whatsapp/pairing-approve', {
      method: 'POST', body: JSON.stringify({ phone: req.phone, code: req.code })
    }).then(function() {
      toast('Approved ' + req.phone, 'success');
      // Add to customer contacts
      var customers = (config.approvedCustomers || []).concat([{ phone: req.phone, name: req.name, approvedAt: new Date().toISOString() }]);
      onSave({ approvedCustomers: customers });
      setPending(pending.filter(function(p) { return p.code !== req.code; }));
    }).catch(function(e) { toast('Failed: ' + e.message, 'error'); });
  };

  var rejectPairing = function(req) {
    engineCall('/bridge/agents/' + agentId + '/whatsapp/pairing-reject', {
      method: 'POST', body: JSON.stringify({ code: req.code })
    }).then(function() {
      toast('Rejected', 'info');
      setPending(pending.filter(function(p) { return p.code !== req.code; }));
    }).catch(function(e) { toast('Failed: ' + e.message, 'error'); });
  };

  var removeCustomer = function(i) {
    var customers = (config.approvedCustomers || []).filter(function(_, idx) { return idx !== i; });
    onSave({ approvedCustomers: customers });
  };

  return h('div', { style: card },
    h('div', { style: sectionTitle }, E.globe(20), ' Customer Access'),

    // Customer DM policy
    h('div', { style: field },
      h('label', { style: label }, 'Customer DM Policy'),
      h('select', { style: input, value: config.customerDmPolicy || 'pairing',
        onChange: function(e) { onSave({ customerDmPolicy: e.target.value }); }
      },
        h('option', { value: 'pairing' }, 'Pairing (recommended) \u2014 new customers get a code, you approve from here'),
        h('option', { value: 'open' }, 'Open \u2014 anyone can message (make sure security settings are strong!)'),
        h('option', { value: 'closed' }, 'Closed \u2014 no new customers (only previously approved)')
      ),
      h('div', { style: help },
        config.customerDmPolicy === 'open' ? '\u26a0\ufe0f Open mode: the agent responds to anyone. Prompt injection protection is strongly recommended.'
        : config.customerDmPolicy === 'closed' ? 'No new customers can reach the agent. Only previously approved customers can message.'
        : 'New customers receive a pairing code. Approve or reject them from the Pending Requests section below.'
      )
    ),

    h('div', { style: divider }),

    // Pending Pairing Requests
    (config.customerDmPolicy !== 'closed') && h('div', { style: { marginBottom: '16px' } },
      h('div', { style: Object.assign({}, sectionTitle, { fontSize: '13px' }) }, 'Pending Customer Requests ', pending.length > 0 && h('span', { style: Object.assign({}, tag, { background: '#ffc10730', color: '#ffc107' }) }, pending.length)),
      pending.length === 0
        ? h('div', { style: { padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center' } }, 'No pending requests. When a new customer messages your WhatsApp number, they\'ll appear here for approval.')
        : pending.map(function(req) {
            return h('div', { key: req.code, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#ffc10710', borderRadius: '8px', marginBottom: '6px', border: '1px solid #ffc10730' } },
              h('div', { style: { width: '36px', height: '36px', borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)', flexShrink: 0 } },
                (req.name || req.phone || '?').charAt(0).toUpperCase()
              ),
              h('div', { style: { flex: 1 } },
                h('div', { style: { fontWeight: '600', fontSize: '14px' } }, req.name || 'Unknown'),
                h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, req.phone),
                h('div', { style: { fontSize: '11px', color: 'var(--text-tertiary)' } }, 'Code: ', h('code', null, req.code), ' \u2022 ', new Date(req.timestamp).toLocaleString())
              ),
              h('button', { style: Object.assign({}, btnSuccess, { fontSize: '12px', padding: '4px 10px' }), onClick: function() { approvePairing(req); } }, 'Approve'),
              h('button', { style: Object.assign({}, btnD, { fontSize: '12px', padding: '4px 10px' }), onClick: function() { rejectPairing(req); } }, 'Reject')
            );
          })
    ),

    h('div', { style: divider }),

    // Approved Customers
    h('div', null,
      h('div', { style: Object.assign({}, sectionTitle, { fontSize: '13px' }) }, 'Approved Customers ', (config.approvedCustomers || []).length > 0 && h('span', { style: Object.assign({}, tag, { background: '#28a74520', color: '#28a745' }) }, (config.approvedCustomers || []).length)),
      (config.approvedCustomers || []).length === 0
        ? h('div', { style: { padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center' } }, 'No approved customers yet.')
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
            (config.approvedCustomers || []).map(function(c, i) {
              return h('div', { key: i, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '8px' } },
                h('div', null,
                  h('span', { style: { fontWeight: '600', fontSize: '13px' } }, c.name || c.phone),
                  c.name && h('span', { style: { fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '8px' } }, c.phone)
                ),
                h('button', { style: { background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: '12px' }, onClick: function() { removeCustomer(i); } }, 'Remove')
              );
            })
          )
    )
  );
}

// ════════════════════════════════════════
// Security Card (Prompt Injection + Guardrails)
// ════════════════════════════════════════
function SecurityCard(props) {
  var config = props.config;
  var onSave = props.onSave;

  return h('div', { style: Object.assign({}, card, { border: '1px solid #dc354540' }) },
    h('div', { style: sectionTitle }, E.shield(20), ' Security & Prompt Injection Protection'),

    h('div', { style: { padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', lineHeight: '1.5', border: '1px solid var(--border)' } },
      'Customer messages are treated as UNTRUSTED EXTERNAL CONTENT. Every incoming customer message is wrapped in security boundaries before the agent sees it. These settings add extra guardrails.'
    ),

    h('div', { style: field },
      h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked: config.promptInjectionDetection !== false,
          onChange: function(e) { onSave({ promptInjectionDetection: e.target.checked }); }
        }),
        h('span', { style: { fontSize: '14px', fontWeight: '600' } }, 'Detect prompt injection attempts')
      ),
      h('div', { style: Object.assign({}, help, { marginLeft: '26px' }) }, 'Scans messages for known injection patterns ("ignore previous instructions", "you are now a...", etc). Suspicious messages are flagged and logged.')
    ),

    h('div', { style: field },
      h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked: !!config.blockSuspiciousMessages,
          onChange: function(e) { onSave({ blockSuspiciousMessages: e.target.checked }); }
        }),
        h('span', { style: { fontSize: '14px', fontWeight: '600' } }, 'Block highly suspicious messages')
      ),
      h('div', { style: Object.assign({}, help, { marginLeft: '26px' }) }, 'Messages matching multiple injection patterns are blocked. The sender gets a generic "I can\'t help with that" reply.')
    ),

    h('div', { style: field },
      h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked: config.restrictCustomerTools !== false,
          onChange: function(e) { onSave({ restrictCustomerTools: e.target.checked }); }
        }),
        h('span', { style: { fontSize: '14px', fontWeight: '600' } }, 'Restrict tool access for customer conversations')
      ),
      h('div', { style: Object.assign({}, help, { marginLeft: '26px' }) }, 'Limits which tools the agent can use when talking to customers. Prevents customers from tricking the agent into accessing files, running commands, or sending emails.')
    ),

    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } },
      h('div', { style: field },
        h('label', { style: label }, 'Max Message Length'),
        h('input', { type: 'number', style: input, value: config.maxMessageLength || 2000, min: 100, max: 10000,
          onChange: function(e) { onSave({ maxMessageLength: parseInt(e.target.value) || 2000 }); }
        }),
        h('div', { style: help }, 'Messages longer than this are truncated.')
      ),
      h('div', { style: field },
        h('label', { style: label }, 'Rate Limit (msgs/min/sender)'),
        h('input', { type: 'number', style: input, value: config.rateLimit || 10, min: 1, max: 60,
          onChange: function(e) { onSave({ rateLimit: parseInt(e.target.value) || 10 }); }
        }),
        h('div', { style: help }, 'Prevents spam and brute-force attempts.')
      )
    )
  );
}

// ════════════════════════════════════════
// Business Settings Card
// ════════════════════════════════════════
function BusinessSettingsCard(props) {
  var config = props.config;
  var onSave = props.onSave;
  var sameNumber = props.sameNumber;

  return h('div', { style: card },
    h('div', { style: sectionTitle }, E.customers(20), ' Customer Experience'),

    sameNumber && h('div', { style: infoBox('#6366f1') },
      h('strong', null, 'Same number mode:'), ' When you message the agent, it recognizes your manager number and responds to you with full priority — even if it\'s in the middle of helping 10 customers. ',
      'Customer messages go into a queue; yours jump straight to the front.'
    ),

    h('div', { style: field },
      h('label', { style: label }, 'Greeting Message'),
      h('textarea', { rows: 2, style: textareaStyle,
        placeholder: 'Hi! Welcome to [Business Name]. How can I help you today?',
        value: config.greetingMessage || '',
        onBlur: function(e) { onSave({ greetingMessage: e.target.value }); }
      }),
      h('div', { style: help }, 'Sent to newly approved customers on their first interaction. Leave empty to let the agent respond naturally.')
    ),

    h('div', { style: field },
      h('label', { style: label }, 'Auto-Reply to Unknown Senders'),
      h('textarea', { rows: 2, style: textareaStyle,
        placeholder: 'Hi! I\'m an AI assistant for [Business]. Please wait while I generate your pairing code...',
        value: config.untrustedAutoReply || '',
        onBlur: function(e) { onSave({ untrustedAutoReply: e.target.value }); }
      }),
      h('div', { style: help }, 'Shown briefly before the pairing code. Leave empty for default message.')
    ),

    h('div', { style: { padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' } },
      E.timer(14), ' Business hours and away schedule are managed in the ', h('strong', null, 'Workforce'), ' tab. The agent automatically respects those settings for customer conversations too.'
    ),

    h('div', { style: divider }),

    // Custom agent instructions for customer conversations
    h('div', { style: field },
      h('label', { style: label }, 'Custom Instructions for Customer Conversations'),
      h('textarea', { rows: 4, style: textareaStyle,
        placeholder: 'Example: You are a helpful customer support agent for Agentic Mail. You help with order tracking, returns, and product questions. Never discuss internal pricing. Always be polite and professional.',
        value: config.customerSystemPrompt || '',
        onBlur: function(e) { onSave({ customerSystemPrompt: e.target.value }); }
      }),
      h('div', { style: help }, 'Additional instructions given to the agent when responding to customers. Define your brand voice, what the agent should/shouldn\'t discuss, and business-specific rules.')
    )
  );
}

// ════════════════════════════════════════
// Conversations Section (List + Detail)
// ════════════════════════════════════════
var PAGE_SIZE = 15;

function ConversationsCard(props) {
  var agentId = props.agentId;
  var _convos = useState([]); var convos = _convos[0]; var setConvos = _convos[1];
  var _total = useState(0); var total = _total[0]; var setTotal = _total[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _page = useState(0); var page = _page[0]; var setPage = _page[1];
  var _search = useState(''); var search = _search[0]; var setSearch = _search[1];
  var _searchDebounced = useState(''); var searchDebounced = _searchDebounced[0]; var setSearchDebounced = _searchDebounced[1];
  var _filter = useState('all'); var filter = _filter[0]; var setFilter = _filter[1];
  var _selected = useState(null); var selected = _selected[0]; var setSelected = _selected[1];

  // Debounce search
  useEffect(function() {
    var t = setTimeout(function() { setSearchDebounced(search); setPage(0); }, 300);
    return function() { clearTimeout(t); };
  }, [search]);

  // Fetch conversations
  useEffect(function() {
    setLoading(true);
    var params = 'limit=' + PAGE_SIZE + '&offset=' + (page * PAGE_SIZE);
    if (searchDebounced) params += '&search=' + encodeURIComponent(searchDebounced);
    if (filter === 'inbound') params += '&direction=inbound';
    else if (filter === 'outbound') params += '&direction=outbound';
    engineCall('/bridge/agents/' + agentId + '/whatsapp/conversations?' + params)
      .then(function(r) { setConvos(r.conversations || []); setTotal(r.total || 0); setLoading(false); })
      .catch(function() { setLoading(false); });
  }, [agentId, page, searchDebounced, filter]);

  var totalPages = Math.ceil(total / PAGE_SIZE);

  // If a conversation is selected, show the detail view
  if (selected) {
    return h(ConversationDetail, { agentId: agentId, contact: selected, onBack: function() { setSelected(null); } });
  }

  return h('div', { style: card },
    // Header
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' } },
      h('div', { style: sectionTitle }, E.chat(20), ' Conversations',
        total > 0 && h('span', { style: Object.assign({}, tag, { background: 'var(--bg-tertiary)', marginLeft: '4px' }) }, total)
      )
    ),

    // Search + Filter bar
    h('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } },
      h('div', { style: { flex: 1, position: 'relative' } },
        h('input', { style: Object.assign({}, input, { paddingLeft: '32px' }), placeholder: 'Search by name, number, or message...',
          value: search, onInput: function(e) { setSearch(e.target.value); }
        }),
        h('span', { style: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: '14px', lineHeight: 1 } }, E.eye(14))
      ),
      h('select', { style: Object.assign({}, input, { width: 'auto', minWidth: '120px' }), value: filter,
        onChange: function(e) { setFilter(e.target.value); setPage(0); }
      },
        h('option', { value: 'all' }, 'All messages'),
        h('option', { value: 'inbound' }, 'Customer msgs'),
        h('option', { value: 'outbound' }, 'Agent replies')
      )
    ),

    // Loading overlay
    loading && h('div', { style: { textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' } }, 'Loading...'),

    // Empty state
    !loading && convos.length === 0 && h('div', { style: { textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' } },
      h('div', { style: { marginBottom: '8px', opacity: 0.5 } }, E.chat(32)),
      searchDebounced ? 'No conversations match "' + searchDebounced + '"' : 'No conversations yet. They\'ll appear here once customers start messaging.'
    ),

    // Conversation list
    !loading && convos.length > 0 && h('div', null,
      convos.map(function(c) {
        var initial = (c.name || c.contactId || '?').charAt(0).toUpperCase();
        var colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16'];
        var colorIdx = (initial.charCodeAt(0) || 0) % colors.length;
        return h('div', { key: c.contactId,
          style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', cursor: 'pointer', transition: 'background 0.15s', marginBottom: '2px' },
          onClick: function() { setSelected(c); },
          onMouseEnter: function(e) { e.currentTarget.style.background = 'var(--bg-tertiary)'; },
          onMouseLeave: function(e) { e.currentTarget.style.background = 'transparent'; }
        },
          // Avatar
          h('div', { style: { width: '44px', height: '44px', borderRadius: '50%', background: colors[colorIdx] + '20', color: colors[colorIdx], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', fontWeight: '700', flexShrink: 0 } }, initial),
          // Info
          h('div', { style: { flex: 1, minWidth: 0 } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' } },
              h('div', { style: { fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' } },
                c.name || formatPhone(c.contactId),
                c.isTrusted && h('span', { style: Object.assign({}, tag, { background: '#28a74520', color: '#28a745', fontSize: '10px', padding: '1px 5px' }) }, 'Trusted'),
                c.isCustomer && h('span', { style: Object.assign({}, tag, { background: '#007bff20', color: '#007bff', fontSize: '10px', padding: '1px 5px' }) }, 'Customer')
              ),
              c.lastAt && h('div', { style: { fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0 } }, timeAgo(c.lastAt))
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
              c.lastDirection === 'outbound' && h('span', { style: { fontSize: '11px', color: 'var(--text-tertiary)' } }, '\u2713 '),
              h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } },
                c.lastMessage || 'No messages'
              )
            )
          ),
          // Stats
          h('div', { style: { textAlign: 'right', flexShrink: 0 } },
            h('div', { style: { fontSize: '12px', color: 'var(--text-tertiary)' } }, (c.messageCount || 0) + ' msgs'),
            h('div', { style: { fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' } },
              '\u2193' + (c.inboundCount || 0) + ' \u2191' + (c.outboundCount || 0)
            )
          )
        );
      })
    ),

    // Pagination
    totalPages > 1 && h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)' } },
      h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } },
        'Showing ' + (page * PAGE_SIZE + 1) + '-' + Math.min((page + 1) * PAGE_SIZE, total) + ' of ' + total
      ),
      h('div', { style: { display: 'flex', gap: '4px' } },
        h('button', { style: Object.assign({}, btnS, { padding: '4px 10px', fontSize: '12px', opacity: page === 0 ? 0.4 : 1 }),
          disabled: page === 0, onClick: function() { setPage(Math.max(0, page - 1)); }
        }, '\u2190 Prev'),
        // Page numbers
        Array.from({ length: Math.min(totalPages, 5) }, function(_, i) {
          var pNum = totalPages <= 5 ? i : (page <= 2 ? i : page >= totalPages - 3 ? totalPages - 5 + i : page - 2 + i);
          if (pNum < 0 || pNum >= totalPages) return h(Fragment, null);
          return h('button', { key: pNum,
            style: Object.assign({}, btnS, { padding: '4px 10px', fontSize: '12px', background: pNum === page ? 'var(--accent)' : 'var(--bg-tertiary)', color: pNum === page ? 'white' : 'var(--text-primary)', minWidth: '32px' }),
            onClick: function() { setPage(pNum); }
          }, pNum + 1);
        }),
        h('button', { style: Object.assign({}, btnS, { padding: '4px 10px', fontSize: '12px', opacity: page >= totalPages - 1 ? 0.4 : 1 }),
          disabled: page >= totalPages - 1, onClick: function() { setPage(Math.min(totalPages - 1, page + 1)); }
        }, 'Next \u2192')
      )
    )
  );
}

// ════════════════════════════════════════
// Conversation Detail View
// ════════════════════════════════════════
function ConversationDetail(props) {
  var agentId = props.agentId;
  var contact = props.contact;
  var onBack = props.onBack;
  var _messages = useState([]); var messages = _messages[0]; var setMessages = _messages[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _hasMore = useState(false); var hasMore = _hasMore[0]; var setHasMore = _hasMore[1];

  var loadMessages = function(before) {
    var url = '/bridge/agents/' + agentId + '/whatsapp/conversations/' + encodeURIComponent(contact.contactId) + '?limit=50';
    if (before) url += '&before=' + encodeURIComponent(before);
    engineCall(url).then(function(r) {
      var msgs = r.messages || [];
      if (before) {
        setMessages(msgs.concat(messages));
      } else {
        setMessages(msgs);
      }
      setHasMore(msgs.length >= 50);
      setLoading(false);
    }).catch(function() { setLoading(false); });
  };

  useEffect(function() { loadMessages(); }, [agentId, contact.contactId]);

  var loadOlder = function() {
    if (messages.length > 0) loadMessages(messages[0].timestamp);
  };

  return h('div', { style: card },
    // Header with back button
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' } },
      h('button', { style: Object.assign({}, btnS, { padding: '6px 10px', fontSize: '13px' }), onClick: onBack }, '\u2190 Back'),
      h('div', { style: { width: '36px', height: '36px', borderRadius: '50%', background: 'var(--accent)20', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: '700' } },
        (contact.name || contact.contactId || '?').charAt(0).toUpperCase()
      ),
      h('div', { style: { flex: 1 } },
        h('div', { style: { fontWeight: '600', fontSize: '15px' } }, contact.name || formatPhone(contact.contactId)),
        h('div', { style: { fontSize: '12px', color: 'var(--text-secondary)' } },
          formatPhone(contact.contactId), ' \u2022 ', (contact.messageCount || 0) + ' messages',
          contact.firstAt && (' \u2022 Since ' + new Date(contact.firstAt).toLocaleDateString())
        )
      ),
      h('div', { style: { display: 'flex', gap: '4px' } },
        contact.isTrusted && h('span', { style: Object.assign({}, tag, { background: '#28a74520', color: '#28a745' }) }, 'Trusted'),
        contact.isCustomer && h('span', { style: Object.assign({}, tag, { background: '#007bff20', color: '#007bff' }) }, 'Customer')
      )
    ),

    // Load older
    hasMore && h('div', { style: { textAlign: 'center', marginBottom: '12px' } },
      h('button', { style: Object.assign({}, btnS, { fontSize: '12px', padding: '4px 12px' }), onClick: loadOlder }, 'Load older messages')
    ),

    // Loading
    loading && h('div', { style: { textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' } }, 'Loading messages...'),

    // Messages
    !loading && messages.length === 0 && h('div', { style: { textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' } }, 'No messages in this conversation.'),

    !loading && messages.length > 0 && h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '500px', overflow: 'auto', padding: '8px 0' } },
      messages.map(function(msg, i) {
        var isAgent = msg.direction === 'outbound';
        var showDate = i === 0 || !sameDay(msg.timestamp, messages[i - 1].timestamp);
        return h(Fragment, { key: msg.id || i },
          showDate && h('div', { style: { textAlign: 'center', margin: '12px 0 8px', fontSize: '11px', color: 'var(--text-tertiary)' } },
            h('span', { style: { background: 'var(--bg-tertiary)', padding: '2px 10px', borderRadius: '10px' } }, formatDate(msg.timestamp))
          ),
          h('div', { style: { display: 'flex', justifyContent: isAgent ? 'flex-end' : 'flex-start' } },
            h('div', { style: {
              maxWidth: '75%', padding: '8px 12px', borderRadius: isAgent ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
              background: isAgent ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: isAgent ? 'white' : 'var(--text-primary)',
              fontSize: '13px', lineHeight: '1.5', wordBreak: 'break-word'
            } },
              h('div', null, msg.text),
              h('div', { style: { fontSize: '10px', opacity: 0.7, marginTop: '4px', textAlign: 'right' } }, formatTime(msg.timestamp))
            )
          )
        );
      })
    )
  );
}

// ─── Helpers ───
function timeAgo(ts) {
  var d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  return Math.floor(d / 86400000) + 'd ago';
}
function formatPhone(id) {
  if (!id) return '';
  var num = id.replace(/@.*$/, '').replace(/[^0-9+]/g, '');
  if (!num.startsWith('+')) num = '+' + num;
  return num;
}
function sameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}
function formatDate(ts) {
  var d = new Date(ts);
  var today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  var yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ════════════════════════════════════════
// Main Export
// ════════════════════════════════════════
export function WhatsAppSection(props) {
  var agentId = props.agentId;
  var engineAgent = props.engineAgent;
  var reload = props.reload;
  var setTab = props.setTab;
  var toast = useApp().toast;

  var agentConfig = engineAgent?.config || {};
  var channels = agentConfig.messagingChannels || {};
  var waConfig = channels.whatsapp || {};
  var businessConfig = waConfig.business || {};

  var saveBusiness = function(patch) {
    var updated = Object.assign({}, businessConfig, patch);
    var waUpdated = Object.assign({}, waConfig, { business: updated });
    var channelsUpdated = Object.assign({}, channels, { whatsapp: waUpdated });
    engineCall('/bridge/agents/' + agentId + '/config', {
      method: 'PUT',
      body: JSON.stringify({ messagingChannels: channelsUpdated }),
    }).then(function() {
      toast('Saved', 'success');
      reload();
    }).catch(function(e) { toast('Save failed: ' + e.message, 'error'); });
  };

  return h('div', null,
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' } },
      E.whatsapp(28),
      h('div', null,
        h('h2', { style: { margin: 0, fontSize: '20px' } }, 'WhatsApp Business'),
        h('p', { style: { margin: 0, fontSize: '13px', color: 'var(--text-secondary)' } }, 'Connect a dedicated business number for customer support \u2014 separate from your personal WhatsApp')
      )
    ),

    h(BusinessConnectionCard, { agentId: agentId, config: businessConfig, onSave: saveBusiness }),

    businessConfig.businessMode && h(Fragment, null,
      h(CustomerAccessCard, { config: businessConfig, onSave: saveBusiness, agentId: agentId }),
      h(SecurityCard, { config: businessConfig, onSave: saveBusiness }),
      h(BusinessSettingsCard, { config: businessConfig, onSave: saveBusiness, sameNumber: !!businessConfig.sameNumber }),
      h(ConversationsCard, { agentId: agentId })
    )
  );
}
