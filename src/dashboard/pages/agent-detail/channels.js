import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { HelpButton } from '../../components/help-button.js';

// ─── Styles ───

var cardStyle = { background: 'var(--bg-secondary)', borderRadius: '12px', padding: '24px', marginBottom: '16px', border: '1px solid var(--border)' };
var headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' };
var fieldStyle = { marginBottom: '12px' };
var labelStyle = { display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' };
var inputStyle = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box' };
var btnStyle = { padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' };
var btnPrimary = Object.assign({}, btnStyle, { background: 'var(--accent)', color: 'white' });
var btnSecondary = Object.assign({}, btnStyle, { background: 'var(--bg-tertiary)', color: 'var(--text-primary)' });
var btnDanger = Object.assign({}, btnStyle, { background: '#dc3545', color: 'white' });
var statusDot = function(on) { return { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: on ? '#28a745' : '#6c757d', marginRight: '6px' }; };
var tagStyle = { display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', marginRight: '4px' };
var helpStyle = { fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' };
var stepStyle = { display: 'flex', gap: '12px', marginBottom: '12px', fontSize: '13px' };
var stepNumStyle = { width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0 };
var stepDoneStyle = Object.assign({}, stepNumStyle, { background: '#28a745' });
var stepTextStyle = { flex: 1, paddingTop: '2px' };
var guideBox = { padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '10px', marginBottom: '16px', border: '1px solid var(--border)' };
var guideTitle = { fontSize: '14px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' };

function StepItem(props) {
  return h('div', { style: stepStyle },
    h('div', { style: props.done ? stepDoneStyle : stepNumStyle }, props.done ? '\u2713' : props.num),
    h('div', { style: stepTextStyle },
      h('div', { style: { fontWeight: '600', marginBottom: '2px' } }, props.title),
      props.desc && h('div', { style: { color: 'var(--text-secondary)', fontSize: '12px' } }, props.desc)
    )
  );
}

function TrustedContactsList(props) {
  var contacts = props.contacts;
  var onAdd = props.onAdd;
  var onRemove = props.onRemove;
  var placeholder = props.placeholder || '+1234567890';

  var _val = useState('');
  var val = _val[0]; var setVal = _val[1];
  var add = function() { if (val.trim()) { onAdd(val.trim()); setVal(''); } };

  return h('div', { style: fieldStyle },
    h('label', { style: labelStyle }, 'Trusted Contacts'),
    h('div', { style: helpStyle }, props.help || 'Only these contacts can reach the agent. Messages from unknown senders are ignored.'),
    h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
      h('input', { style: Object.assign({}, inputStyle, { flex: 1 }), placeholder: placeholder, value: val, onInput: function(e) { setVal(e.target.value); }, onKeyDown: function(e) { if (e.key === 'Enter') add(); } }),
      h('button', { style: btnSecondary, onClick: add }, 'Add')
    ),
    contacts.length > 0 && h('div', { style: { marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' } },
      contacts.map(function(c, i) {
        return h('span', { key: i, style: Object.assign({}, tagStyle, { background: 'var(--bg-tertiary)', cursor: 'pointer' }), onClick: function() { onRemove(i); }, title: 'Click to remove' }, c, ' \u00d7');
      })
    )
  );
}

function AccessModeSelect(props) {
  return h('div', { style: fieldStyle },
    h('label', { style: labelStyle }, 'Access Mode'),
    h('select', { style: inputStyle, value: props.value || 'trusted_only', onChange: function(e) { props.onChange(e.target.value); } },
      h('option', { value: 'trusted_only' }, 'Trusted contacts only'),
      h('option', { value: 'open' }, 'Anyone can message (use with caution)'),
      h('option', { value: 'manager_only' }, 'Manager only')
    )
  );
}

// ════════════════════════════════════════
// WhatsApp Card
// ════════════════════════════════════════

function WhatsAppCard(props) {
  var agentId = props.agentId;
  var config = props.config || {};
  var onSave = props.onSave;
  var toast = useApp().toast;

  var _qr = useState(null);
  var qr = _qr[0]; var setQr = _qr[1];
  var _status = useState(null);
  var status = _status[0]; var setStatus = _status[1];
  var _contacts = useState(config.trustedContacts || []);
  var contacts = _contacts[0]; var setContacts = _contacts[1];

  useEffect(function() {
    engineCall('/bridge/agents/' + agentId + '/whatsapp/status').then(setStatus).catch(function() {});
  }, [agentId]);

  // Poll status while QR is shown (detect scan completion + send intro)
  useEffect(function() {
    if (!qr) return;
    var iv = setInterval(function() {
      engineCall('/bridge/agents/' + agentId + '/whatsapp/status').then(function(s) {
        if (s.connected) {
          setQr(null); setStatus(s); toast('WhatsApp connected!', 'success'); clearInterval(iv);
          // Auto-send intro message to validate connection
          var phone = s.phone || s.selfJid;
          if (phone) {
            engineCall('/bridge/agents/' + agentId + '/whatsapp/test', {
              method: 'POST', body: JSON.stringify({ to: phone })
            }).then(function(r) {
              if (r.ok) toast('Intro message sent to your WhatsApp!', 'success');
            }).catch(function() {});
          }
        }
      }).catch(function() {});
    }, 3000);
    return function() { clearInterval(iv); };
  }, [qr, agentId]);

  var connectWhatsApp = function() {
    toast('Connecting to WhatsApp...', 'info');
    engineCall('/bridge/agents/' + agentId + '/whatsapp/connect', { method: 'POST' }).then(function(r) {
      if (r.qr) { setQr(r.qr); toast('QR code ready — scan it with WhatsApp', 'info'); }
      else if (r.status === 'connected') { toast('Already connected!', 'success'); setStatus({ connected: true, phone: r.phone, name: r.name }); }
      else { toast('Connection started — waiting for QR...', 'info'); }
    }).catch(function(e) { toast('Failed: ' + e.message, 'error'); });
  };

  var disconnect = function() {
    engineCall('/bridge/agents/' + agentId + '/whatsapp/disconnect', { method: 'POST', body: JSON.stringify({ logout: true }) })
      .then(function() { toast('Disconnected', 'info'); setStatus(null); setQr(null); })
      .catch(function(e) { toast('Failed: ' + e.message, 'error'); });
  };

  var connected = status?.connected;
  var step1Done = connected;
  var step2Done = contacts.length > 0;

  return h('div', { style: cardStyle },
    h('div', { style: headerStyle },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        E.whatsapp(24),
        h('div', null,
          h('h3', { style: { margin: 0, fontSize: '16px' } }, 'WhatsApp'),
          h('span', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, 'Your personal line \u2014 chat with your AI from your own number')
        )
      ),
      connected
        ? h('span', { style: Object.assign({}, tagStyle, { background: '#28a74520', color: '#28a745' }) }, h('span', { style: statusDot(true) }), 'Connected')
        : h('span', { style: Object.assign({}, tagStyle, { background: '#6c757d20', color: '#6c757d' }) }, 'Not connected')
    ),

    // Setup Guide
    h('div', { style: guideBox },
      h('div', { style: guideTitle }, E.bolt(16), ' Setup Guide'),
      h(StepItem, { num: '1', done: step1Done, title: 'Scan QR code to link this agent',
        desc: connected ? 'Connected as ' + (status.phone || status.name || 'linked device') : 'Click the button below to generate a QR code. Then open WhatsApp on your phone > Settings > Linked Devices > Link a Device > Scan the QR code.' }),
      h(StepItem, { num: '2', done: step2Done, title: 'Add trusted contacts',
        desc: 'Add phone numbers the agent should respond to. Your number should be first so the agent recognizes you as the manager.' }),
      h(StepItem, { num: '3', done: false, title: 'Send a message to test',
        desc: 'Open WhatsApp on your phone and send a message to yourself (or from another number). The agent will see it and respond.' })
    ),

    // Separation notice
    h('div', { style: { padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', color: 'var(--text-secondary)', border: '1px solid var(--border)', lineHeight: '1.5' } },
      h('strong', null, 'This is your personal WhatsApp connection.'), ' Use this to chat with your AI agent from your own phone number. ',
      'If you want customers or clients to reach the agent on a separate business number, set that up in the ',
      h('strong', null, 'WhatsApp Business'), ' tab instead \u2014 it uses its own dedicated phone number and has customer management, security, and pairing built in.'
    ),

    // Connection controls
    !connected && h('div', { style: { marginBottom: '16px' } },
      !qr && h('button', { style: btnPrimary, onClick: connectWhatsApp }, 'Connect WhatsApp'),
      qr && h('div', { style: { textAlign: 'center', padding: '20px', background: 'white', borderRadius: '8px', display: 'inline-block' } },
        h('p', { style: { margin: '0 0 8px', color: '#333', fontSize: '13px', fontWeight: '600' } }, 'Scan with WhatsApp on your phone:'),
        h('p', { style: { margin: '0 0 12px', color: '#666', fontSize: '12px' } }, 'WhatsApp > Settings > Linked Devices > Link a Device'),
        h('img', { src: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(qr), alt: 'QR', style: { width: '200px', height: '200px' } })
      )
    ),
    connected && h('div', { style: { marginBottom: '16px', padding: '12px', background: '#28a74510', borderRadius: '8px', border: '1px solid #28a74530' } },
      h('div', { style: { fontSize: '14px' } }, '\u2713 Connected as ', h('strong', null, status.phone || 'linked device')),
      status.name && h('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, status.name),
      status.lastMessageAt && h('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' } }, 'Last message: ' + new Date(status.lastMessageAt).toLocaleString()),
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
        h('button', { style: Object.assign({}, btnPrimary, { fontSize: '12px', padding: '4px 12px' }), onClick: function() {
          var to = prompt('Send test message to (phone number, e.g. +13362763915):');
          if (!to) return;
          engineCall('/bridge/agents/' + agentId + '/whatsapp/test', { method: 'POST', body: JSON.stringify({ to: to }) })
            .then(function(r) { if (r.ok) toast('Test message sent!', 'success'); else toast('Failed: ' + (r.error || 'Unknown'), 'error'); })
            .catch(function(e) { toast('Failed: ' + e.message, 'error'); });
        } }, 'Send Test Message'),
        h('button', { style: Object.assign({}, btnDanger, { fontSize: '12px', padding: '4px 12px' }), onClick: disconnect }, 'Disconnect & Unlink')
      )
    ),

    // Trusted contacts
    h(TrustedContactsList, {
      contacts: contacts, placeholder: '+13362763915',
      help: 'Phone numbers (with country code) the agent will respond to. Add your own number first.',
      onAdd: function(v) { var u = contacts.concat([v]); setContacts(u); onSave({ whatsapp: Object.assign({}, config, { trustedContacts: u }) }); },
      onRemove: function(i) { var u = contacts.filter(function(_, idx) { return idx !== i; }); setContacts(u); onSave({ whatsapp: Object.assign({}, config, { trustedContacts: u }) }); }
    }),

    h(AccessModeSelect, { value: config.accessMode, onChange: function(v) { onSave({ whatsapp: Object.assign({}, config, { accessMode: v }) }); } }),

    // Auto-reply for untrusted senders
    h('div', { style: { marginTop: '16px' } },
      h('label', { style: { display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' } }, 'Auto-Reply to Unknown Senders'),
      h('textarea', {
        rows: 3,
        style: { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' },
        placeholder: 'Leave empty for default message. Example: Hi! I\'m not set up to chat with you yet. Please contact my manager directly.',
        value: config.untrustedAutoReply || '',
        onBlur: function(e) { onSave({ whatsapp: Object.assign({}, config, { untrustedAutoReply: e.target.value }) }); }
      }),
      h('p', { style: { margin: '4px 0 0', fontSize: '11px', color: 'var(--text-tertiary)' } }, 'Sent once per hour to people not on the trusted contacts list.')
    )
  );
}

// ════════════════════════════════════════
// Telegram Card
// ════════════════════════════════════════

function TelegramCard(props) {
  var agentId = props.agentId;
  var config = props.config || {};
  var onSave = props.onSave;
  var toast = useApp().toast;

  var _editing = useState(false);
  var editing = _editing[0]; var setEditing = _editing[1];
  var _token = useState(config.botToken ? '\u2022\u2022\u2022\u2022\u2022\u2022' + (config.botToken || '').slice(-6) : '');
  var token = _token[0]; var setToken = _token[1];
  var _contacts = useState(config.trustedChatIds || []);
  var contacts = _contacts[0]; var setContacts = _contacts[1];
  var _botInfo = useState(config._botInfo || null);
  var botInfo = _botInfo[0]; var setBotInfo = _botInfo[1];
  var _validating = useState(false);
  var validating = _validating[0]; var setValidating = _validating[1];

  var hasToken = !!config.botToken;
  var step1Done = hasToken;
  var step2Done = contacts.length > 0;

  var saveToken = function() {
    if (token.startsWith('\u2022')) return;
    // Auto-validate before saving
    setValidating(true);
    engineCall('/bridge/agents/' + agentId + '/telegram/validate', {
      method: 'POST', body: JSON.stringify({ botToken: token })
    }).then(function(r) {
      setValidating(false);
      if (r.ok) {
        setBotInfo(r.bot);
        onSave({ telegram: Object.assign({}, config, { botToken: token, _botInfo: r.bot }) });
        setEditing(false);
        toast('Bot validated: @' + r.bot.username, 'success');
      } else {
        toast('Invalid token: ' + (r.error || 'Check and try again'), 'error');
      }
    }).catch(function(e) {
      setValidating(false);
      toast('Validation failed: ' + e.message, 'error');
    });
  };

  var sendTest = function() {
    if (contacts.length === 0) {
      toast('Add your Telegram user ID first', 'error');
      return;
    }
    var chatId = contacts[0];
    toast('Sending test message...', 'info');
    engineCall('/bridge/agents/' + agentId + '/telegram/test', {
      method: 'POST', body: JSON.stringify({ chatId: chatId })
    }).then(function(r) {
      toast(r.ok ? 'Test message sent! Check Telegram.' : ('Failed: ' + (r.error || 'Unknown')), r.ok ? 'success' : 'error');
    }).catch(function(e) { toast('Failed: ' + e.message, 'error'); });
  };

  return h('div', { style: cardStyle },
    h('div', { style: headerStyle },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        E.telegram(24),
        h('div', null,
          h('h3', { style: { margin: 0, fontSize: '16px' } }, 'Telegram'),
          h('span', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, 'Bot API — webhook or long-polling')
        )
      ),
      hasToken
        ? h('span', { style: Object.assign({}, tagStyle, { background: '#28a74520', color: '#28a745' }) },
            h('span', { style: statusDot(true) }), botInfo ? '@' + botInfo.username : 'Configured')
        : h('span', { style: Object.assign({}, tagStyle, { background: '#ffc10720', color: '#ffc107' }) }, 'Needs setup')
    ),

    // Info box
    h('div', { style: { padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', color: 'var(--text-secondary)', border: '1px solid var(--border)', lineHeight: '1.5' } },
      h('strong', null, 'This is your personal Telegram bot.'), ' Use this to chat with your AI agent via Telegram. ',
      'Create a bot through @BotFather, paste the token below, and start messaging your bot directly.'
    ),

    // Setup Guide
    h('div', { style: guideBox },
      h('div', { style: guideTitle }, E.bolt(16), ' Setup Guide'),
      h(StepItem, { num: '1', done: step1Done, title: 'Create a Telegram bot',
        desc: h(Fragment, null,
          'Open Telegram and search for ', h('strong', null, '@BotFather'), '. Send ', h('code', { style: { background: 'var(--bg-primary)', padding: '1px 4px', borderRadius: '3px' } }, '/newbot'), '. Follow the prompts to choose a name and username. BotFather will give you a bot token — paste it below.'
        ) }),
      h(StepItem, { num: '2', done: step2Done, title: 'Add your Telegram user ID',
        desc: h(Fragment, null,
          'Open Telegram and message ', h('strong', null, '@userinfobot'), ' — it will reply with your numeric user ID. Add it below so the agent knows to respond to you.'
        ) }),
      h(StepItem, { num: '3', done: false, title: 'Message your bot to test',
        desc: 'Find your bot by its username in Telegram and send it a message. The agent will receive it and respond.' })
    ),

    // Bot Token
    h('div', { style: fieldStyle },
      h('label', { style: labelStyle }, 'Bot Token'),
      editing
        ? h('div', { style: { display: 'flex', gap: '8px' } },
            h('input', { style: Object.assign({}, inputStyle, { flex: 1, fontFamily: 'monospace' }), placeholder: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz', value: token.startsWith('\u2022') ? '' : token, onInput: function(e) { setToken(e.target.value); },
              onKeyDown: function(e) { if (e.key === 'Enter') saveToken(); }
            }),
            h('button', { style: Object.assign({}, btnPrimary, { opacity: validating ? 0.7 : 1 }), onClick: saveToken, disabled: validating }, validating ? 'Validating...' : 'Save & Validate'),
            h('button', { style: btnSecondary, onClick: function() { setEditing(false); } }, 'Cancel')
          )
        : h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
            h('code', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, token || 'Not set'),
            h('button', { style: Object.assign({}, btnSecondary, { fontSize: '12px', padding: '4px 10px' }), onClick: function() { setEditing(true); setToken(''); } }, hasToken ? 'Change' : 'Add Token'),
            hasToken && contacts.length > 0 && h('button', { style: Object.assign({}, btnPrimary, { fontSize: '12px', padding: '4px 10px' }), onClick: sendTest }, 'Send Test Message')
          )
    ),

    // Trusted Chat IDs
    h(TrustedContactsList, {
      contacts: contacts, placeholder: '123456789',
      help: 'Telegram user IDs or group chat IDs. Get yours by messaging @userinfobot on Telegram.',
      onAdd: function(v) { var u = contacts.concat([v]); setContacts(u); onSave({ telegram: Object.assign({}, config, { trustedChatIds: u }) }); },
      onRemove: function(i) { var u = contacts.filter(function(_, idx) { return idx !== i; }); setContacts(u); onSave({ telegram: Object.assign({}, config, { trustedChatIds: u }) }); }
    }),

    h(AccessModeSelect, { value: config.accessMode, onChange: function(v) { onSave({ telegram: Object.assign({}, config, { accessMode: v }) }); } }),

    // Auto-reply for untrusted senders
    h('div', { style: { marginTop: '16px' } },
      h('label', { style: { display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' } }, 'Auto-Reply to Unknown Senders'),
      h('textarea', {
        rows: 3,
        style: { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' },
        placeholder: 'Leave empty for default message.',
        value: config.untrustedAutoReply || '',
        onBlur: function(e) { onSave({ telegram: Object.assign({}, config, { untrustedAutoReply: e.target.value }) }); }
      }),
      h('p', { style: { margin: '4px 0 0', fontSize: '11px', color: 'var(--text-tertiary)' } }, 'Sent once per hour to people not on the trusted contacts list.')
    ),

    // Delivery mode
    h('div', { style: fieldStyle },
      h('label', { style: labelStyle }, 'Delivery Mode'),
      h('select', { style: inputStyle, value: config.deliveryMode || 'auto',
        onChange: function(e) { onSave({ telegram: Object.assign({}, config, { deliveryMode: e.target.value }) }); }
      },
        h('option', { value: 'auto' }, 'Auto (webhook if public URL available, otherwise polling)'),
        h('option', { value: 'webhook' }, 'Webhook only (requires public URL like fly.io, VPS)'),
        h('option', { value: 'polling' }, 'Long-polling only (works everywhere)')
      ),
      h('div', { style: helpStyle }, 'Webhook is faster and more efficient. Polling works without a public URL (local machines, behind NAT).')
    )
  );
}

// ════════════════════════════════════════
// Manager Identity Card
// ════════════════════════════════════════

function ManagerIdentityCard(props) {
  var config = props.config || {};
  var onSave = props.onSave;

  var _wa = useState(config.whatsappNumber || '');
  var wa = _wa[0]; var setWa = _wa[1];
  var _tg = useState(config.telegramId || '');
  var tg = _tg[0]; var setTg = _tg[1];
  var save = function() {
    onSave({ managerIdentity: { whatsappNumber: wa.trim(), telegramId: tg.trim() } });
  };

  var hasAny = wa || tg;

  return h('div', { style: Object.assign({}, cardStyle, { border: '1px solid var(--accent)' }) },
    h('div', { style: headerStyle },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        E.shield(24),
        h('div', null,
          h('h3', { style: { margin: 0, fontSize: '16px' } }, 'Manager Identity'),
          h('span', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, 'How the agent recognizes you across platforms')
        )
      ),
      hasAny
        ? h('span', { style: Object.assign({}, tagStyle, { background: '#28a74520', color: '#28a745' }) }, 'Configured')
        : h('span', { style: Object.assign({}, tagStyle, { background: '#ffc10720', color: '#ffc107' }) }, 'Not set')
    ),

    h('div', { style: { padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', border: '1px solid var(--border)', lineHeight: '1.5' } },
      'Enter your phone number / user ID for each platform you use. The agent will recognize messages from these identities as coming from the boss — full trust, bypasses all access restrictions.'
    ),

    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } },
      h('div', null,
        h('label', { style: Object.assign({}, labelStyle, { display: 'flex', alignItems: 'center', gap: '4px' }) }, E.whatsapp(14), ' WhatsApp'),
        h('input', { style: inputStyle, placeholder: '+13362763915', value: wa, onInput: function(e) { setWa(e.target.value); } })
      ),
      h('div', null,
        h('label', { style: Object.assign({}, labelStyle, { display: 'flex', alignItems: 'center', gap: '4px' }) }, E.telegram(14), ' Telegram'),
        h('input', { style: inputStyle, placeholder: 'User ID from @userinfobot', value: tg, onInput: function(e) { setTg(e.target.value); } })
      )
    ),
    h('button', { style: Object.assign({}, btnPrimary, { marginTop: '12px' }), onClick: save }, 'Save Identity')
  );
}

// ════════════════════════════════════════
// Main Export
// ════════════════════════════════════════

export function ChannelsSection(props) {
  var agentId = props.agentId;
  var engineAgent = props.engineAgent;
  var reload = props.reload;
  var toast = useApp().toast;

  var agentConfig = engineAgent?.config || {};
  var channels = agentConfig.messagingChannels || {};
  var _caps = useState(null);
  var caps = _caps[0]; var setCaps = _caps[1];
  var _orgInfo = useState(null);
  var orgInfo = _orgInfo[0]; var setOrgInfo = _orgInfo[1];

  useEffect(function() {
    apiCall('/platform-capabilities').then(function(r) { setCaps(r.capabilities || r || {}); }).catch(function() {});
  }, []);

  useEffect(function() {
    if (engineAgent?.client_org_id) {
      apiCall('/organizations/' + engineAgent.client_org_id)
        .then(function(org) { setOrgInfo(org); })
        .catch(function() {});
    }
  }, [engineAgent?.client_org_id]);

  var orgName = orgInfo ? (orgInfo.name || orgInfo.display_name || 'Organization') : null;

  var saveChannelConfig = function(patch) {
    var updated = Object.assign({}, channels, patch);
    engineCall('/bridge/agents/' + agentId + '/config', {
      method: 'PUT',
      body: JSON.stringify({ messagingChannels: updated }),
    }).then(function() {
      toast('Saved', 'success');
      reload();
    }).catch(function(e) { toast('Save failed: ' + e.message, 'error'); });
  };

  var noChannels = !caps?.whatsapp && !caps?.telegram;

  return h('div', null,
    h('h2', { style: { fontSize: '20px', marginBottom: '16px', display: 'flex', alignItems: 'center' } }, 'Manager Messaging Channels', h(HelpButton, { label: 'Manager Messaging Channels' },
      h('p', null, 'Connect personal messaging platforms so you can chat with your AI agent directly from WhatsApp or Telegram. These are your private channels — for customer-facing messaging, use the WhatsApp Business tab.'),
      h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
        h('li', null, h('strong', null, 'Manager Identity'), ' — Set your phone number/user ID so the agent recognizes you across platforms.'),
        h('li', null, h('strong', null, 'WhatsApp'), ' — Link via QR code. Uses your personal WhatsApp as a linked device.'),
        h('li', null, h('strong', null, 'Telegram'), ' — Create a bot via @BotFather and paste the token.')
      ),
      h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Add trusted contacts to control who can message the agent. Only trusted contacts get responses — everyone else gets an auto-reply.')
    )),

    engineAgent?.client_org_id && orgName && h('div', { style: { padding: '12px 16px', background: 'var(--info-soft)', borderRadius: '8px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border)' } },
      I.building(),
      h('div', null,
        h('div', { style: { fontSize: 13, fontWeight: 600 } }, 'This agent belongs to ', h('strong', null, orgName), '.'),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 } }, 'Channel configurations are scoped to this organization. Messaging connections and trusted contacts apply within the organization context.')
      )
    ),

    noChannels && h('div', { style: Object.assign({}, cardStyle, { textAlign: 'center', padding: '40px' }) },
      h('div', { style: { marginBottom: '12px' } }, E.chat(40)),
      h('h3', { style: { margin: '0 0 8px' } }, 'No Manager Messaging Channels Enabled'),
      h('p', { style: { color: 'var(--text-secondary)', margin: '0 0 16px', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' } }, 'Enable WhatsApp or Telegram in Settings > Platform to let this agent communicate on messaging platforms.'),
      h('a', { href: '#settings', style: { color: 'var(--accent)', textDecoration: 'none', fontWeight: '600' } }, 'Go to Settings > Platform')
    ),

    !noChannels && h(ManagerIdentityCard, { config: channels.managerIdentity || {}, onSave: saveChannelConfig }),
    caps?.whatsapp && h(WhatsAppCard, { agentId: agentId, config: channels.whatsapp || {}, onSave: saveChannelConfig }),
    caps?.telegram && h(TelegramCard, { agentId: agentId, config: channels.telegram || {}, onSave: saveChannelConfig })
  );
}
