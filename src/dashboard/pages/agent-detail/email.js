import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, formatUptime, buildAgentDataMap, renderAgentBadge, showConfirm, getOrgId } from '../../components/utils.js';
import { I } from '../../components/icons.js';
import { E } from '../../assets/icons/emoji-icons.js';
import { ProviderLogo } from '../../assets/provider-logos.js';
import { Badge, EmptyState } from './shared.js?v=4';
import { HelpButton } from '../../components/help-button.js';

export function EmailSection(props) {
  var agentId = props.agentId;
  var engineAgent = props.engineAgent || {};
  var reload = props.reload;

  var app = useApp();
  var toast = app.toast;

  var _config = useState(null);
  var emailConfig = _config[0]; var setEmailConfig = _config[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _testing = useState(false);
  var testing = _testing[0]; var setTesting = _testing[1];
  var _testResult = useState(null);
  var testResult = _testResult[0]; var setTestResult = _testResult[1];
  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];
  var _showOauthHelp = useState(false);
  var showOauthHelp = _showOauthHelp[0]; var setShowOauthHelp = _showOauthHelp[1];

  // Form state
  var _form = useState({
    provider: 'imap',
    preset: '',
    email: '',
    password: '',
    imapHost: '',
    imapPort: 993,
    smtpHost: '',
    smtpPort: 587,
    oauthClientId: '',
    oauthClientSecret: '',
    oauthTenantId: 'common',
  });
  var form = _form[0]; var setForm = _form[1];

  function set(key, val) {
    setForm(function(prev) { var n = Object.assign({}, prev); n[key] = val; return n; });
  }

  // Load current config
  function loadConfig() {
    setLoading(true);
    engineCall('/bridge/agents/' + agentId + '/email-config')
      .then(function(d) {
        setEmailConfig(d);
        if (d.configured) {
          setForm(function(prev) { return Object.assign({}, prev, {
            provider: d.provider || 'imap',
            email: d.email || '',
            imapHost: d.imapHost || '',
            imapPort: d.imapPort || 993,
            smtpHost: d.smtpHost || '',
            smtpPort: d.smtpPort || 587,
            oauthClientId: d.oauthClientId || '',
            oauthTenantId: d.oauthTenantId || 'common',
          }); });
        } else {
          // Pre-fill email from agent identity
          var identity = (engineAgent.config || {}).identity || {};
          var agentEmail = identity.email || (engineAgent.config || {}).email || '';
          if (agentEmail && agentEmail.indexOf('@agenticmail.local') === -1) {
            set('email', agentEmail);
          }
        }
        setLoading(false);
      })
      .catch(function() { setLoading(false); });
  }

  useEffect(function() { loadConfig(); }, [agentId]);

  // Listen for OAuth popup completion
  useEffect(function() {
    function onMessage(e) {
      if (e.data && e.data.type === 'oauth-result') {
        if (e.data.status === 'success') {
          toast('Email connected successfully', 'success');
        } else {
          toast('OAuth failed: ' + (e.data.message || 'Unknown error'), 'error');
        }
        loadConfig();
        if (reload) reload();
      }
    }
    window.addEventListener('message', onMessage);
    return function() { window.removeEventListener('message', onMessage); };
  }, []);

  // Preset changed → auto-fill hosts
  var PRESETS = {
    microsoft365: { label: 'Microsoft 365 / Outlook', imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587 },
    gmail: { label: 'Google Workspace / Gmail', imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 587 },
    yahoo: { label: 'Yahoo Mail', imapHost: 'imap.mail.yahoo.com', imapPort: 993, smtpHost: 'smtp.mail.yahoo.com', smtpPort: 465 },
    zoho: { label: 'Zoho Mail', imapHost: 'imap.zoho.com', imapPort: 993, smtpHost: 'smtp.zoho.com', smtpPort: 587 },
    fastmail: { label: 'Fastmail', imapHost: 'imap.fastmail.com', imapPort: 993, smtpHost: 'smtp.fastmail.com', smtpPort: 587 },
    custom: { label: 'Custom IMAP/SMTP', imapHost: '', imapPort: 993, smtpHost: '', smtpPort: 587 },
  };

  function applyPreset(key) {
    var p = PRESETS[key];
    if (p) {
      setForm(function(prev) { return Object.assign({}, prev, { preset: key, imapHost: p.imapHost, imapPort: p.imapPort, smtpHost: p.smtpHost, smtpPort: p.smtpPort }); });
    }
  }

  // Save
  async function handleSave() {
    setSaving(true);
    try {
      var body = { provider: form.provider, email: form.email };
      if (form.provider === 'imap') {
        Object.assign(body, {
          password: form.password || undefined,
          preset: form.preset !== 'custom' ? form.preset : undefined,
          imapHost: form.imapHost,
          imapPort: form.imapPort,
          smtpHost: form.smtpHost,
          smtpPort: form.smtpPort,
        });
      } else if (form.provider === 'microsoft') {
        var baseUrl = window.location.origin;
        var hasOrgMs = emailConfig && emailConfig.orgEmailConfig && emailConfig.orgEmailConfig.provider === 'microsoft';
        Object.assign(body, {
          oauthClientId: form.oauthClientId || undefined,
          oauthClientSecret: form.oauthClientSecret || undefined,
          oauthTenantId: form.oauthTenantId,
          oauthRedirectUri: baseUrl + '/api/engine/oauth/callback',
          useOrgConfig: hasOrgMs && !form.oauthClientId ? true : undefined,
        });
      } else if (form.provider === 'google') {
        var gBaseUrl = window.location.origin;
        var hasOrgG = emailConfig && emailConfig.orgEmailConfig && emailConfig.orgEmailConfig.provider === 'google';
        Object.assign(body, {
          oauthClientId: form.oauthClientId || undefined,
          oauthClientSecret: form.oauthClientSecret || undefined,
          oauthRedirectUri: gBaseUrl + '/api/engine/oauth/callback',
          useOrgConfig: hasOrgG && !form.oauthClientId ? true : undefined,
        });
      }

      var result = await engineCall('/bridge/agents/' + agentId + '/email-config', {
        method: 'PUT',
        body: JSON.stringify(body),
      });

      if (result.emailConfig && result.emailConfig.oauthAuthUrl) {
        toast('OAuth configured — click "Authorize" to complete setup', 'info');
      } else {
        toast('Email configuration saved', 'success');
      }
      loadConfig();
      if (reload) reload();
    } catch (err) {
      toast(err.message, 'error');
    }
    setSaving(false);
  }

  // Test connection
  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      var result = await engineCall('/bridge/agents/' + agentId + '/email-config/test', { method: 'POST' });
      setTestResult(result);
      if (result.success) toast('Connection successful!', 'success');
      else toast('Connection failed: ' + (result.error || 'Unknown error'), 'error');
    } catch (err) {
      setTestResult({ success: false, error: err.message });
      toast('Test failed: ' + err.message, 'error');
    }
    setTesting(false);
  }

  // Disconnect
  async function handleDisconnect() {
    try {
      await engineCall('/bridge/agents/' + agentId + '/email-config', { method: 'DELETE' });
      toast('Email disconnected', 'success');
      setEmailConfig(null);
      setTestResult(null);
      loadConfig();
      if (reload) reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // Open OAuth window
  function openOAuth() {
    if (emailConfig && emailConfig.oauthAuthUrl) {
      window.open(emailConfig.oauthAuthUrl, '_blank', 'width=600,height=700');
    }
  }

  if (loading) return h('div', { className: 'card', style: { padding: 40, textAlign: 'center' } }, 'Loading email config...');

  var statusBadge = !emailConfig || !emailConfig.configured
    ? h('span', { className: 'badge badge-neutral' }, 'Not Connected')
    : emailConfig.status === 'connected'
      ? h('span', { className: 'badge badge-success' }, 'Connected')
      : emailConfig.status === 'configured'
        ? h('span', { className: 'badge badge-info' }, 'Configured')
        : emailConfig.status === 'awaiting_oauth'
          ? h('span', { className: 'badge badge-warning' }, 'Awaiting Authorization')
          : emailConfig.status === 'error'
            ? h('span', { className: 'badge badge-danger' }, 'Error')
            : h('span', { className: 'badge badge-neutral' }, emailConfig.status || 'Unknown');

  var labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' };
  var inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg-primary)', fontSize: 13, fontFamily: 'inherit' };
  var helpStyle = { fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' };

  return h('div', { className: 'card' },
    h('div', { className: 'card-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('div', null,
        h('h3', { className: 'card-title', style: { display: 'flex', alignItems: 'center' } }, 'Email Connection', h(HelpButton, { label: 'Email Connection' },
          h('p', null, 'Connect this agent to an email account so it can send and receive emails autonomously. Supports IMAP/SMTP (any provider), Microsoft OAuth, and Google OAuth.'),
          h('ul', { style: { paddingLeft: 20, margin: '4px 0 8px' } },
            h('li', null, h('strong', null, 'Email + Password'), ' — Works with any email provider. Use app passwords with 2FA.'),
            h('li', null, h('strong', null, 'Microsoft OAuth'), ' — For Microsoft 365 / Outlook. Requires Azure AD app registration.'),
            h('li', null, h('strong', null, 'Google OAuth'), ' — For Google Workspace / Gmail. Requires Google Cloud project.')
          ),
          h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 } }, h('strong', null, 'Tip: '), 'Create a dedicated email address for each agent (e.g., support-agent@company.com). Don\'t share your personal email — agents need their own accounts.')
        )),
        h('p', { style: { fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' } }, 'Connect this agent to an email account so it can send and receive emails.')
      ),
      statusBadge
    ),
    h('div', { className: 'card-body' },

      // ─── Org Email Config Banner ──────────────────────
      emailConfig && emailConfig.orgEmailConfig && h('div', { style: { padding: '12px 16px', background: 'var(--success-soft)', borderRadius: 'var(--radius)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 } },
        h('span', { style: { fontSize: 18 } }, '\u2705'),
        h('div', null,
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, 'Your organization has configured ', emailConfig.orgEmailConfig.label || emailConfig.orgEmailConfig.provider),
          h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Select ', emailConfig.orgEmailConfig.provider === 'google' ? 'Google OAuth' : 'Microsoft OAuth', ' below — Client ID and Secret will be inherited automatically.')
        )
      ),

      // ─── Provider Selection ─────────────────────────
      h('div', { style: { marginBottom: 20 } },
        h('label', { style: labelStyle }, 'Connection Method'),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 } },
          [
            { id: 'imap', label: 'Email + Password', desc: 'IMAP/SMTP — works with any email provider', icon: E.email(24) },
            { id: 'microsoft', label: 'Microsoft OAuth', desc: 'Azure AD / Entra ID — for M365 orgs', icon: ProviderLogo.microsoft(24) },
            { id: 'google', label: 'Google OAuth', desc: 'Google Workspace — for GWS orgs', icon: ProviderLogo.google(24) },
          ].map(function(m) {
            var selected = form.provider === m.id;
            return h('div', {
              key: m.id,
              onClick: function() { set('provider', m.id); },
              style: {
                padding: '14px 16px', borderRadius: 'var(--radius-lg)',
                border: selected ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: selected ? 'var(--accent-soft)' : 'var(--bg-secondary)',
                cursor: 'pointer', transition: 'all 0.15s',
              }
            },
              h('div', { style: { fontSize: 20, marginBottom: 4 } }, m.icon),
              h('div', { style: { fontWeight: 600, fontSize: 13, marginBottom: 2 } }, m.label),
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, m.desc)
            );
          })
        )
      ),

      // ─── IMAP/SMTP Config ───────────────────────────
      form.provider === 'imap' && h(Fragment, null,
        h('div', { style: { marginBottom: 16 } },
          h('label', { style: labelStyle }, 'Email Provider'),
          h('select', { style: inputStyle, value: form.preset, onChange: function(e) { applyPreset(e.target.value); } },
            h('option', { value: '' }, '-- Select your email provider --'),
            Object.entries(PRESETS).map(function(entry) {
              return h('option', { key: entry[0], value: entry[0] }, entry[1].label);
            })
          )
        ),

        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 } },
          h('div', null,
            h('label', { style: labelStyle }, 'Email Address *'),
            h('input', { style: inputStyle, type: 'email', value: form.email, placeholder: 'agent@company.com', onChange: function(e) { set('email', e.target.value); } }),
            h('p', { style: helpStyle }, 'The email address created for this agent in your email system')
          ),
          h('div', null,
            h('label', { style: labelStyle }, form.password ? 'App Password *' : 'App Password * (enter to set/update)'),
            h('input', { style: inputStyle, type: 'password', value: form.password, placeholder: emailConfig && emailConfig.configured ? '••••••••  (leave blank to keep current)' : 'Enter app password', onChange: function(e) { set('password', e.target.value); } }),
            h('p', { style: helpStyle }, 'For Microsoft 365: ', h('a', { href: 'https://mysignins.microsoft.com/security-info', target: '_blank', style: { color: 'var(--accent)' } }, 'Create app password'), ' | For Gmail: ', h('a', { href: 'https://myaccount.google.com/apppasswords', target: '_blank', style: { color: 'var(--accent)' } }, 'Create app password'))
          )
        ),

        // Server settings (auto-filled by preset, expandable for custom)
        (form.preset === 'custom' || form.preset === '') && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: 12, marginBottom: 16 } },
          h('div', null,
            h('label', { style: labelStyle }, 'IMAP Host *'),
            h('input', { style: inputStyle, value: form.imapHost, placeholder: 'imap.example.com', onChange: function(e) { set('imapHost', e.target.value); } })
          ),
          h('div', { style: { width: 80 } },
            h('label', { style: labelStyle }, 'Port'),
            h('input', { style: inputStyle, type: 'number', value: form.imapPort, onChange: function(e) { set('imapPort', parseInt(e.target.value) || 993); } })
          ),
          h('div', null,
            h('label', { style: labelStyle }, 'SMTP Host *'),
            h('input', { style: inputStyle, value: form.smtpHost, placeholder: 'smtp.example.com', onChange: function(e) { set('smtpHost', e.target.value); } })
          ),
          h('div', { style: { width: 80 } },
            h('label', { style: labelStyle }, 'Port'),
            h('input', { style: inputStyle, type: 'number', value: form.smtpPort, onChange: function(e) { set('smtpPort', parseInt(e.target.value) || 587); } })
          )
        ),

        form.preset && form.preset !== 'custom' && form.preset !== '' && h('div', { style: { padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 } },
          'Server: ', h('strong', null, form.imapHost), ':', form.imapPort, ' (IMAP) / ', h('strong', null, form.smtpHost), ':', form.smtpPort, ' (SMTP)',
          ' — ', h('a', { href: '#', onClick: function(e) { e.preventDefault(); set('preset', 'custom'); }, style: { color: 'var(--accent)' } }, 'Edit manually')
        ),

        h('div', { style: { padding: '12px 16px', background: 'var(--info-soft)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--info)', marginBottom: 16 } },
          h('strong', null, 'How to set up:'), h('br'),
          '1. Create an email account for this agent in your email system (e.g., Microsoft 365 Admin Center or Google Admin Console)', h('br'),
          '2. Create an app password for that account (regular passwords may not work with 2FA enabled)', h('br'),
          '3. Enter the email and app password above, select your provider, and hit Save', h('br'),
          '4. Click "Test Connection" to verify everything works'
        )
      ),

      // ─── Microsoft OAuth Config ─────────────────────
      form.provider === 'microsoft' && h(Fragment, null,
        h('div', { style: { padding: '12px 16px', background: 'var(--info-soft)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--info)', marginBottom: 16 } },
          h('strong', null, 'Setup Instructions:'), h('br'),
          '1. Go to ', h('a', { href: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade', target: '_blank', style: { color: 'var(--accent)' } }, 'Azure Portal → App Registrations'), h('br'),
          '2. Click "New Registration" → name it (e.g., "AgenticMail Agent") → set redirect URI to: ', h('code', { style: { background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 } }, window.location.origin + '/api/engine/oauth/callback'), h('br'),
          '3. Under "Certificates & Secrets" → create a Client Secret', h('br'),
          '4. Under "API Permissions" → add Microsoft Graph: Mail.ReadWrite, Mail.Send, offline_access', h('br'),
          '5. Copy the Application (client) ID and Client Secret below'
        ),

        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 } },
          h('div', null,
            h('label', { style: labelStyle }, 'Application (Client) ID *'),
            h('input', { style: inputStyle, value: form.oauthClientId, placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', onChange: function(e) { set('oauthClientId', e.target.value); } })
          ),
          h('div', null,
            h('label', { style: labelStyle }, 'Client Secret *'),
            h('input', { style: inputStyle, type: 'password', value: form.oauthClientSecret, placeholder: 'Enter client secret', onChange: function(e) { set('oauthClientSecret', e.target.value); } })
          )
        ),
        h('div', { style: { marginBottom: 16 } },
          h('label', { style: labelStyle }, 'Tenant ID'),
          h('input', { style: Object.assign({}, inputStyle, { maxWidth: 400 }), value: form.oauthTenantId, placeholder: 'common (or your tenant ID)', onChange: function(e) { set('oauthTenantId', e.target.value); } }),
          h('p', { style: helpStyle }, 'Use "common" for multi-tenant, or your org\'s tenant ID for single-tenant apps')
        ),

        emailConfig && emailConfig.status === 'awaiting_oauth' && h('div', { style: { padding: '12px 16px', background: 'var(--warning-soft)', borderRadius: 'var(--radius)', marginBottom: 16 } },
          h('div', { style: { fontWeight: 600, marginBottom: 4, fontSize: 13 } }, 'Authorization Required'),
          h('p', { style: { fontSize: 12, margin: '0 0 8px', color: 'var(--text-secondary)' } }, 'Click the button below to sign in with the agent\'s Microsoft account and grant email permissions.'),
          h('button', { className: 'btn btn-primary btn-sm', onClick: openOAuth }, 'Authorize with Microsoft')
        )
      ),

      // ─── Google OAuth Config ────────────────────────
      form.provider === 'google' && (function() {
        var hasOrg = emailConfig && emailConfig.orgEmailConfig && emailConfig.orgEmailConfig.provider === 'google';
        return h(Fragment, null,
        hasOrg
          ? h('div', { style: { padding: '12px 16px', background: 'var(--success-soft)', borderRadius: 'var(--radius)', fontSize: 12, marginBottom: 16 } },
              h('strong', null, '\u2705 Using organization Google Workspace credentials'), h('br'),
              'Client ID: ', h('code', { style: { fontSize: 11 } }, emailConfig.orgEmailConfig.oauthClientId), h('br'),
              h('span', { style: { color: 'var(--text-muted)' } }, 'Just click "Save Configuration" then authorize with the agent\'s Google account.')
            )
          : h('div', { style: { padding: '12px 16px', background: 'var(--info-soft)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--info)', marginBottom: 16 } },
              h('strong', null, 'Setup Instructions:'), h('br'),
              '1. Go to ', h('a', { href: 'https://console.cloud.google.com/apis/credentials', target: '_blank', style: { color: 'var(--accent)' } }, 'Google Cloud Console \u2192 Credentials'), h('br'),
              '2. Create an OAuth 2.0 Client ID (Web application) \u2192 add redirect URI: ', h('code', { style: { background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 } }, window.location.origin + '/api/engine/oauth/callback'), h('br'),
              '3. Enable the Gmail API in your project', h('br'),
              '4. Copy the Client ID and Client Secret below'
            ),

        !hasOrg && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 } },
          h('div', null,
            h('label', { style: labelStyle }, 'OAuth Client ID *'),
            h('input', { style: inputStyle, value: form.oauthClientId, placeholder: 'xxxx.apps.googleusercontent.com', onChange: function(e) { set('oauthClientId', e.target.value); } })
          ),
          h('div', null,
            h('label', { style: labelStyle }, 'Client Secret *'),
            h('input', { style: inputStyle, type: 'password', value: form.oauthClientSecret, placeholder: 'Enter client secret', onChange: function(e) { set('oauthClientSecret', e.target.value); } })
          )
        ),

        emailConfig && emailConfig.status === 'awaiting_oauth' && h('div', { style: { padding: '12px 16px', background: 'var(--warning-soft)', borderRadius: 'var(--radius)', marginBottom: 16 } },
          h('div', { style: { fontWeight: 600, marginBottom: 4, fontSize: 13 } }, 'Authorization Required'),
          h('p', { style: { fontSize: 12, margin: '0 0 8px', color: 'var(--text-secondary)' } }, 'Click the button below to sign in with the agent\'s Google account and grant Gmail permissions.'),
          h('button', { className: 'btn btn-primary btn-sm', onClick: openOAuth }, 'Authorize with Google')
        )
      ); })(),

      // ─── Test Result ─────────────────────────────────
      testResult && h('div', { style: { padding: '12px 16px', borderRadius: 'var(--radius)', marginBottom: 16, background: testResult.success ? 'var(--success-soft)' : 'var(--danger-soft)' } },
        testResult.success
          ? h(Fragment, null,
              h('div', { style: { fontWeight: 600, color: 'var(--success)', marginBottom: 4, fontSize: 13 } }, 'Connection Successful'),
              testResult.inbox && h('div', { style: { fontSize: 12, color: 'var(--text-secondary)' } }, 'Inbox: ', testResult.inbox.total, ' messages (', testResult.inbox.unread, ' unread)'),
              testResult.email && h('div', { style: { fontSize: 12, color: 'var(--text-secondary)' } }, 'Email: ', testResult.email)
            )
          : h(Fragment, null,
              h('div', { style: { fontWeight: 600, color: 'var(--danger)', marginBottom: 4, fontSize: 13 } }, 'Connection Failed'),
              h('div', { style: { fontSize: 12, color: 'var(--text-secondary)' } }, testResult.error || 'Unknown error')
            )
      ),

      // ─── Error display ────────────────────────────────
      emailConfig && emailConfig.lastError && h('div', { style: { padding: '8px 12px', background: 'var(--danger-soft)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--danger)', marginBottom: 16 } },
        h('strong', null, 'Last Error: '), emailConfig.lastError
      ),

      // ─── Actions ──────────────────────────────────────
      h('div', { style: { display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 16, flexWrap: 'wrap' } },
        h('button', { className: 'btn btn-primary', disabled: saving, onClick: handleSave }, saving ? 'Saving...' : 'Save Configuration'),
        emailConfig && emailConfig.configured && h('button', { className: 'btn btn-secondary', disabled: testing, onClick: handleTest }, testing ? 'Testing...' : 'Test Connection'),
        emailConfig && emailConfig.status === 'connected' && emailConfig.oauthProvider === 'google' && h('button', {
          className: 'btn btn-secondary',
          onClick: function() {
            engineCall('/bridge/agents/' + agentId + '/email-config/reauthorize', { method: 'POST', body: JSON.stringify({}) })
              .then(function(r) {
                if (r.oauthAuthUrl) {
                  toast('Opening Google re-authorization with ' + r.scopeCount + ' scopes...', 'info');
                  window.open(r.oauthAuthUrl, '_blank', 'width=600,height=700');
                } else {
                  toast('Failed: ' + (r.error || 'Unknown'), 'error');
                }
              })
              .catch(function(e) { toast('Error: ' + e.message, 'error'); });
          }
        }, 'Re-authorize (Update Scopes)'),
        emailConfig && emailConfig.configured && h('button', { className: 'btn btn-danger btn-ghost', onClick: function() { if (confirm('Disconnect email? The agent will no longer be able to send/receive.')) handleDisconnect(); } }, 'Disconnect')
      )
    )
  );
}

