import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, engineCall, applyBrandColor, showConfirm, setOrgId, getOrgId } from '../components/utils.js';
import { I } from '../components/icons.js';
import { E } from '../assets/icons/emoji-icons.js';
import { Modal } from '../components/modal.js';
import { TagInput } from '../components/tag-input.js';
import { HelpButton } from '../components/help-button.js';
import { SETTINGS_HELP } from '../components/settings-help.js';
import { ProviderLogo } from '../assets/provider-logos.js';

export function SettingsPage() {
  const { toast } = useApp();
  const [tab, setTab] = useState('general');
  const [settings, setSettings] = useState({});
  const [apiKeys, setApiKeys] = useState([]);
  const [keyName, setKeyName] = useState('');
  const [newKeyPlaintext, setNewKeyPlaintext] = useState(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [ssoConfig, setSsoConfig] = useState({});
  const [deployCreds, setDeployCreds] = useState([]);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [deployForm, setDeployForm] = useState({ name: '', targetType: 'docker', config: {} });
  const [toolSec, setToolSec] = useState({ security: {}, middleware: {} });
  const [toolSecDirty, setToolSecDirty] = useState(false);
  const [toolSecSaving, setToolSecSaving] = useState(false);
  var _fw = useState({});
  var fw = _fw[0]; var setFw = _fw[1];
  var _fwDirty = useState(false);
  var fwDirty = _fwDirty[0]; var setFwDirty = _fwDirty[1];
  var _fwSaving = useState(false);
  var fwSaving = _fwSaving[0]; var setFwSaving = _fwSaving[1];
  var _fwTestIp = useState('');
  var fwTestIp = _fwTestIp[0]; var setFwTestIp = _fwTestIp[1];
  var _fwTestResult = useState(null);
  var fwTestResult = _fwTestResult[0]; var setFwTestResult = _fwTestResult[1];
  var _pricing = useState({ models: [], currency: 'USD' });
  var pricing = _pricing[0]; var setPricing = _pricing[1];
  var _pricingDirty = useState(false);
  var pricingDirty = _pricingDirty[0]; var setPricingDirty = _pricingDirty[1];
  var _pricingSaving = useState(false);
  var pricingSaving = _pricingSaving[0]; var setPricingSaving = _pricingSaving[1];
  var _showAddModel = useState(false);
  var showAddModel = _showAddModel[0]; var setShowAddModel = _showAddModel[1];
  var _newModel = useState({ provider: 'anthropic', modelId: '', displayName: '', inputCostPerMillion: 0, outputCostPerMillion: 0, contextWindow: 0 });
  var newModel = _newModel[0]; var setNewModel = _newModel[1];
  var _providers = useState([]);
  var providers = _providers[0]; var setProviders = _providers[1];
  var _showAddProvider = useState(false);
  var showAddProvider = _showAddProvider[0]; var setShowAddProvider = _showAddProvider[1];
  var _newProvider = useState({ id: '', name: '', baseUrl: '', apiType: 'openai-compatible', apiKeyEnvVar: '', customHeaders: '' });
  var newProvider = _newProvider[0]; var setNewProvider = _newProvider[1];
  var _discoverResults = useState({});
  var discoverResults = _discoverResults[0]; var setDiscoverResults = _discoverResults[1];
  var _apiKeyModal = useState(null); // { providerId, providerName, isUpdate }
  var apiKeyModal = _apiKeyModal[0]; var setApiKeyModal = _apiKeyModal[1];
  var _apiKeyInput = useState('');
  var apiKeyInput = _apiKeyInput[0]; var setApiKeyInput = _apiKeyInput[1];

  // Org Email Config
  var _orgEmail = useState({ configured: false, provider: '', oauthClientId: '', oauthClientSecret: '', oauthTenantId: 'common', label: '' });
  var orgEmail = _orgEmail[0]; var setOrgEmail = _orgEmail[1];
  var _orgEmailSaving = useState(false);
  var orgEmailSaving = _orgEmailSaving[0]; var setOrgEmailSaving = _orgEmailSaving[1];

  useEffect(() => {
    apiCall('/settings').then(d => { const s = d.settings || d || {}; setSettings(s); if (s.primaryColor) applyBrandColor(s.primaryColor); if (s.orgId) setOrgId(s.orgId); }).catch(() => {});
    apiCall('/api-keys').then(d => setApiKeys(d.keys || [])).catch(() => {});
    apiCall('/settings/sso').then(d => {
      const sso = d.ssoConfig || {};
      setSsoConfig(sso);
      setSettings(s => ({
        ...s,
        samlEntityId: sso.saml?.entityId || '', samlSsoUrl: sso.saml?.ssoUrl || '', samlCertificate: sso.saml?.certificate || '',
        oidcClientId: sso.oidc?.clientId || '', oidcClientSecret: sso.oidc?.clientSecret || '', oidcDiscoveryUrl: sso.oidc?.discoveryUrl || '',
      }));
    }).catch(() => {});
    engineCall('/deploy-credentials?orgId=' + getOrgId()).then(d => setDeployCreds(d.credentials || [])).catch(() => {});
    apiCall('/settings/org-email').then(d => {
      if (d.configured) setOrgEmail({ configured: true, provider: d.provider, oauthClientId: d.oauthClientId || '', oauthClientSecret: '', oauthTenantId: d.oauthTenantId || 'common', label: d.label || '' });
    }).catch(() => {});
    apiCall('/settings/tool-security').then(d => {
      var cfg = d.toolSecurityConfig || {};
      setToolSec({
        security: cfg.security || { pathSandbox: { enabled: true, allowedDirs: [], blockedPatterns: [] }, ssrf: { enabled: true, allowedHosts: [], blockedCidrs: [] }, commandSanitizer: { enabled: true, mode: 'blocklist', allowedCommands: [], blockedPatterns: [] } },
        middleware: cfg.middleware || { audit: { enabled: true, redactKeys: [] }, rateLimit: { enabled: true, overrides: {} }, circuitBreaker: { enabled: true }, telemetry: { enabled: true } }
      });
    }).catch(() => {});
    apiCall('/settings/firewall').then(function(d) {
      setFw(d.firewallConfig || {});
    }).catch(function() {});
    apiCall('/settings/model-pricing').then(function(d) {
      setPricing(d.modelPricingConfig || { models: [], currency: 'USD' });
    }).catch(function() {});
    apiCall('/providers').then(function(d) {
      setProviders(d.providers || d || []);
    }).catch(function() {});
  }, []);

  const createKey = async () => {
    try {
      const d = await apiCall('/api-keys', { method: 'POST', body: JSON.stringify({ name: keyName || 'New Key', scopes: ['read', 'write', 'admin'] }) });
      if (d.plaintext) { setNewKeyPlaintext(d.plaintext); setKeyCopied(false); }
      else toast('API Key created', 'success');
      setKeyName('');
      apiCall('/api-keys').then(d => setApiKeys(d.keys || [])).catch(() => {});
    } catch (e) { toast(e.message, 'error'); }
  };

  const copyKey = () => {
    if (newKeyPlaintext) { navigator.clipboard.writeText(newKeyPlaintext).then(() => { setKeyCopied(true); toast('Copied to clipboard', 'success'); }).catch(() => toast('Copy failed', 'error')); }
  };

  const revokeKey = async (id) => {
    const ok = await showConfirm({ title: 'Revoke API Key', message: 'Are you sure you want to revoke this API key? Any applications using this key will immediately lose access.', warning: 'This action cannot be undone. You will need to create a new key.', danger: true, confirmText: 'Revoke Key' });
    if (!ok) return;
    try { await apiCall('/api-keys/' + id, { method: 'DELETE' }); toast('Key revoked', 'success'); apiCall('/api-keys').then(d => setApiKeys(d.keys || [])); } catch (e) { toast(e.message, 'error'); }
  };

  const saveSetting = async (key, value) => {
    try { await apiCall('/settings', { method: 'PATCH', body: JSON.stringify({ [key]: value }) }); toast('Settings saved', 'success'); } catch (e) { toast(e.message, 'error'); }
  };

  const saveOrgEmail = async () => {
    if (!orgEmail.provider) { toast('Select a provider', 'error'); return; }
    if (!orgEmail.oauthClientId) { toast('Enter Client ID', 'error'); return; }
    if (!orgEmail.oauthClientSecret) { toast('Enter Client Secret', 'error'); return; }
    setOrgEmailSaving(true);
    try {
      var result = await apiCall('/settings/org-email', { method: 'PUT', body: JSON.stringify({ provider: orgEmail.provider, oauthClientId: orgEmail.oauthClientId, oauthClientSecret: orgEmail.oauthClientSecret, oauthTenantId: orgEmail.oauthTenantId }) });
      setOrgEmail(function(prev) { return Object.assign({}, prev, { configured: true, label: result.orgEmailConfig?.label || prev.label, oauthClientSecret: '' }); });
      toast('Organization email configuration saved', 'success');
    } catch (e) { toast(e.message, 'error'); }
    setOrgEmailSaving(false);
  };

  const removeOrgEmail = async () => {
    var ok = await showConfirm({ title: 'Remove Organization Email', message: 'Agents using this org-level config will need to be individually configured.', danger: true, confirmText: 'Remove' });
    if (!ok) return;
    try {
      await apiCall('/settings/org-email', { method: 'DELETE' });
      setOrgEmail({ configured: false, provider: '', oauthClientId: '', oauthClientSecret: '', oauthTenantId: 'common', label: '' });
      toast('Organization email configuration removed', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  const saveSaml = async () => {
    try {
      await apiCall('/settings/sso/saml', { method: 'PUT', body: JSON.stringify({ entityId: settings.samlEntityId, ssoUrl: settings.samlSsoUrl, certificate: settings.samlCertificate }) });
      toast('SAML configuration saved', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  const saveOidc = async () => {
    try {
      await apiCall('/settings/sso/oidc', { method: 'PUT', body: JSON.stringify({ clientId: settings.oidcClientId, clientSecret: settings.oidcClientSecret, discoveryUrl: settings.oidcDiscoveryUrl }) });
      toast('OIDC configuration saved', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  const testOidc = async () => {
    if (!settings.oidcDiscoveryUrl) { toast('Enter a Discovery URL first', 'error'); return; }
    try {
      const d = await apiCall('/settings/sso/oidc/test', { method: 'POST', body: JSON.stringify({ discoveryUrl: settings.oidcDiscoveryUrl }) });
      if (d.ok) toast('OIDC discovery OK — Issuer: ' + d.issuer, 'success');
      else toast('OIDC test failed: ' + (d.error || 'Unknown error'), 'error');
    } catch (e) { toast(e.message, 'error'); }
  };

  const removeSso = async (provider) => {
    const ok = await showConfirm({ title: 'Remove ' + provider.toUpperCase() + ' SSO', message: 'Are you sure? Users who sign in via ' + provider.toUpperCase() + ' will lose access.', danger: true, confirmText: 'Remove' });
    if (!ok) return;
    try {
      await apiCall('/settings/sso/' + provider, { method: 'DELETE' });
      toast(provider.toUpperCase() + ' configuration removed', 'success');
      setSsoConfig(c => { const n = { ...c }; delete n[provider]; return n; });
      if (provider === 'saml') setSettings(s => ({ ...s, samlEntityId: '', samlSsoUrl: '', samlCertificate: '' }));
      if (provider === 'oidc') setSettings(s => ({ ...s, oidcClientId: '', oidcClientSecret: '', oidcDiscoveryUrl: '' }));
    } catch (e) { toast(e.message, 'error'); }
  };

  const prefillOidc = (providerName, discoveryUrl) => {
    setSettings(s => ({ ...s, oidcDiscoveryUrl: discoveryUrl }));
    toast('Pre-filled ' + providerName + ' discovery URL. Enter your Client ID and Secret to complete setup.', 'info');
  };

  const createDeployCred = async () => {
    try {
      await engineCall('/deploy-credentials', { method: 'POST', body: JSON.stringify({ orgId: getOrgId(), name: deployForm.name, targetType: deployForm.targetType, config: deployForm.config }) });
      toast('Credential created', 'success');
      setShowDeployModal(false);
      setDeployForm({ name: '', targetType: 'docker', config: {} });
      engineCall('/deploy-credentials?orgId=' + getOrgId()).then(d => setDeployCreds(d.credentials || [])).catch(() => {});
    } catch (e) { toast(e.message, 'error'); }
  };

  const deleteDeployCred = async (id) => {
    const ok = await showConfirm({ title: 'Delete Credential', message: 'This will permanently delete the credential. Any deployments using it will fail.', danger: true, confirmText: 'Delete' });
    if (!ok) return;
    try {
      await engineCall('/deploy-credentials/' + id, { method: 'DELETE' });
      toast('Credential deleted', 'success');
      setDeployCreds(c => c.filter(x => x.id !== id));
    } catch (e) { toast(e.message, 'error'); }
  };

  return h(Fragment, null,
    h('div', { style: { marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 } },
      h('h1', { style: { fontSize: 20, fontWeight: 700, margin: 0 } }, 'Settings'),
      SETTINGS_HELP[tab] && h(HelpButton, { label: SETTINGS_HELP[tab].label }, SETTINGS_HELP[tab].content())
    ),
    h('div', { className: 'tabs' },
      ['general', 'models', 'api-keys', 'authentication', 'platform', 'email', 'deployments', 'security', 'network'].map(t =>
        h('div', { key: t, className: 'tab' + (tab === t ? ' active' : ''), onClick: () => setTab(t) }, { general: 'General', models: 'Models', 'api-keys': 'API Keys', authentication: 'Authentication', platform: 'Platform', email: 'Email & Domain', deployments: 'Deployments', security: 'Tool Security', network: 'Network & Firewall' }[t])
      )
    ),

    tab === 'general' && h('div', null,
      h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-header' }, h('h3', null, 'Organization')),
        h('div', { className: 'card-body' },
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Company Name'),
              h('input', { className: 'input', value: settings.name || '', onChange: e => setSettings(s => ({ ...s, name: e.target.value })) })
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Domain'),
              h('input', { className: 'input', value: settings.domain || '', onChange: e => setSettings(s => ({ ...s, domain: e.target.value })) })
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Subdomain'),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
                h('input', { className: 'input', value: settings.subdomain || '', onChange: e => setSettings(s => ({ ...s, subdomain: e.target.value })), style: { maxWidth: 200 } }),
                h('span', { style: { color: 'var(--text-muted)', fontSize: 13 } }, '.agenticmail.io')
              )
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Plan'),
              h('select', { className: 'input', value: settings.plan || 'self-hosted', onChange: e => setSettings(s => ({ ...s, plan: e.target.value })) },
                h('option', { value: 'self-hosted' }, 'Self-Hosted (Unlimited)'),
                h('option', { value: 'team' }, 'Team (25 agents)'),
                h('option', { value: 'enterprise' }, 'Enterprise (Unlimited + Support)'),
                h('option', { value: 'free' }, 'Free (3 agents)')
              ),
              h('p', { className: 'form-help' }, 'Self-hosted installations have no restrictions. Choose a plan tier to enforce agent limits.')
            )
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Logo URL'),
            h('input', { className: 'input', value: settings.logoUrl || '', onChange: e => setSettings(s => ({ ...s, logoUrl: e.target.value })), placeholder: 'https://yourcompany.com/logo.png' })
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Primary Brand Color'),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
              h('input', { type: 'color', value: settings.primaryColor || '#6366f1', onChange: e => { setSettings(s => ({ ...s, primaryColor: e.target.value })); applyBrandColor(e.target.value); }, style: { width: 40, height: 32, padding: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer' } }),
              h('input', { className: 'input', value: settings.primaryColor || '', onChange: e => { setSettings(s => ({ ...s, primaryColor: e.target.value })); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) applyBrandColor(e.target.value); }, style: { maxWidth: 120, fontFamily: 'var(--font-mono)', fontSize: 12 } })
            )
          ),
          h('button', { className: 'btn btn-primary', onClick: () => apiCall('/settings', { method: 'PATCH', body: JSON.stringify({ name: settings.name, domain: settings.domain, subdomain: settings.subdomain, logoUrl: settings.logoUrl, primaryColor: settings.primaryColor, plan: settings.plan }) }).then(d => { setSettings(d); toast('Settings saved', 'success'); }).catch(e => toast(e.message, 'error')) }, 'Save Changes')
        )
      ),

      // ─── Email Signature Template ─────────────────────
      h('div', { className: 'card' },
        h('div', { className: 'card-header' },
          h('h3', null, 'Email Signature Template'),
          h('span', { style: { fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 } }, 'Applied to all agents')
        ),
        h('div', { className: 'card-body' },
          h('p', { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 } }, 'Define an HTML signature template that agents will use in their Gmail accounts. Use {{name}}, {{role}}, {{email}}, {{phone}}, {{company}} as placeholders.'),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Signature HTML Template'),
            h('textarea', {
              className: 'input',
              value: settings.signatureTemplate || '',
              onChange: function(e) { setSettings(function(s) { return Object.assign({}, s, { signatureTemplate: e.target.value }); }); },
              placeholder: '<table cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; font-size: 13px; color: #333;">\n  <tr>\n    <td style="padding-right: 15px; border-right: 2px solid #6366f1;">\n      <img src="{{logo}}" width="60" alt="{{company}}">\n    </td>\n    <td style="padding-left: 15px;">\n      <b style="font-size: 14px;">{{name}}</b><br>\n      <span style="color: #6366f1;">{{role}}</span><br>\n      <span style="color: #888;">{{email}}</span><br>\n      <span style="color: #888;">{{company}}</span>\n    </td>\n  </tr>\n</table>',
              rows: 12,
              style: { fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }
            })
          ),
          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 } },
            h('span', { className: 'badge', style: { fontSize: 11 } }, '{{name}}'),
            h('span', { className: 'badge', style: { fontSize: 11 } }, '{{role}}'),
            h('span', { className: 'badge', style: { fontSize: 11 } }, '{{email}}'),
            h('span', { className: 'badge', style: { fontSize: 11 } }, '{{phone}}'),
            h('span', { className: 'badge', style: { fontSize: 11 } }, '{{company}}'),
            h('span', { className: 'badge', style: { fontSize: 11 } }, '{{logo}}')
          ),
          settings.signatureTemplate && h('div', { style: { marginBottom: 16 } },
            h('label', { className: 'form-label' }, 'Preview'),
            h('div', {
              style: { background: 'white', padding: 16, borderRadius: 'var(--radius)', border: '1px solid var(--border)', color: '#333' },
              dangerouslySetInnerHTML: {
                __html: (settings.signatureTemplate || '')
                  .replace(/\{\{name\}\}/g, 'Jane Smith')
                  .replace(/\{\{role\}\}/g, 'Customer Support Lead')
                  .replace(/\{\{email\}\}/g, 'jane@company.com')
                  .replace(/\{\{phone\}\}/g, '+1 (555) 123-4567')
                  .replace(/\{\{company\}\}/g, settings.name || 'Your Company')
                  .replace(/\{\{logo\}\}/g, settings.logoUrl || 'https://placehold.co/60x60?text=Logo')
              }
            })
          ),
          h('button', {
            className: 'btn btn-primary',
            onClick: function() {
              apiCall('/settings', {
                method: 'PATCH',
                body: JSON.stringify({ signatureTemplate: settings.signatureTemplate })
              }).then(function() { toast('Signature template saved', 'success'); }).catch(function(e) { toast(e.message, 'error'); });
            }
          }, 'Save Signature Template')
        )
      ),

      h('div', { className: 'card' },
        h('div', { className: 'card-header' },
          h('h3', null, 'Organization Email'),
          orgEmail.configured && h('span', { className: 'badge badge-success', style: { marginLeft: 8 } }, orgEmail.label || 'Configured')
        ),
        h('div', { className: 'card-body' },
          h('p', { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 } }, 'Set up a shared OAuth application for all agents. Each agent will still authorize individually with their own account, but they\'ll use the same Client ID and Secret.'),

          // Provider selector
          h('div', { style: { display: 'flex', gap: 12, marginBottom: 16 } },
            h('div', {
              onClick: function() { setOrgEmail(function(p) { return Object.assign({}, p, { provider: 'google' }); }); },
              style: { flex: 1, padding: '16px 12px', border: '2px solid ' + (orgEmail.provider === 'google' ? 'var(--accent)' : 'var(--border)'), borderRadius: 'var(--radius)', cursor: 'pointer', textAlign: 'center', background: orgEmail.provider === 'google' ? 'var(--accent-soft)' : 'var(--bg-primary)' }
            },
              h('div', { style: { marginBottom: 4, display: 'flex', justifyContent: 'center' } }, ProviderLogo.google(24)),
              h('div', { style: { fontSize: 13, fontWeight: 600 } }, 'Google Workspace'),
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Gmail API OAuth')
            ),
            h('div', {
              onClick: function() { setOrgEmail(function(p) { return Object.assign({}, p, { provider: 'microsoft' }); }); },
              style: { flex: 1, padding: '16px 12px', border: '2px solid ' + (orgEmail.provider === 'microsoft' ? 'var(--accent)' : 'var(--border)'), borderRadius: 'var(--radius)', cursor: 'pointer', textAlign: 'center', background: orgEmail.provider === 'microsoft' ? 'var(--accent-soft)' : 'var(--bg-primary)' }
            },
              h('div', { style: { marginBottom: 4, display: 'flex', justifyContent: 'center' } }, ProviderLogo.microsoft(24)),
              h('div', { style: { fontSize: 13, fontWeight: 600 } }, 'Microsoft 365'),
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Azure AD / Entra ID')
            )
          ),

          // Setup instructions
          orgEmail.provider && h('div', { style: { padding: '12px 16px', background: 'var(--info-soft)', borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)' } },
            h('strong', { style: { color: 'var(--accent)' } }, 'Setup Instructions:'), h('br'),
            orgEmail.provider === 'google'
              ? h(Fragment, null,
                  '1. Go to ', h('a', { href: 'https://console.cloud.google.com/apis/credentials', target: '_blank', style: { color: 'var(--accent)' } }, 'Google Cloud Console \u2192 Credentials'), h('br'),
                  '2. Create an OAuth 2.0 Client ID (Web application) \u2192 add redirect URI: ', h('code', { style: { background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3, fontSize: 11 } }, window.location.origin + '/api/engine/oauth/callback'), h('br'),
                  '3. Enable the Gmail API in your project', h('br'),
                  '4. Copy the Client ID and Client Secret below'
                )
              : h(Fragment, null,
                  '1. Go to ', h('a', { href: 'https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade', target: '_blank', style: { color: 'var(--accent)' } }, 'Azure Portal \u2192 App Registrations'), h('br'),
                  '2. Click "New Registration" \u2192 set redirect URI to: ', h('code', { style: { background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3, fontSize: 11 } }, window.location.origin + '/api/engine/oauth/callback'), h('br'),
                  '3. Copy the Client ID and create a Client Secret below'
                )
          ),

          // Credentials form
          orgEmail.provider && h(Fragment, null,
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 } },
              h('div', null,
                h('label', { className: 'form-label' }, 'OAuth Client ID *'),
                h('input', { className: 'input', value: orgEmail.oauthClientId, placeholder: orgEmail.provider === 'google' ? 'xxxx.apps.googleusercontent.com' : 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', onChange: function(e) { setOrgEmail(function(p) { return Object.assign({}, p, { oauthClientId: e.target.value }); }); } })
              ),
              h('div', null,
                h('label', { className: 'form-label' }, 'Client Secret *'),
                h('input', { className: 'input', type: 'password', value: orgEmail.oauthClientSecret, placeholder: orgEmail.configured ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (saved)' : 'Enter client secret', onChange: function(e) { setOrgEmail(function(p) { return Object.assign({}, p, { oauthClientSecret: e.target.value }); }); } })
              )
            ),
            orgEmail.provider === 'microsoft' && h('div', { style: { marginBottom: 12 } },
              h('label', { className: 'form-label' }, 'Tenant ID'),
              h('input', { className: 'input', style: { maxWidth: 400 }, value: orgEmail.oauthTenantId, placeholder: 'common', onChange: function(e) { setOrgEmail(function(p) { return Object.assign({}, p, { oauthTenantId: e.target.value }); }); } }),
              h('p', { className: 'form-help' }, 'Use "common" for multi-tenant or your specific tenant ID')
            ),
            h('div', { style: { display: 'flex', gap: 8 } },
              h('button', { className: 'btn btn-primary', disabled: orgEmailSaving, onClick: saveOrgEmail }, orgEmailSaving ? 'Saving...' : (orgEmail.configured ? 'Update Configuration' : 'Save Configuration')),
              orgEmail.configured && h('button', { className: 'btn btn-danger', onClick: removeOrgEmail }, 'Remove')
            )
          ),

          // Info about per-agent auth
          orgEmail.configured && h('div', { style: { marginTop: 16, padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text-muted)' } },
            '\u2139\uFE0F Each agent still needs to individually authorize via their Email tab. This org config provides the shared OAuth app credentials so agents don\'t need to enter Client ID/Secret individually.'
          )
        )
      ),
      h('div', { className: 'card', style: { marginTop: 16 } },
        h('div', { className: 'card-header' }, h('h3', null, 'Info')),
        h('div', { className: 'card-body' },
          h('div', { style: { display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 16px', fontSize: 13 } },
            h('span', { style: { color: 'var(--text-muted)' } }, 'Organization ID'), h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 12 } }, settings.orgId || settings.id || '-'),
            h('span', { style: { color: 'var(--text-muted)' } }, 'Version'), h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 12 } }, window.__ENTERPRISE_VERSION__ || settings.version || '-'),
            h('span', { style: { color: 'var(--text-muted)' } }, 'Created'), h('span', null, settings.createdAt ? new Date(settings.createdAt).toLocaleString() : '-'),
            h('span', { style: { color: 'var(--text-muted)' } }, 'Last Updated'), h('span', null, settings.updatedAt ? new Date(settings.updatedAt).toLocaleString() : '-')
          )
        )
      )
    ),

    tab === 'models' && h(Fragment, null,
      h(LLMProvidersTab, { toast: toast }),
      h('hr', { style: { border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' } }),
      h(ModelPricingTab, {
        pricing: pricing,
        setPricing: function(v) { setPricing(v); setPricingDirty(true); },
        saving: pricingSaving,
        dirty: pricingDirty,
        showAddModel: showAddModel,
        setShowAddModel: setShowAddModel,
        newModel: newModel,
        setNewModel: setNewModel,
        providers: providers,
        setProviders: setProviders,
        showAddProvider: showAddProvider,
        setShowAddProvider: setShowAddProvider,
        newProvider: newProvider,
        setNewProvider: setNewProvider,
        discoverResults: discoverResults,
        setDiscoverResults: setDiscoverResults,
        apiKeyModal: apiKeyModal,
        setApiKeyModal: setApiKeyModal,
        apiKeyInput: apiKeyInput,
        setApiKeyInput: setApiKeyInput,
        onSave: function() {
          setPricingSaving(true);
          apiCall('/settings/model-pricing', { method: 'PUT', body: JSON.stringify(pricing) }).then(function(d) {
            setPricing(d.modelPricingConfig || pricing);
            setPricingDirty(false);
            toast('Model pricing saved');
          }).catch(function(e) { toast(e.message, 'error'); }).finally(function() { setPricingSaving(false); });
        },
        onAddModel: function() {
          if (!newModel.modelId || !newModel.provider) { toast('Provider and Model ID are required', 'error'); return; }
          var updated = { ...pricing, models: [...(pricing.models || []), { ...newModel }] };
          setPricing(updated);
          setPricingDirty(true);
          setShowAddModel(false);
          setNewModel({ provider: 'anthropic', modelId: '', displayName: '', inputCostPerMillion: 0, outputCostPerMillion: 0, contextWindow: 0 });
        },
        onRemoveModel: function(idx) {
          var models = [...(pricing.models || [])];
          models.splice(idx, 1);
          setPricing({ ...pricing, models: models });
          setPricingDirty(true);
        },
        onUpdateModel: function(idx, field, value) {
          var models = [...(pricing.models || [])];
          models[idx] = { ...models[idx], [field]: value };
          setPricing({ ...pricing, models: models });
          setPricingDirty(true);
        },
        toast: toast,
      })
    ),

    tab === 'api-keys' && h(Fragment, null,
      newKeyPlaintext && h(Modal, { title: 'API Key Created', onClose: () => setNewKeyPlaintext(null) },
        h('div', { style: { marginBottom: 16 } },
          h('div', { style: { padding: 16, background: 'var(--warning-soft)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--warning)', marginBottom: 16 } }, 'Copy this key now. It will not be shown again.'),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
            h('input', { className: 'input', value: newKeyPlaintext, readOnly: true, style: { fontFamily: 'var(--font-mono)', fontSize: 12, flex: 1 }, onClick: e => e.target.select() }),
            h('button', { className: 'btn ' + (keyCopied ? 'btn-secondary' : 'btn-primary'), onClick: copyKey }, keyCopied ? [I.check(), ' Copied'] : [I.copy(), ' Copy'])
          )
        ),
        h('div', { style: { textAlign: 'right' } },
          h('button', { className: 'btn btn-secondary', onClick: () => setNewKeyPlaintext(null) }, 'Done')
        )
      ),
      h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-body' },
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
            h('input', { className: 'input', value: keyName, onChange: e => setKeyName(e.target.value), placeholder: 'Key name (e.g., production)', style: { maxWidth: 300 } }),
            h('button', { className: 'btn btn-primary', onClick: createKey }, I.plus(), ' Create Key')
          )
        )
      ),
      h('div', { className: 'card' },
        h('div', { className: 'card-body-flush' },
          apiKeys.length === 0 ? h('div', { style: { padding: 24, textAlign: 'center', color: 'var(--text-muted)' } }, 'No API keys')
          : h('table', null,
              h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Key Prefix'), h('th', null, 'Scopes'), h('th', null, 'Created'), h('th', null, 'Actions'))),
              h('tbody', null, apiKeys.map(k =>
                h('tr', { key: k.id },
                  h('td', null, h('strong', null, k.name)),
                  h('td', null, h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 12 } }, (k.keyPrefix || '???') + '...')),
                  h('td', null, (k.scopes || []).map(s => h('span', { key: s, className: 'badge badge-neutral', style: { marginRight: 4 } }, s))),
                  h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } }, k.createdAt ? new Date(k.createdAt).toLocaleDateString() : '-'),
                  h('td', null, h('button', { className: 'btn btn-danger btn-sm', onClick: () => revokeKey(k.id) }, 'Revoke'))
                )
              ))
            )
        )
      )
    ),

    tab === 'authentication' && h('div', null,
      h(TwoFactorCard, { toast: toast }),
      h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-header' }, h('h3', null, 'Single Sign-On (SSO)')),
        h('div', { className: 'card-body' },
          h('p', { style: { color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 } }, 'Configure SAML 2.0 or OIDC to let team members sign in with their corporate identity provider.'),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
            h('div', { className: 'preset-card', style: { cursor: 'default' } },
              h('h4', null, 'SAML 2.0'),
              h('p', null, 'Works with Okta, OneLogin, Azure AD, and any SAML 2.0 IdP.'),
              h('div', { className: 'form-group', style: { marginTop: 12 } },
                h('label', { className: 'form-label' }, 'Entity ID / Issuer'),
                h('input', { className: 'input', value: settings.samlEntityId || '', onChange: e => setSettings(s => ({ ...s, samlEntityId: e.target.value })), placeholder: 'https://your-idp.com/entity-id' })
              ),
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'SSO URL'),
                h('input', { className: 'input', value: settings.samlSsoUrl || '', onChange: e => setSettings(s => ({ ...s, samlSsoUrl: e.target.value })), placeholder: 'https://your-idp.com/sso' })
              ),
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Certificate (PEM)'),
                h('textarea', { className: 'input', rows: 3, value: settings.samlCertificate || '', onChange: e => setSettings(s => ({ ...s, samlCertificate: e.target.value })), placeholder: '-----BEGIN CERTIFICATE-----' })
              ),
              h('div', { style: { display: 'flex', gap: 8 } },
                h('button', { className: 'btn btn-primary btn-sm', onClick: saveSaml }, 'Save SAML Config'),
                ssoConfig.saml && h('button', { className: 'btn btn-sm', style: { color: 'var(--danger)' }, onClick: () => removeSso('saml') }, 'Remove')
              )
            ),
            h('div', { className: 'preset-card', style: { cursor: 'default' } },
              h('h4', null, 'OpenID Connect (OIDC)'),
              h('p', null, 'Works with Google Workspace, Microsoft Entra, Auth0, and any OIDC provider.'),
              h('div', { className: 'form-group', style: { marginTop: 12 } },
                h('label', { className: 'form-label' }, 'Client ID'),
                h('input', { className: 'input', value: settings.oidcClientId || '', onChange: e => setSettings(s => ({ ...s, oidcClientId: e.target.value })), placeholder: 'your-client-id' })
              ),
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Client Secret'),
                h('input', { className: 'input', type: 'password', value: settings.oidcClientSecret || '', onChange: e => setSettings(s => ({ ...s, oidcClientSecret: e.target.value })), placeholder: 'your-client-secret' })
              ),
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Discovery URL'),
                h('input', { className: 'input', value: settings.oidcDiscoveryUrl || '', onChange: e => setSettings(s => ({ ...s, oidcDiscoveryUrl: e.target.value })), placeholder: 'https://accounts.google.com/.well-known/openid-configuration' })
              ),
              h('div', { style: { display: 'flex', gap: 8 } },
                h('button', { className: 'btn btn-primary btn-sm', onClick: saveOidc }, 'Save OIDC Config'),
                h('button', { className: 'btn btn-secondary btn-sm', onClick: testOidc }, 'Test Discovery'),
                ssoConfig.oidc && h('button', { className: 'btn btn-sm', style: { color: 'var(--danger)' }, onClick: () => removeSso('oidc') }, 'Remove')
              )
            )
          )
        )
      ),
      h('div', { className: 'card' },
        h('div', { className: 'card-header' }, h('h3', null, 'Quick Setup — OAuth Providers')),
        h('div', { className: 'card-body' },
          h('p', { style: { color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 } }, 'Click a provider to pre-fill the OIDC Discovery URL above. You still need to create an OAuth app in the provider\'s console and enter your Client ID and Secret.'),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 } },
            [
              { name: 'Google', desc: 'Google Workspace / Gmail', discovery: 'https://accounts.google.com/.well-known/openid-configuration', svg: ProviderLogo.google(28) },
              { name: 'Microsoft', desc: 'Azure AD / Microsoft 365', discovery: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration', svg: ProviderLogo.microsoft(28) },
              { name: 'GitHub', desc: 'GitHub OAuth (no OIDC discovery)', discovery: null, svg: h('svg', { viewBox: '0 0 24 24', width: 28, height: 28, fill: 'currentColor' }, h('path', { d: 'M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z' })) },
              { name: 'Okta', desc: 'Okta / Auth0', discovery: 'https://your-org.okta.com/.well-known/openid-configuration', svg: h('svg', { viewBox: '0 0 24 24', width: 28, height: 28 }, h('circle', { cx: 12, cy: 12, r: 10, fill: 'none', stroke: '#007DC1', strokeWidth: 2.5 }), h('circle', { cx: 12, cy: 12, r: 4, fill: '#007DC1' })) },
              { name: 'Slack', desc: 'Sign in with Slack', discovery: 'https://slack.com/.well-known/openid-configuration', svg: h('svg', { viewBox: '0 0 24 24', width: 28, height: 28 }, h('path', { d: 'M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313z', fill: '#E01E5A' }), h('path', { d: 'M8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312z', fill: '#36C5F0' }), h('path', { d: 'M18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.163 0a2.528 2.528 0 012.523 2.522v6.312z', fill: '#2EB67D' }), h('path', { d: 'M15.163 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.163 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 01-2.52-2.523 2.527 2.527 0 012.52-2.52h6.315A2.528 2.528 0 0124 15.163a2.528 2.528 0 01-2.522 2.523h-6.315z', fill: '#ECB22E' })) },
              { name: 'LDAP', desc: 'Active Directory / LDAP', discovery: null, disabled: true, svg: h('svg', { viewBox: '0 0 24 24', width: 28, height: 28, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }, h('path', { d: 'M12 2L3 7v10l9 5 9-5V7l-9-5z' }), h('path', { d: 'M12 22V12' }), h('path', { d: 'M3 7l9 5 9-5' })) }
            ].map(p => {
              var isConfigured = ssoConfig.oidc && p.discovery && ssoConfig.oidc.discoveryUrl && ssoConfig.oidc.discoveryUrl.indexOf(new URL(p.discovery).hostname.split('.').slice(-2).join('.')) !== -1;
              return h('div', { key: p.name, style: { padding: 16, border: '1px solid ' + (isConfigured ? 'var(--success)' : 'var(--border)'), borderRadius: 'var(--radius)', textAlign: 'center', opacity: p.disabled ? 0.5 : 1, background: isConfigured ? 'rgba(34,197,94,0.06)' : 'transparent', position: 'relative' } },
                isConfigured && h('div', { style: { position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: '50%', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 } }, '\u2713'),
                h('div', { style: { marginBottom: 8, display: 'flex', justifyContent: 'center' } }, p.svg),
                h('div', { style: { fontWeight: 600, fontSize: 13, marginBottom: 4 } }, p.name),
                h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 } }, p.desc),
                isConfigured
                  ? h('div', { style: { fontSize: 12, color: 'var(--success)', fontWeight: 600 } }, 'Configured')
                  : h('button', { className: 'btn btn-secondary btn-sm', style: { width: '100%', justifyContent: 'center' }, disabled: p.disabled, onClick: p.discovery ? () => prefillOidc(p.name, p.discovery) : p.disabled ? undefined : () => toast('GitHub uses OAuth, not OIDC. Configure Client ID and Secret manually in the OIDC form above.', 'info') }, p.disabled ? 'Coming Soon' : 'Use ' + p.name)
              );
            })
          )
        )
      )
    ),

    tab === 'platform' && h(PlatformCapabilitiesTab, { toast: toast }),

    tab === 'email' && h('div', null,
      // Saved configurations summary
      (settings.smtpUser || settings.cfApiToken) && h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-header' }, h('h3', null, 'Active Email Configuration')),
        h('div', { className: 'card-body' },
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
            settings.smtpUser && h('div', { style: { padding: 12, background: 'var(--bg-success, rgba(34,197,94,0.08))', borderRadius: 'var(--radius)', border: '1px solid var(--border)' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
                h('span', { style: { color: '#22c55e', fontSize: 18 } }, '\u2713'),
                h('strong', null, 'Relay Configured')
              ),
              h('div', { style: { fontSize: 13, color: 'var(--text-secondary)' } },
                h('div', null, 'Host: ', h('code', null, settings.smtpHost || 'smtp.gmail.com')),
                h('div', null, 'User: ', h('code', null, settings.smtpUser)),
                h('div', null, 'Password: ', h('code', null, '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'))
              )
            ),
            settings.cfApiToken && h('div', { style: { padding: 12, background: 'var(--bg-success, rgba(34,197,94,0.08))', borderRadius: 'var(--radius)', border: '1px solid var(--border)' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
                h('span', { style: { color: '#22c55e', fontSize: 18 } }, '\u2713'),
                h('strong', null, 'Custom Domain Configured')
              ),
              h('div', { style: { fontSize: 13, color: 'var(--text-secondary)' } },
                h('div', null, 'Domain: ', h('code', null, settings.domain || 'Not set')),
                h('div', null, 'CF Token: ', h('code', null, (settings.cfApiToken || '').slice(0, 8) + '\u2022\u2022\u2022\u2022')),
                h('div', null, 'CF Account: ', h('code', null, settings.cfAccountId || 'Not set'))
              )
            )
          )
        )
      ),
      h('div', { className: 'card' },
        h('div', { className: 'card-header' }, h('h3', null, 'Email & Domain Configuration')),
        h('div', { className: 'card-body' },
          h('p', { style: { color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 } }, 'Configure how agents send and receive email. Choose between a relay (Gmail/Outlook forwarding) or a custom domain with full DKIM/SPF/DMARC.'),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
            h('div', { className: 'preset-card', style: { cursor: 'default' } },
              h('h4', null, 'Gmail / Outlook Relay'),
              h('p', { style: { marginBottom: 12 } }, 'Easy setup. Agents send from yourname+agent@gmail.com. Best for getting started.'),
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Email Address'),
                h('input', { className: 'input', value: settings.smtpUser || '', onChange: e => setSettings(s => ({ ...s, smtpUser: e.target.value })), placeholder: 'you@gmail.com' })
              ),
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'App Password'),
                h('input', { className: 'input', type: 'password', value: settings.smtpPass || '', onChange: e => setSettings(s => ({ ...s, smtpPass: e.target.value })), placeholder: 'xxxx xxxx xxxx xxxx' }),
                h('p', { className: 'form-help' }, h('a', { href: 'https://myaccount.google.com/apppasswords', target: '_blank' }, 'Get app password from Google'))
              ),
              h('button', { className: 'btn btn-primary btn-sm', onClick: () => apiCall('/settings', { method: 'PATCH', body: JSON.stringify({ smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpUser: settings.smtpUser || null, smtpPass: settings.smtpPass || null }) }).then(d => { setSettings(s => ({ ...s, ...d })); toast('Relay config saved', 'success'); }).catch(e => toast(e.message, 'error')) }, 'Save Relay Config')
            ),
            h('div', { className: 'preset-card', style: { cursor: 'default' } },
              h('h4', null, 'Custom Domain'),
              h('p', { style: { marginBottom: 12 } }, 'Professional setup. Agents send from agent@yourdomain.com with full email authentication.'),
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Domain'),
                h('input', { className: 'input', value: settings.domain || '', onChange: e => setSettings(s => ({ ...s, domain: e.target.value })), placeholder: 'yourdomain.com' })
              ),
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Cloudflare API Token'),
                h('input', { className: 'input', type: 'password', value: settings.cfApiToken || '', onChange: e => setSettings(s => ({ ...s, cfApiToken: e.target.value })), placeholder: 'Your Cloudflare API token' })
              ),
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Cloudflare Account ID'),
                h('input', { className: 'input', value: settings.cfAccountId || '', onChange: e => setSettings(s => ({ ...s, cfAccountId: e.target.value })), placeholder: 'Account ID' })
              ),
              h('button', { className: 'btn btn-primary btn-sm', onClick: () => apiCall('/settings', { method: 'PATCH', body: JSON.stringify({ domain: settings.domain || null, cfApiToken: settings.cfApiToken || null, cfAccountId: settings.cfAccountId || null }) }).then(d => { setSettings(s => ({ ...s, ...d })); toast('Domain config saved', 'success'); }).catch(e => toast(e.message, 'error')) }, 'Save Domain Config')
            )
          )
        )
      )
    ),

    tab === 'deployments' && h('div', null,
      h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-header' },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            h('h3', null, 'Deploy Credentials'),
            h('button', { className: 'btn btn-primary btn-sm', onClick: () => { setDeployForm({ name: '', targetType: 'docker', config: {} }); setShowDeployModal(true); } }, I.plus(), ' Add Credential')
          )
        ),
        h('div', { className: 'card-body-flush' },
          deployCreds.length === 0 ? h('div', { style: { padding: 24, textAlign: 'center', color: 'var(--text-muted)' } }, 'No deploy credentials configured. Add one to enable agent deployment.')
          : h('table', null,
              h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Target'), h('th', null, 'Created'), h('th', null, 'Actions'))),
              h('tbody', null, deployCreds.map(c =>
                h('tr', { key: c.id },
                  h('td', null, h('strong', null, c.name)),
                  h('td', null, h('span', { className: 'badge badge-neutral' }, c.targetType)),
                  h('td', { style: { fontSize: 12, color: 'var(--text-muted)' } }, c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '-'),
                  h('td', null, h('button', { className: 'btn btn-danger btn-sm', onClick: () => deleteDeployCred(c.id) }, 'Delete'))
                )
              ))
            )
        )
      ),
      showDeployModal && h('div', { className: 'modal-overlay', onClick: e => { if (e.target === e.currentTarget) setShowDeployModal(false); } },
        h('div', { className: 'modal', style: { maxWidth: 500 } },
          h('div', { className: 'modal-header' },
            h('h3', null, 'Add Deploy Credential'),
            h('button', { className: 'modal-close', onClick: () => setShowDeployModal(false) }, '\u00D7')
          ),
          h('div', { className: 'modal-body' },
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Name'),
              h('input', { className: 'input', value: deployForm.name, onChange: e => setDeployForm(f => ({ ...f, name: e.target.value })), placeholder: 'e.g., Production Docker Registry' })
            ),
            h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Target Type'),
              h('select', { className: 'input', value: deployForm.targetType, onChange: e => setDeployForm(f => ({ ...f, targetType: e.target.value, config: {} })) },
                h('option', { value: 'docker' }, 'Docker Registry'),
                h('option', { value: 'ssh' }, 'SSH / VPS'),
                h('option', { value: 'fly' }, 'Fly.io'),
                h('option', { value: 'railway' }, 'Railway'),
                h('option', { value: 'vps' }, 'VPS (Generic)')
              )
            ),
            deployForm.targetType === 'docker' && h(Fragment, null,
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Registry URL'),
                h('input', { className: 'input', value: deployForm.config.registryUrl || '', onChange: e => setDeployForm(f => ({ ...f, config: { ...f.config, registryUrl: e.target.value } })), placeholder: 'registry.example.com' })
              ),
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Username'),
                h('input', { className: 'input', value: deployForm.config.username || '', onChange: e => setDeployForm(f => ({ ...f, config: { ...f.config, username: e.target.value } })) })
              ),
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Password / Token'),
                h('input', { className: 'input', type: 'password', value: deployForm.config.password || '', onChange: e => setDeployForm(f => ({ ...f, config: { ...f.config, password: e.target.value } })) })
              )
            ),
            (deployForm.targetType === 'ssh' || deployForm.targetType === 'vps') && h(Fragment, null,
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Host'),
                h('input', { className: 'input', value: deployForm.config.host || '', onChange: e => setDeployForm(f => ({ ...f, config: { ...f.config, host: e.target.value } })), placeholder: '192.168.1.100' })
              ),
              h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
                h('div', { className: 'form-group' },
                  h('label', { className: 'form-label' }, 'Port'),
                  h('input', { className: 'input', type: 'number', value: deployForm.config.port || 22, onChange: e => setDeployForm(f => ({ ...f, config: { ...f.config, port: parseInt(e.target.value) || 22 } })) })
                ),
                h('div', { className: 'form-group' },
                  h('label', { className: 'form-label' }, 'Username'),
                  h('input', { className: 'input', value: deployForm.config.username || '', onChange: e => setDeployForm(f => ({ ...f, config: { ...f.config, username: e.target.value } })), placeholder: 'root' })
                )
              ),
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'SSH Private Key'),
                h('textarea', { className: 'input', rows: 4, value: deployForm.config.sshKey || '', onChange: e => setDeployForm(f => ({ ...f, config: { ...f.config, sshKey: e.target.value } })), placeholder: '-----BEGIN OPENSSH PRIVATE KEY-----' })
              )
            ),
            deployForm.targetType === 'fly' && h('div', { className: 'form-group' },
              h('label', { className: 'form-label' }, 'Fly.io API Token'),
              h('input', { className: 'input', type: 'password', value: deployForm.config.apiToken || '', onChange: e => setDeployForm(f => ({ ...f, config: { ...f.config, apiToken: e.target.value } })), placeholder: 'FlyV1 ...' })
            ),
            deployForm.targetType === 'railway' && h(Fragment, null,
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Railway API Token'),
                h('input', { className: 'input', type: 'password', value: deployForm.config.apiToken || '', onChange: e => setDeployForm(f => ({ ...f, config: { ...f.config, apiToken: e.target.value } })), placeholder: 'Railway token' })
              ),
              h('div', { className: 'form-group' },
                h('label', { className: 'form-label' }, 'Project ID'),
                h('input', { className: 'input', value: deployForm.config.projectId || '', onChange: e => setDeployForm(f => ({ ...f, config: { ...f.config, projectId: e.target.value } })) })
              )
            )
          ),
          h('div', { className: 'modal-footer' },
            h('button', { className: 'btn btn-secondary', onClick: () => setShowDeployModal(false) }, 'Cancel'),
            h('button', { className: 'btn btn-primary', onClick: createDeployCred, disabled: !deployForm.name }, 'Create Credential')
          )
        )
      )
    ),

    tab === 'security' && h(ToolSecurityTab, { toolSec: toolSec, setToolSec: function(v) { setToolSec(v); setToolSecDirty(true); }, saving: toolSecSaving, dirty: toolSecDirty, onSave: function() {
      setToolSecSaving(true);
      apiCall('/settings/tool-security', { method: 'PUT', body: JSON.stringify(toolSec) })
        .then(function(d) { setToolSec({ security: (d.toolSecurityConfig || {}).security || toolSec.security, middleware: (d.toolSecurityConfig || {}).middleware || toolSec.middleware }); setToolSecDirty(false); toast('Tool security settings saved', 'success'); })
        .catch(function(e) { toast(e.message, 'error'); })
        .finally(function() { setToolSecSaving(false); });
    } }),

    tab === 'network' && h(NetworkFirewallTab, { fw: fw, setFw: function(v) { setFw(v); setFwDirty(true); }, saving: fwSaving, dirty: fwDirty, testIp: fwTestIp, setTestIp: setFwTestIp, testResult: fwTestResult, setTestResult: setFwTestResult, onSave: function() {
      setFwSaving(true);
      apiCall('/settings/firewall', { method: 'PUT', body: JSON.stringify(fw) })
        .then(function(d) { setFw(d.firewallConfig || fw); setFwDirty(false); toast('Network & firewall settings saved and applied (hot-reloaded)', 'success'); })
        .catch(function(e) { toast(e.message, 'error'); })
        .finally(function() { setFwSaving(false); });
    }, onTestIp: function() {
      if (!fwTestIp.trim()) return;
      apiCall('/settings/firewall/test-ip', { method: 'POST', body: JSON.stringify({ ip: fwTestIp.trim() }) })
        .then(function(d) { setFwTestResult(d); })
        .catch(function(e) { setFwTestResult({ error: e.message }); });
    } }),

    // Integrations tab removed — now managed via Community Skills page
  );
}

// ═══════════════════════════════════════════════════════════
// INTEGRATIONS TAB
// ═══════════════════════════════════════════════════════════

// Category display names and order
var CATEGORY_LABELS = {
  communication: 'Communication', crm: 'CRM & Sales', productivity: 'Productivity',
  devops: 'DevOps & CI/CD', infrastructure: 'Cloud & Infrastructure', 'data-ai': 'Database & AI/ML',
  monitoring: 'Analytics & Monitoring', security: 'Security & Identity', marketing: 'Marketing & Content',
  design: 'Design & Documents', finance: 'Finance & Payments', hr: 'HR & Recruiting',
  social: 'Social Media', ecommerce: 'E-commerce', cms: 'CMS', enterprise: 'Enterprise',
  general: 'Other'
};

// Auth type display labels
var AUTH_LABELS = { oauth2: 'OAuth', api_key: 'API Key', token: 'Token', credentials: 'Credentials' };

function IntegrationsTab(props) {
  var toast = props.toast;
  var _catalog = useState([]);
  var catalog = _catalog[0]; var setCatalog = _catalog[1];
  var _categories = useState([]);
  var categories = _categories[0]; var setCategories = _categories[1];
  var _loading = useState(true);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _search = useState('');
  var search = _search[0]; var setSearch = _search[1];
  var _activeCategory = useState('all');
  var activeCategory = _activeCategory[0]; var setActiveCategory = _activeCategory[1];
  var _tokenModal = useState(null);
  var tokenModal = _tokenModal[0]; var setTokenModal = _tokenModal[1];
  var _tokenValue = useState('');
  var tokenValue = _tokenValue[0]; var setTokenValue = _tokenValue[1];
  var _actionLoading = useState(null);
  var actionLoading = _actionLoading[0]; var setActionLoading = _actionLoading[1];

  var loadCatalog = useCallback(function() {
    engineCall('/integrations/catalog?orgId=' + getOrgId())
      .then(function(d) {
        setCatalog(d.catalog || []);
        setCategories(d.categories || []);
        setLoading(false);
      })
      .catch(function(e) {
        console.error('Failed to load integration catalog:', e);
        setLoading(false);
      });
  }, []);

  useEffect(function() { loadCatalog(); }, [loadCatalog]);

  // Filter integrations
  var filtered = catalog.filter(function(int) {
    var matchesCategory = activeCategory === 'all' || int.category === activeCategory;
    var matchesSearch = !search || int.name.toLowerCase().indexOf(search.toLowerCase()) !== -1 || int.skillId.toLowerCase().indexOf(search.toLowerCase()) !== -1;
    return matchesCategory && matchesSearch;
  });

  // Sort: connected first, then alphabetically
  filtered.sort(function(a, b) {
    if (a.connected !== b.connected) return a.connected ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  var connectedCount = catalog.filter(function(i) { return i.connected; }).length;

  var handleConnect = function(int) {
    if (int.authType === 'api_key' || int.authType === 'token') {
      setTokenModal(int);
      setTokenValue('');
      return;
    }
    if (int.authType === 'credentials') {
      toast(int.name + ' requires multi-field credentials. Configure via CLI or API.', 'info');
      return;
    }
    setActionLoading(int.skillId);
    engineCall('/oauth/authorize/' + int.skillId + '?orgId=' + getOrgId())
      .then(function(d) {
        if (d.authorizationUrl || d.authUrl) {
          var popup = window.open(d.authorizationUrl || d.authUrl, 'oauth_connect', 'width=600,height=700,popup=yes');
          var checkInterval = setInterval(function() {
            if (popup && popup.closed) {
              clearInterval(checkInterval);
              setActionLoading(null);
              loadCatalog();
            }
          }, 500);
          setTimeout(function() { clearInterval(checkInterval); setActionLoading(null); }, 120000);
        } else {
          setActionLoading(null);
          toast('OAuth flow could not be started', 'error');
        }
      })
      .catch(function(e) {
        setActionLoading(null);
        toast('Connection failed: ' + e.message, 'error');
      });
  };

  var handleDisconnect = function(int) {
    showConfirm({ title: 'Disconnect ' + int.name, message: 'This will remove stored credentials for ' + int.name + '. Agents using this integration will lose access.', danger: true, confirmText: 'Disconnect' })
      .then(function(ok) {
        if (!ok) return;
        setActionLoading(int.skillId);
        engineCall('/oauth/disconnect/' + int.skillId + '?orgId=' + getOrgId(), { method: 'DELETE' })
          .then(function() { toast(int.name + ' disconnected', 'success'); loadCatalog(); })
          .catch(function(e) { toast('Failed: ' + e.message, 'error'); })
          .finally(function() { setActionLoading(null); });
      });
  };

  var handleSaveToken = function() {
    if (!tokenModal || !tokenValue.trim()) return;
    setActionLoading(tokenModal.skillId);
    engineCall('/oauth/authorize/' + tokenModal.skillId + '?orgId=' + getOrgId(), {
      method: 'POST',
      body: JSON.stringify({ token: tokenValue.trim() })
    })
      .then(function() { toast(tokenModal.name + ' connected', 'success'); setTokenModal(null); loadCatalog(); })
      .catch(function(e) { toast('Failed: ' + e.message, 'error'); })
      .finally(function() { setActionLoading(null); });
  };

  return h('div', null,
    h('div', { className: 'card' },
      h('div', { className: 'card-header' },
        h('h3', { style: { display: 'inline-flex', alignItems: 'center' } }, 'Integrations',
          h('span', { className: 'badge badge-neutral', style: { marginLeft: 8, fontSize: 11 } }, catalog.length + ' available'),
          connectedCount > 0 && h('span', { className: 'badge badge-success', style: { marginLeft: 6, fontSize: 11 } }, connectedCount + ' connected'),
          h(HelpButton, { label: SETTINGS_HELP.integrations.label }, SETTINGS_HELP.integrations.content())
        )
      ),
      h('div', { className: 'card-body' },
        h('p', { style: { color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 } },
          'Connect external services to extend agent capabilities. 144 integrations available — agents automatically get tools for connected services.'
        ),

        // Search + category filter bar
        h('div', { style: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' } },
          h('input', {
            type: 'text', placeholder: 'Search integrations...', value: search,
            onInput: function(e) { setSearch(e.target.value); },
            style: { flex: '1 1 200px', minWidth: 150, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 }
          }),
          h('select', {
            value: activeCategory,
            onChange: function(e) { setActiveCategory(e.target.value); },
            style: { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 }
          },
            h('option', { value: 'all' }, 'All Categories (' + catalog.length + ')'),
            categories.map(function(cat) {
              var count = catalog.filter(function(i) { return i.category === cat; }).length;
              return h('option', { key: cat, value: cat }, (CATEGORY_LABELS[cat] || cat) + ' (' + count + ')');
            })
          )
        ),

        loading
          ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'Loading integrations...')
          : filtered.length === 0
            ? h('div', { style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'No integrations match your search.')
            : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 } },
                filtered.map(function(int) {
                  var connected = int.connected === true;
                  var isLoading = actionLoading === int.skillId;
                  var authLabel = AUTH_LABELS[int.authType] || int.authType;
                  return h('div', { key: int.skillId, style: {
                    padding: 14, border: '1px solid ' + (connected ? 'var(--brand-color, #6366f1)' : 'var(--border)'),
                    borderRadius: 'var(--radius)', background: connected ? 'var(--bg-secondary)' : 'transparent',
                    opacity: isLoading ? 0.6 : 1, transition: 'border-color 0.2s, background 0.2s'
                  } },
                    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } },
                      h('strong', { style: { fontSize: 13 } }, int.name),
                      h('span', { className: 'badge badge-' + (connected ? 'success' : 'neutral'), style: { fontSize: 10 } },
                        connected ? 'Connected' : authLabel)
                    ),
                    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } },
                      h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } },
                        (CATEGORY_LABELS[int.category] || int.category) + ' \u00B7 ' + int.toolCount + ' tool' + (int.toolCount !== 1 ? 's' : '')
                      )
                    ),
                    connected
                      ? h('button', {
                          className: 'btn btn-secondary btn-sm',
                          disabled: isLoading,
                          onClick: function() { handleDisconnect(int); }
                        }, isLoading ? 'Disconnecting...' : 'Disconnect')
                      : h('button', {
                          className: 'btn btn-primary btn-sm',
                          disabled: isLoading,
                          onClick: function() { handleConnect(int); }
                        }, isLoading ? 'Connecting...' : 'Connect')
                  );
                })
              )
      )
    ),

    tokenModal && h(Modal, { title: 'Connect ' + tokenModal.name, onClose: function() { setTokenModal(null); } },
      h('div', { style: { padding: 20 } },
        h('p', { style: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 } },
          'Enter your ', h('strong', null, AUTH_LABELS[tokenModal.authType] || 'API Token'), ' for ', tokenModal.name, '. This will be stored securely in the vault.'
        ),
        h('div', { className: 'form-group' },
          h('label', null, AUTH_LABELS[tokenModal.authType] || 'API Token'),
          h('input', {
            className: 'input', type: 'password',
            value: tokenValue,
            onChange: function(e) { setTokenValue(e.target.value); },
            placeholder: 'Paste your token here...',
            autoFocus: true
          })
        ),
        h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 } },
          h('button', { className: 'btn btn-secondary', onClick: function() { setTokenModal(null); } }, 'Cancel'),
          h('button', {
            className: 'btn btn-primary',
            disabled: !tokenValue.trim() || actionLoading === tokenModal.skillId,
            onClick: handleSaveToken
          }, actionLoading === tokenModal.skillId ? 'Saving...' : 'Save & Connect')
        )
      )
    )
  );
}

// ═══════════════════════════════════════════════════════════
// TOOL SECURITY TAB
// ═══════════════════════════════════════════════════════════

var _cardStyle = { border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 16 };
var _cardTitleStyle = { fontSize: 15, fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 };
var _cardDescStyle = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 };
var _toggleRowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 };
var _gridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };
var _sectionTitleStyle = { fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, marginTop: 8 };

function ToggleSwitch(props) {
  var checked = props.checked;
  var onChange = props.onChange;
  var label = props.label;
  return h('div', { style: _toggleRowStyle },
    h('span', { style: { fontSize: 13, fontWeight: 500 } }, label),
    h('label', { style: { position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer' } },
      h('input', { type: 'checkbox', checked: checked, onChange: function(e) { onChange(e.target.checked); }, style: { opacity: 0, width: 0, height: 0 } }),
      h('span', { style: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: checked ? 'var(--brand-color, #6366f1)' : 'var(--bg-tertiary, #374151)',
        borderRadius: 11, transition: 'background 0.2s'
      } },
        h('span', { style: {
          position: 'absolute', top: 2, left: checked ? 20 : 2, width: 18, height: 18,
          background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        } })
      )
    )
  );
}

function RateLimitEditor(props) {
  var overrides = props.overrides || {};
  var onChange = props.onChange;
  var DEFAULT_LIMITS = { bash: { max: 10, rate: 10 }, browser: { max: 20, rate: 20 }, web_fetch: { max: 30, rate: 30 }, web_search: { max: 30, rate: 30 }, read: { max: 60, rate: 60 }, write: { max: 60, rate: 60 }, edit: { max: 60, rate: 60 }, glob: { max: 60, rate: 60 }, grep: { max: 60, rate: 60 }, memory: { max: 60, rate: 60 } };
  var tools = Object.keys(DEFAULT_LIMITS);

  var setOverride = function(tool, field, value) {
    var current = overrides[tool] || { maxTokens: DEFAULT_LIMITS[tool].max, refillRate: DEFAULT_LIMITS[tool].rate };
    var next = Object.assign({}, overrides);
    next[tool] = Object.assign({}, current);
    next[tool][field] = parseInt(value) || 0;
    onChange(next);
  };

  return h('div', { style: { fontSize: 12 } },
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 4, marginBottom: 4 } },
      h('span', { style: { fontWeight: 600, color: 'var(--text-secondary)' } }, 'Tool'),
      h('span', { style: { fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' } }, 'Max/min'),
      h('span', { style: { fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' } }, 'Refill/min')
    ),
    tools.map(function(tool) {
      var def = DEFAULT_LIMITS[tool];
      var ov = overrides[tool];
      return h('div', { key: tool, style: { display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 4, marginBottom: 2 } },
        h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 0' } }, tool),
        h('input', { className: 'input', type: 'number', min: 1, max: 1000, style: { fontSize: 11, padding: '2px 6px', textAlign: 'center' }, value: ov ? ov.maxTokens : def.max, onChange: function(e) { setOverride(tool, 'maxTokens', e.target.value); } }),
        h('input', { className: 'input', type: 'number', min: 1, max: 1000, style: { fontSize: 11, padding: '2px 6px', textAlign: 'center' }, value: ov ? ov.refillRate : def.rate, onChange: function(e) { setOverride(tool, 'refillRate', e.target.value); } })
      );
    })
  );
}

function ToolSecurityTab(props) {
  var toolSec = props.toolSec;
  var setToolSec = props.setToolSec;
  var saving = props.saving;
  var dirty = props.dirty;

  var sec = toolSec.security || {};
  var mw = toolSec.middleware || {};

  var setSec = function(key, value) {
    var next = Object.assign({}, sec);
    next[key] = value;
    setToolSec({ security: next, middleware: mw });
  };

  var setMw = function(key, value) {
    var next = Object.assign({}, mw);
    next[key] = value;
    setToolSec({ security: sec, middleware: next });
  };

  var patchSec = function(section, field, value) {
    var current = sec[section] || {};
    var next = Object.assign({}, current);
    next[field] = value;
    setSec(section, next);
  };

  var patchMw = function(section, field, value) {
    var current = mw[section] || {};
    var next = Object.assign({}, current);
    next[field] = value;
    setMw(section, next);
  };

  var ps = sec.pathSandbox || {};
  var ssrf = sec.ssrf || {};
  var cs = sec.commandSanitizer || {};
  var audit = mw.audit || {};
  var rl = mw.rateLimit || {};
  var cb = mw.circuitBreaker || {};
  var tel = mw.telemetry || {};

  return h(Fragment, null,
    // Header
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 0 } },
          h('h3', { style: { margin: 0, fontSize: 18, fontWeight: 600 } }, 'Agent Tool Security'),
          h(HelpButton, { label: SETTINGS_HELP.security.label }, SETTINGS_HELP.security.content())
        ),
        h('p', { style: { margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' } }, 'Organization-wide defaults for all agent tools. Individual agents can override these settings.')
      ),
      h('button', {
        className: 'btn btn-primary',
        disabled: saving || !dirty,
        onClick: props.onSave
      }, saving ? 'Saving...' : 'Save Settings')
    ),

    // ── SECURITY SECTION ──
    h('div', { style: _sectionTitleStyle }, 'Security Sandboxes'),
    h('div', { style: _gridStyle },

      // Path Sandbox
      h('div', { style: _cardStyle },
        h('div', { style: _cardTitleStyle }, I.folder(), ' Path Sandbox'),
        h('div', { style: _cardDescStyle }, 'Controls which directories agents can read/write. Blocks path traversal and sensitive files.'),
        h(ToggleSwitch, { label: 'Enable path sandboxing', checked: ps.enabled !== false, onChange: function(v) { patchSec('pathSandbox', 'enabled', v); } }),
        h(TagInput, { label: 'Additional Allowed Directories', value: ps.allowedDirs || [], onChange: function(v) { patchSec('pathSandbox', 'allowedDirs', v); }, placeholder: '/path/to/allow', mono: true }),
        h(TagInput, { label: 'Blocked File Patterns (regex)', value: ps.blockedPatterns || [], onChange: function(v) { patchSec('pathSandbox', 'blockedPatterns', v); }, placeholder: '\\.env$', mono: true })
      ),

      // SSRF Guard
      h('div', { style: _cardStyle },
        h('div', { style: _cardTitleStyle }, I.globe(), ' SSRF Protection'),
        h('div', { style: _cardDescStyle }, 'Blocks agents from accessing internal networks, cloud metadata endpoints, and private IPs.'),
        h(ToggleSwitch, { label: 'Enable SSRF protection', checked: ssrf.enabled !== false, onChange: function(v) { patchSec('ssrf', 'enabled', v); } }),
        h(TagInput, { label: 'Allowed Hosts (bypass SSRF check)', value: ssrf.allowedHosts || [], onChange: function(v) { patchSec('ssrf', 'allowedHosts', v); }, placeholder: 'api.example.com', mono: true }),
        h(TagInput, { label: 'Additional Blocked CIDRs', value: ssrf.blockedCidrs || [], onChange: function(v) { patchSec('ssrf', 'blockedCidrs', v); }, placeholder: '10.0.0.0/8', mono: true })
      )
    ),

    // Command Sanitizer (full width)
    h('div', { style: _cardStyle },
      h('div', { style: _cardTitleStyle }, I.terminal(), ' Command Sanitizer'),
      h('div', { style: _cardDescStyle }, 'Controls which shell commands agents can execute. Blocks dangerous patterns like rm -rf /, fork bombs, and shell injection.'),
      h(ToggleSwitch, { label: 'Enable command validation', checked: cs.enabled !== false, onChange: function(v) { patchSec('commandSanitizer', 'enabled', v); } }),
      h('div', { style: { marginBottom: 12 } },
        h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Mode'),
        h('select', { className: 'input', style: { width: 200 }, value: cs.mode || 'blocklist', onChange: function(e) { patchSec('commandSanitizer', 'mode', e.target.value); } },
          h('option', { value: 'blocklist' }, 'Blocklist (block specific patterns)'),
          h('option', { value: 'allowlist' }, 'Allowlist (only allow specific commands)')
        )
      ),
      h('div', { style: _gridStyle },
        h(TagInput, { label: 'Allowed Commands (allowlist mode)', value: cs.allowedCommands || [], onChange: function(v) { patchSec('commandSanitizer', 'allowedCommands', v); }, placeholder: 'git, npm, node', mono: true }),
        h(TagInput, { label: 'Additional Blocked Patterns', value: cs.blockedPatterns || [], onChange: function(v) { patchSec('commandSanitizer', 'blockedPatterns', v); }, placeholder: 'curl.*\\|.*sh', mono: true })
      )
    ),

    // ── MIDDLEWARE SECTION ──
    h('div', { style: _sectionTitleStyle }, 'Middleware & Observability'),
    h('div', { style: _gridStyle },

      // Audit Logging
      h('div', { style: _cardStyle },
        h('div', { style: _cardTitleStyle }, I.journal(), ' Audit Logging'),
        h('div', { style: _cardDescStyle }, 'Logs every tool invocation with agent ID, parameters (redacted), timing, and success/failure status.'),
        h(ToggleSwitch, { label: 'Enable audit logging', checked: audit.enabled !== false, onChange: function(v) { patchMw('audit', 'enabled', v); } }),
        h(TagInput, { label: 'Additional Keys to Redact', value: audit.redactKeys || [], onChange: function(v) { patchMw('audit', 'redactKeys', v); }, placeholder: 'custom_secret', mono: true })
      ),

      // Rate Limiting
      h('div', { style: _cardStyle },
        h('div', { style: _cardTitleStyle }, I.clock(), ' Rate Limiting'),
        h('div', { style: _cardDescStyle }, 'Per-agent, per-tool rate limits using token bucket algorithm. Prevents runaway agents from overwhelming resources.'),
        h(ToggleSwitch, { label: 'Enable rate limiting', checked: rl.enabled !== false, onChange: function(v) { patchMw('rateLimit', 'enabled', v); } }),
        h(RateLimitEditor, { overrides: rl.overrides || {}, onChange: function(v) { patchMw('rateLimit', 'overrides', v); } })
      ),

      // Circuit Breaker
      h('div', { style: _cardStyle },
        h('div', { style: _cardTitleStyle }, I.pause(), ' Circuit Breaker'),
        h('div', { style: _cardDescStyle }, 'Automatically stops calling failing tools after 5 consecutive failures. Opens for 30 seconds then retries. Applies to web and browser tools.'),
        h(ToggleSwitch, { label: 'Enable circuit breaker', checked: cb.enabled !== false, onChange: function(v) { patchMw('circuitBreaker', 'enabled', v); } })
      ),

      // Telemetry
      h('div', { style: _cardStyle },
        h('div', { style: _cardTitleStyle }, I.chart(), ' Telemetry'),
        h('div', { style: _cardDescStyle }, 'Collects execution timing, success/failure counters, and output size metrics for all tool invocations.'),
        h(ToggleSwitch, { label: 'Enable telemetry collection', checked: tel.enabled !== false, onChange: function(v) { patchMw('telemetry', 'enabled', v); } })
      )
    ),

    // Bottom save bar
    dirty && h('div', { style: { position: 'sticky', bottom: 0, padding: '12px 0', background: 'var(--bg-primary)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 } },
      h('button', { className: 'btn btn-primary', disabled: saving, onClick: props.onSave }, saving ? 'Saving...' : 'Save Tool Security Settings')
    )
  );
}

// ═══════════════════════════════════════════════════════════
// NETWORK & FIREWALL TAB
// ═══════════════════════════════════════════════════════════

function NetworkFirewallTab(props) {
  var fw = props.fw || {};
  var setFw = props.setFw;
  var saving = props.saving;
  var dirty = props.dirty;

  var ipAccess = fw.ipAccess || {};
  var egress = fw.egress || {};
  var proxy = fw.proxy || {};
  var tp = fw.trustedProxies || {};
  var net = fw.network || {};
  var rl = net.rateLimit || {};
  var https = net.httpsEnforcement || {};
  var sh = net.securityHeaders || {};
  var dnsReb = fw.dnsRebinding || {};
  var geoIp = fw.geoIp || {};
  var webhookSec = fw.webhookSecurity || {};

  var patchFw = function(section, value) {
    var next = Object.assign({}, fw);
    next[section] = value;
    setFw(next);
  };

  var patchIp = function(field, value) {
    var next = Object.assign({}, ipAccess);
    next[field] = value;
    patchFw('ipAccess', next);
  };

  var patchEgress = function(field, value) {
    var next = Object.assign({}, egress);
    next[field] = value;
    patchFw('egress', next);
  };

  var patchProxy = function(field, value) {
    var next = Object.assign({}, proxy);
    next[field] = value;
    patchFw('proxy', next);
  };

  var patchTp = function(field, value) {
    var next = Object.assign({}, tp);
    next[field] = value;
    patchFw('trustedProxies', next);
  };

  var patchNet = function(field, value) {
    var next = Object.assign({}, net);
    next[field] = value;
    patchFw('network', next);
  };

  var patchRl = function(field, value) {
    var next = Object.assign({}, rl);
    next[field] = value;
    patchNet('rateLimit', next);
  };

  var patchHttps = function(field, value) {
    var next = Object.assign({}, https);
    next[field] = value;
    patchNet('httpsEnforcement', next);
  };

  var patchSh = function(field, value) {
    var next = Object.assign({}, sh);
    next[field] = value;
    patchNet('securityHeaders', next);
  };

  return h(Fragment, null,
    // Header
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      h('div', null,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 0 } },
          h('h3', { style: { margin: 0, fontSize: 18, fontWeight: 600 } }, 'Network & Firewall'),
          h(HelpButton, { label: SETTINGS_HELP.network.label }, SETTINGS_HELP.network.content())
        ),
        h('p', { style: { margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' } }, 'Control network access, egress rules, proxy settings, and deployment security for your enterprise instance.')
      ),
      h('button', {
        className: 'btn btn-primary',
        disabled: saving || !dirty,
        onClick: props.onSave
      }, saving ? 'Saving...' : 'Save Settings')
    ),

    // ── IP ACCESS CONTROL ──
    h('div', { style: _sectionTitleStyle }, 'IP Access Control'),
    h('div', { style: _cardStyle },
      h('div', { style: _cardTitleStyle }, I.shield(), ' Inbound IP Filtering'),
      h('div', { style: _cardDescStyle }, 'Restrict which IP addresses can access the dashboard, APIs, and engine endpoints. Supports individual IPs and CIDR ranges.'),
      h(ToggleSwitch, { label: 'Enable IP access control', checked: ipAccess.enabled === true, onChange: function(v) { patchIp('enabled', v); } }),
      ipAccess.enabled && h(Fragment, null,
        h('div', { style: { marginBottom: 12 } },
          h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Mode'),
          h('select', { className: 'input', style: { width: 280 }, value: ipAccess.mode || 'allowlist', onChange: function(e) { patchIp('mode', e.target.value); } },
            h('option', { value: 'allowlist' }, 'Allowlist — only listed IPs can access'),
            h('option', { value: 'blocklist' }, 'Blocklist — listed IPs are blocked')
          )
        ),
        h('div', { style: _gridStyle },
          h(TagInput, { label: 'Allowed IPs / CIDRs', value: ipAccess.allowlist || [], onChange: function(v) { patchIp('allowlist', v); }, placeholder: '10.0.0.0/8', mono: true }),
          h(TagInput, { label: 'Blocked IPs / CIDRs', value: ipAccess.blocklist || [], onChange: function(v) { patchIp('blocklist', v); }, placeholder: '0.0.0.0/0', mono: true })
        ),
        h(TagInput, { label: 'Bypass Paths (always allowed)', value: ipAccess.bypassPaths || ['/health', '/ready'], onChange: function(v) { patchIp('bypassPaths', v); }, placeholder: '/health', mono: true }),
        // Test IP tool
        h('div', { style: { marginTop: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 6 } },
          h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Test an IP Address'),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
            h('input', { className: 'input', style: { width: 200, fontSize: 13 }, value: props.testIp, onChange: function(e) { props.setTestIp(e.target.value); }, placeholder: '192.168.1.1' }),
            h('button', { className: 'btn btn-secondary btn-sm', onClick: props.onTestIp, disabled: !props.testIp }, 'Test'),
            props.testResult && !props.testResult.error && h('span', { style: { fontSize: 12, fontWeight: 600, color: props.testResult.allowed ? 'var(--success)' : 'var(--danger)' } }, props.testResult.allowed ? 'ALLOWED' : 'BLOCKED', ' — ', props.testResult.reason),
            props.testResult && props.testResult.error && h('span', { style: { fontSize: 12, color: 'var(--danger)' } }, props.testResult.error)
          )
        )
      )
    ),

    // ── OUTBOUND EGRESS ──
    h('div', { style: _sectionTitleStyle }, 'Outbound Egress Rules'),
    h('div', { style: _cardStyle },
      h('div', { style: _cardTitleStyle }, I.globe(), ' Egress Filtering'),
      h('div', { style: _cardDescStyle }, 'Control which external hosts and ports agents can reach when using web fetch, browser, and other network tools.'),
      h(ToggleSwitch, { label: 'Enable egress filtering', checked: egress.enabled === true, onChange: function(v) { patchEgress('enabled', v); } }),
      egress.enabled && h(Fragment, null,
        h('div', { style: { marginBottom: 12 } },
          h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Mode'),
          h('select', { className: 'input', style: { width: 280 }, value: egress.mode || 'blocklist', onChange: function(e) { patchEgress('mode', e.target.value); } },
            h('option', { value: 'allowlist' }, 'Allowlist — only listed hosts are reachable'),
            h('option', { value: 'blocklist' }, 'Blocklist — listed hosts are blocked')
          )
        ),
        h('div', { style: _gridStyle },
          h(TagInput, { label: 'Allowed Hosts', value: egress.allowedHosts || [], onChange: function(v) { patchEgress('allowedHosts', v); }, placeholder: '*.googleapis.com', mono: true }),
          h(TagInput, { label: 'Blocked Hosts', value: egress.blockedHosts || [], onChange: function(v) { patchEgress('blockedHosts', v); }, placeholder: 'evil.example.com', mono: true })
        ),
        h('div', { style: _gridStyle },
          h(TagInput, { label: 'Allowed Ports', value: (egress.allowedPorts || []).map(String), onChange: function(v) { patchEgress('allowedPorts', v.map(Number).filter(function(n) { return !isNaN(n); })); }, placeholder: '443' }),
          h(TagInput, { label: 'Blocked Ports', value: (egress.blockedPorts || []).map(String), onChange: function(v) { patchEgress('blockedPorts', v.map(Number).filter(function(n) { return !isNaN(n); })); }, placeholder: '25' })
        )
      )
    ),

    // ── PROXY & TRUSTED PROXIES ──
    h('div', { style: _sectionTitleStyle }, 'Proxy & Trusted Proxies'),
    h('div', { style: _gridStyle },

      // Proxy config
      h('div', { style: _cardStyle },
        h('div', { style: _cardTitleStyle }, I.link(), ' Proxy Configuration'),
        h('div', { style: _cardDescStyle }, 'Configure HTTP/HTTPS proxies for agent outbound traffic in air-gapped or restricted environments.'),
        h('div', { className: 'form-group', style: { marginBottom: 12 } },
          h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'HTTP Proxy'),
          h('input', { className: 'input', style: { fontSize: 13 }, value: proxy.httpProxy || '', onChange: function(e) { patchProxy('httpProxy', e.target.value); }, placeholder: 'http://proxy.corp.internal:8080' })
        ),
        h('div', { className: 'form-group', style: { marginBottom: 12 } },
          h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'HTTPS Proxy'),
          h('input', { className: 'input', style: { fontSize: 13 }, value: proxy.httpsProxy || '', onChange: function(e) { patchProxy('httpsProxy', e.target.value); }, placeholder: 'http://proxy.corp.internal:8080' })
        ),
        h(TagInput, { label: 'No-Proxy Hosts', value: proxy.noProxy || ['localhost', '127.0.0.1'], onChange: function(v) { patchProxy('noProxy', v); }, placeholder: '*.internal', mono: true })
      ),

      // Trusted proxies
      h('div', { style: _cardStyle },
        h('div', { style: _cardTitleStyle }, I.shield(), ' Trusted Proxies'),
        h('div', { style: _cardDescStyle }, 'Specify which reverse proxies are trusted for X-Forwarded-For header extraction. Required for accurate IP-based access control behind load balancers.'),
        h(ToggleSwitch, { label: 'Enable trusted proxy validation', checked: tp.enabled === true, onChange: function(v) { patchTp('enabled', v); } }),
        tp.enabled && h(TagInput, { label: 'Trusted Proxy IPs / CIDRs', value: tp.ips || [], onChange: function(v) { patchTp('ips', v); }, placeholder: '10.0.0.0/8', mono: true })
      )
    ),

    // ── NETWORK SETTINGS ──
    h('div', { style: _sectionTitleStyle }, 'Network & Deployment Settings'),
    h('div', { style: _gridStyle },

      // CORS
      h('div', { style: _cardStyle },
        h('div', { style: _cardTitleStyle }, I.globe(), ' CORS Origins'),
        h('div', { style: _cardDescStyle }, 'Allowed origins for cross-origin requests. Leave empty to allow all origins (*).'),
        h(TagInput, { label: 'Allowed Origins', value: net.corsOrigins || [], onChange: function(v) { patchNet('corsOrigins', v); }, placeholder: 'https://dashboard.example.com', mono: true })
      ),

      // Rate Limiting
      h('div', { style: _cardStyle },
        h('div', { style: _cardTitleStyle }, I.clock(), ' Rate Limiting'),
        h('div', { style: _cardDescStyle }, 'Per-IP rate limiting using token bucket algorithm. Protects against abuse and DDoS.'),
        h(ToggleSwitch, { label: 'Enable rate limiting', checked: rl.enabled !== false, onChange: function(v) { patchRl('enabled', v); } }),
        h('div', { className: 'form-group', style: { marginBottom: 12 } },
          h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Requests per Minute'),
          h('input', { className: 'input', type: 'number', min: 1, max: 10000, style: { width: 120, fontSize: 13 }, value: rl.requestsPerMinute || 120, onChange: function(e) { patchRl('requestsPerMinute', parseInt(e.target.value) || 120); } })
        ),
        h(TagInput, { label: 'Skip Paths', value: rl.skipPaths || ['/health', '/ready'], onChange: function(v) { patchRl('skipPaths', v); }, placeholder: '/health', mono: true })
      ),

      // HTTPS Enforcement
      h('div', { style: _cardStyle },
        h('div', { style: _cardTitleStyle }, I.key(), ' HTTPS Enforcement'),
        h('div', { style: _cardDescStyle }, 'Require HTTPS for all requests in production. Checks X-Forwarded-Proto header for reverse proxy setups.'),
        h(ToggleSwitch, { label: 'Enforce HTTPS', checked: https.enabled === true, onChange: function(v) { patchHttps('enabled', v); } }),
        https.enabled && h(TagInput, { label: 'Exclude Paths', value: https.excludePaths || [], onChange: function(v) { patchHttps('excludePaths', v); }, placeholder: '/health', mono: true })
      ),

      // Security Headers
      h('div', { style: _cardStyle },
        h('div', { style: _cardTitleStyle }, I.shield(), ' Security Headers'),
        h('div', { style: _cardDescStyle }, 'HTTP security headers applied to all responses. Protects against clickjacking, MIME sniffing, and other browser-level attacks.'),
        h(ToggleSwitch, { label: 'Strict-Transport-Security (HSTS)', checked: sh.hsts !== false, onChange: function(v) { patchSh('hsts', v); } }),
        sh.hsts !== false && h('div', { className: 'form-group', style: { marginBottom: 12 } },
          h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'HSTS Max-Age (seconds)'),
          h('input', { className: 'input', type: 'number', min: 0, style: { width: 160, fontSize: 13 }, value: sh.hstsMaxAge || 31536000, onChange: function(e) { patchSh('hstsMaxAge', parseInt(e.target.value) || 31536000); } })
        ),
        h(ToggleSwitch, { label: 'X-Content-Type-Options: nosniff', checked: sh.xContentTypeOptions !== false, onChange: function(v) { patchSh('xContentTypeOptions', v); } }),
        h('div', { style: { marginBottom: 12 } },
          h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'X-Frame-Options'),
          h('select', { className: 'input', style: { width: 200 }, value: sh.xFrameOptions || 'DENY', onChange: function(e) { patchSh('xFrameOptions', e.target.value); } },
            h('option', { value: 'DENY' }, 'DENY (recommended)'),
            h('option', { value: 'SAMEORIGIN' }, 'SAMEORIGIN'),
            h('option', { value: 'ALLOW' }, 'ALLOW (not recommended)')
          )
        ),
        h('div', { style: { marginBottom: 12 } },
          h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Referrer-Policy'),
          h('select', { className: 'input', style: { width: 280 }, value: sh.referrerPolicy || 'strict-origin-when-cross-origin', onChange: function(e) { patchSh('referrerPolicy', e.target.value); } },
            h('option', { value: 'strict-origin-when-cross-origin' }, 'strict-origin-when-cross-origin'),
            h('option', { value: 'no-referrer' }, 'no-referrer'),
            h('option', { value: 'origin' }, 'origin'),
            h('option', { value: 'same-origin' }, 'same-origin')
          )
        ),
        h('div', { className: 'form-group' },
          h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Permissions-Policy'),
          h('input', { className: 'input', style: { fontSize: 13 }, value: sh.permissionsPolicy || 'camera=(), microphone=(), geolocation=()', onChange: function(e) { patchSh('permissionsPolicy', e.target.value); } })
        )
      )
    ),

    // ── Advanced Security ──────────────────────────────
    h('div', { style: _sectionTitleStyle }, 'Advanced Security'),
    h('div', { style: { display: 'grid', gap: 16 } },

      // DNS Rebinding Protection
      h('div', { style: _cardStyle },
        h('div', { style: _cardTitleStyle }, I.shield(), ' DNS Rebinding Protection'),
        h('div', { style: _cardDescStyle }, 'Validates the Host header against an allowlist to prevent DNS rebinding attacks targeting internal services.'),
        h(ToggleSwitch, { label: 'Enable DNS rebinding protection', checked: dnsReb.enabled === true, onChange: function(v) { patchFw('dnsRebinding', Object.assign({}, dnsReb, { enabled: v })); } }),
        dnsReb.enabled && h(TagInput, { label: 'Allowed Hosts', value: dnsReb.allowedHosts || [], onChange: function(v) { patchFw('dnsRebinding', Object.assign({}, dnsReb, { allowedHosts: v })); }, placeholder: 'enterprise.example.com', mono: true })
      ),

      // Request Body Size Limit
      h('div', { style: _cardStyle },
        h('div', { style: _cardTitleStyle }, I.file(), ' Request Body Limits'),
        h('div', { style: _cardDescStyle }, 'Maximum request body size for API endpoints. Prevents excessively large payloads from consuming server resources.'),
        h('div', { className: 'form-group', style: { marginBottom: 12 } },
          h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Max Body Size (KB)'),
          h('input', { className: 'input', type: 'number', min: 64, max: 102400, style: { width: 150, fontSize: 13 }, value: net.maxBodySizeKb || 10240, onChange: function(e) { patchNet('maxBodySizeKb', parseInt(e.target.value) || 10240); } })
        ),
        h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, 'Default: 10240 KB (10 MB). Set higher for file upload APIs.')
      ),

      // Geo-IP Restrictions
      h('div', { style: _cardStyle },
        h('div', { style: _cardTitleStyle }, I.globe(), ' Geo-IP Restrictions'),
        h('div', { style: _cardDescStyle }, 'Restrict access by country. Uses ISO 3166-1 alpha-2 country codes (e.g. US, GB, DE). Requires a reverse proxy that sets the CF-IPCountry or X-Country-Code header.'),
        h(ToggleSwitch, { label: 'Enable geo-IP filtering', checked: geoIp.enabled === true, onChange: function(v) { patchFw('geoIp', Object.assign({}, geoIp, { enabled: v })); } }),
        geoIp.enabled && h(Fragment, null,
          h('div', { style: { marginBottom: 8 } },
            h('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 } }, 'Mode'),
            h('select', { className: 'input', style: { width: 200 }, value: geoIp.mode || 'blocklist', onChange: function(e) { patchFw('geoIp', Object.assign({}, geoIp, { mode: e.target.value })); } },
              h('option', { value: 'allowlist' }, 'Only allow these countries'),
              h('option', { value: 'blocklist' }, 'Block these countries')
            )
          ),
          h(TagInput, { label: 'Country Codes', value: geoIp.countries || [], onChange: function(v) { patchFw('geoIp', Object.assign({}, geoIp, { countries: v.map(function(c) { return c.toUpperCase().trim(); }) })); }, placeholder: 'US', mono: true })
        )
      ),

      // Webhook Security
      h('div', { style: _cardStyle },
        h('div', { style: _cardTitleStyle }, I.key(), ' Webhook Security'),
        h('div', { style: _cardDescStyle }, 'Security controls for inbound webhook endpoints (Google Chat, Slack, third-party integrations).'),
        h(ToggleSwitch, { label: 'Enable webhook security', checked: webhookSec.enabled === true, onChange: function(v) { patchFw('webhookSecurity', Object.assign({}, webhookSec, { enabled: v })); } }),
        webhookSec.enabled && h(Fragment, null,
          h(ToggleSwitch, { label: 'Require HMAC signature validation', checked: webhookSec.requireSignature === true, onChange: function(v) { patchFw('webhookSecurity', Object.assign({}, webhookSec, { requireSignature: v })); } }),
          h(TagInput, { label: 'Allowed Webhook Source IPs', value: webhookSec.allowedSourceIps || [], onChange: function(v) { patchFw('webhookSecurity', Object.assign({}, webhookSec, { allowedSourceIps: v })); }, placeholder: '35.0.0.0/8', mono: true })
        )
      )
    ),

    // Bottom save bar
    dirty && h('div', { style: { position: 'sticky', bottom: 0, padding: '12px 0', background: 'var(--bg-primary)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 } },
      h('span', { style: { fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' } }, 'Changes take effect immediately — no restart required.'),
      h('button', { className: 'btn btn-primary', disabled: saving, onClick: props.onSave }, saving ? 'Saving...' : 'Save Network & Firewall Settings')
    )
  );
}

// ═══════════════════════════════════════════════════════════
// PROVIDERS SECTION
// ═══════════════════════════════════════════════════════════

function LLMProvidersTab(props) {
  var toast = props.toast;
  var _providers = useState([]);
  var providers = _providers[0]; var setProviders = _providers[1];
  var _apiKeyInputs = useState({});
  var apiKeyInputs = _apiKeyInputs[0]; var setApiKeyInputs = _apiKeyInputs[1];
  var _saving = useState({});
  var saving = _saving[0]; var setSaving = _saving[1];

  useEffect(function() {
    apiCall('/providers').then(function(d) { setProviders(d.providers || []); }).catch(function() {});
  }, []);

  var _savingMsg = useState({});
  var savingMsg = _savingMsg[0]; var setSavingMsg = _savingMsg[1];

  var saveKey = async function(providerId, providerName) {
    var key = (apiKeyInputs[providerId] || '').trim();
    if (!key || key.length < 5) { toast('API key too short', 'error'); return; }
    setSaving(function(s) { return Object.assign({}, s, { [providerId]: true }); });
    setSavingMsg(function(s) { return Object.assign({}, s, { [providerId]: 'Validating...' }); });
    try {
      await apiCall('/providers/' + providerId + '/api-key', { method: 'POST', body: JSON.stringify({ apiKey: key }) });
      toast(providerName + ' API key validated and saved', 'success');
      setApiKeyInputs(function(s) { return Object.assign({}, s, { [providerId]: '' }); });
      apiCall('/providers').then(function(d) { setProviders(d.providers || []); }).catch(function() {});
    } catch (err) {
      var msg = err.message || 'Save failed';
      if (msg.indexOf('validation failed') !== -1) {
        toast(providerName + ': ' + msg, 'error');
      } else {
        toast('Failed: ' + msg, 'error');
      }
    }
    setSaving(function(s) { return Object.assign({}, s, { [providerId]: false }); });
    setSavingMsg(function(s) { return Object.assign({}, s, { [providerId]: '' }); });
  };

  var builtIn = providers.filter(function(p) { return p.source === 'built-in'; });
  var custom = providers.filter(function(p) { return p.source === 'custom'; });
  var configured = builtIn.filter(function(p) { return p.configured; });
  var notConfigured = builtIn.filter(function(p) { return !p.configured && p.requiresApiKey; });

  var providerMeta = {
    anthropic: { desc: 'Claude Opus 4, Sonnet 4, Haiku — best for agentic tasks, tool use, extended thinking', placeholder: 'sk-ant-api03-...' },
    openai: { desc: 'GPT-4o, o1, o3 — strong general-purpose, vision, function calling', placeholder: 'sk-proj-...' },
    xai: { desc: 'Grok-4, Grok-3 — fast, strong reasoning', placeholder: 'xai-...' },
    google: { desc: 'Gemini 2.5 Pro, Flash — multimodal, large context window', placeholder: 'AI...' },
    deepseek: { desc: 'DeepSeek V3/R1 — cost-effective reasoning', placeholder: 'sk-...' },
    mistral: { desc: 'Mistral Large, Codestral — fast European models', placeholder: '' },
    groq: { desc: 'Ultra-fast inference — Llama, Mixtral, Gemma', placeholder: 'gsk_...' },
    together: { desc: 'Open-source model hosting — Llama, Qwen, Mixtral', placeholder: '' },
    openrouter: { desc: 'Multi-provider router — access 100+ models via one API key', placeholder: 'sk-or-...' },
  };

  return h(Fragment, null,
    h('div', { className: 'card', style: { marginBottom: 16 } },
      h('div', { className: 'card-header' }, h('h3', null, 'Connected Providers')),
      h('div', { className: 'card-body' },
        configured.length === 0
          ? h('div', { style: { padding: 24, textAlign: 'center', color: 'var(--text-muted)' } }, 'No providers connected yet. Add an API key below to get started.')
          : configured.map(function(p) {
              var meta = providerMeta[p.id] || {};
              return h('div', { key: p.id, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' } },
                h('div', null,
                  h('span', { style: { fontWeight: 600, fontSize: 14 } }, p.name),
                  h('span', { style: { marginLeft: 8, color: 'var(--success, #22c55e)', fontSize: 12 } }, '\u2713 Connected'),
                  h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 } }, meta.desc || '')
                ),
                h('button', {
                  className: 'btn btn-ghost btn-sm',
                  onClick: function() { setApiKeyInputs(function(s) { return Object.assign({}, s, { [p.id]: s[p.id] === null ? '' : null }); }); }
                }, apiKeyInputs[p.id] === null ? 'Cancel' : 'Update Key'),
                typeof apiKeyInputs[p.id] === 'string' && apiKeyInputs[p.id] !== null && h('div', { style: { display: 'flex', gap: 8, marginLeft: 8 } },
                  h('input', { className: 'input', type: 'password', value: apiKeyInputs[p.id], onChange: function(e) { setApiKeyInputs(function(s) { return Object.assign({}, s, { [p.id]: e.target.value }); }); }, placeholder: meta.placeholder || 'New API key', style: { width: 240, fontSize: 13 } }),
                  h('button', { className: 'btn btn-primary btn-sm', disabled: saving[p.id], onClick: function() { saveKey(p.id, p.name); } }, saving[p.id] ? (savingMsg[p.id] || 'Saving...') : 'Save')
                )
              );
            })
      )
    ),

    h('div', { className: 'card', style: { marginBottom: 16 } },
      h('div', { className: 'card-header' }, h('h3', null, 'Add Provider')),
      h('div', { className: 'card-body' },
        notConfigured.length === 0
          ? h('div', { style: { padding: 16, textAlign: 'center', color: 'var(--text-muted)' } }, 'All built-in providers are configured.')
          : notConfigured.map(function(p) {
              var meta = providerMeta[p.id] || {};
              return h('div', { key: p.id, style: { padding: '12px 0', borderBottom: '1px solid var(--border)' } },
                h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 } },
                  h('div', null,
                    h('span', { style: { fontWeight: 600, fontSize: 14 } }, p.name),
                    p.isLocal && h('span', { className: 'badge badge-neutral', style: { marginLeft: 8, fontSize: 11 } }, 'Local'),
                    h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 } }, meta.desc || '')
                  )
                ),
                h('div', { style: { display: 'flex', gap: 8 } },
                  h('input', { className: 'input', type: 'password', value: apiKeyInputs[p.id] || '', onChange: function(e) { setApiKeyInputs(function(s) { return Object.assign({}, s, { [p.id]: e.target.value }); }); }, placeholder: meta.placeholder || 'Paste API key', style: { flex: 1, fontSize: 13 } }),
                  h('button', { className: 'btn btn-primary btn-sm', disabled: saving[p.id] || !(apiKeyInputs[p.id] || '').trim(), onClick: function() { saveKey(p.id, p.name); } }, saving[p.id] ? (savingMsg[p.id] || 'Saving...') : 'Connect')
                )
              );
            })
      )
    ),

    // Local providers (no key needed)
    builtIn.filter(function(p) { return !p.requiresApiKey; }).length > 0 && h('div', { className: 'card' },
      h('div', { className: 'card-header' }, h('h3', null, 'Local Providers (No API Key)')),
      h('div', { className: 'card-body' },
        builtIn.filter(function(p) { return !p.requiresApiKey; }).map(function(p) {
          return h('div', { key: p.id, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' } },
            h('div', null,
              h('span', { style: { fontWeight: 600, fontSize: 14 } }, p.name),
              h('span', { className: 'badge badge-success', style: { marginLeft: 8, fontSize: 11 } }, 'Ready'),
              h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 } }, p.baseUrl)
            )
          );
        })
      )
    ),

    h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 12 } },
      'API keys are stored encrypted in your database. They are loaded into memory at agent startup. ',
      'For custom or self-hosted providers, use the Model Pricing tab to add custom endpoints.'
    )
  );
}

function ProvidersSection(props) {
  var providers = props.providers || [];
  var toast = props.toast;
  var discoverResults = props.discoverResults || {};
  var _discovering = useState({});
  var discovering = _discovering[0]; var setDiscovering = _discovering[1];

  var handleAddProvider = function() {
    var np = props.newProvider;
    if (!np.id || !np.name || !np.baseUrl) {
      toast('ID, Name, and Base URL are required', 'error');
      return;
    }
    var body = {
      id: np.id.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      name: np.name,
      baseUrl: np.baseUrl,
      apiType: np.apiType || 'openai-compatible',
      apiKeyEnvVar: np.apiKeyEnvVar || undefined,
      customHeaders: undefined,
    };
    if (np.customHeaders) {
      try { body.customHeaders = JSON.parse(np.customHeaders); }
      catch (e) { toast('Invalid JSON in Custom Headers', 'error'); return; }
    }
    apiCall('/providers', { method: 'POST', body: JSON.stringify(body) }).then(function() {
      toast('Provider added', 'success');
      props.setShowAddProvider(false);
      props.setNewProvider({ id: '', name: '', baseUrl: '', apiType: 'openai-compatible', apiKeyEnvVar: '', customHeaders: '' });
      apiCall('/providers').then(function(d) { props.setProviders(d.providers || d || []); }).catch(function() {});
    }).catch(function(e) { toast(e.message, 'error'); });
  };

  var handleDeleteProvider = function(id) {
    showConfirm({ title: 'Delete Provider', message: 'Are you sure you want to delete this custom provider?', danger: true, confirmText: 'Delete' }).then(function(ok) {
      if (!ok) return;
      apiCall('/providers/' + id, { method: 'DELETE' }).then(function() {
        toast('Provider deleted', 'success');
        apiCall('/providers').then(function(d) { props.setProviders(d.providers || d || []); }).catch(function() {});
      }).catch(function(e) { toast(e.message, 'error'); });
    });
  };

  var handleDiscover = function(id) {
    setDiscovering(Object.assign({}, discovering, { [id]: true }));
    apiCall('/providers/' + id + '/models').then(function(d) {
      var results = Object.assign({}, discoverResults);
      results[id] = d.models || d || [];
      props.setDiscoverResults(results);
    }).catch(function(e) { toast(e.message, 'error'); }).finally(function() {
      setDiscovering(Object.assign({}, discovering, { [id]: false }));
    });
  };

  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
      h('div', null,
        h('h3', { style: { fontSize: 15, fontWeight: 700, margin: '0 0 4px 0' } }, 'LLM Providers'),
        h('p', { style: { color: '#6b7280', fontSize: 13, margin: 0 } }, 'Manage connected LLM providers. Add custom providers to use self-hosted or third-party models.')
      ),
      h('button', { className: 'btn', onClick: function() { props.setShowAddProvider(true); } }, '+ Add Custom Provider')
    ),

    // Provider cards grid
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 24 } },
      providers.map(function(p) {
        var isConfigured = p.configured || p.isConfigured;
        var isLocal = p.isLocal || false;
        var discovered = discoverResults[p.id];
        return h('div', { key: p.id, className: 'card', style: { padding: 16 } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 } },
            h('div', null,
              h('h4', { style: { fontSize: 14, fontWeight: 600, margin: 0 } }, p.name || p.id),
              p.apiType && h('span', { style: { fontSize: 11, color: '#9ca3af', background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: 4, marginTop: 4, display: 'inline-block' } }, p.apiType)
            ),
            h('span', {
              className: 'badge',
              style: {
                background: isConfigured ? 'var(--success-soft, #dcfce7)' : 'var(--bg-secondary)',
                color: isConfigured ? 'var(--success, #16a34a)' : '#9ca3af',
                fontSize: 11,
              }
            }, isConfigured ? 'Connected' : 'Not Configured')
          ),
          isLocal && p.baseUrl && h('div', { style: { fontSize: 12, color: '#6b7280', marginBottom: 8, wordBreak: 'break-all' } }, p.baseUrl),
          !isLocal && !p.isCustom && p.requiresApiKey && h('div', { style: { marginTop: 8 } },
            isConfigured
              ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 } },
                  h('span', { style: { color: 'var(--success, #16a34a)', display: 'inline-flex', alignItems: 'center', gap: 6 } }, E.checkCircle(16), ' API key configured via environment'),
                  h('button', { className: 'btn btn-sm btn-ghost', style: { padding: '2px 8px', fontSize: 11 }, onClick: function() {
                    props.setApiKeyInput('');
                    props.setApiKeyModal({ providerId: p.id, providerName: p.name, isUpdate: true });
                  }}, 'Update Key')
                )
              : h('div', null,
                  h('button', { className: 'btn btn-sm btn-primary', onClick: function() {
                    props.setApiKeyInput('');
                    props.setApiKeyModal({ providerId: p.id, providerName: p.name, isUpdate: false });
                  }}, E.key(16), ' Add API Key')
                )
          ),
          h('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
            (isLocal || isConfigured) && h('button', {
              className: 'btn btn-sm',
              disabled: discovering[p.id],
              onClick: function() { handleDiscover(p.id); },
            }, discovering[p.id] ? 'Discovering...' : (isLocal ? 'Discover Models' : 'List Models')),
            p.isCustom && h('button', {
              className: 'btn btn-sm btn-danger',
              style: { padding: '2px 8px', fontSize: 12 },
              onClick: function() { handleDeleteProvider(p.id); },
            }, I.trash())
          ),
          // Show default models for cloud providers that have them
          !discovered && p.defaultModels && p.defaultModels.length > 0 && h('div', { style: { marginTop: 8, fontSize: 12 } },
            h('div', { style: { fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' } }, 'Available Models (' + p.defaultModels.length + ')'),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
              p.defaultModels.map(function(mid) {
                return h('span', { key: mid, className: 'badge badge-neutral', style: { fontSize: 11 } }, mid);
              })
            )
          ),
          discovered && discovered.length > 0 && h('div', { style: { marginTop: 8, padding: 8, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', fontSize: 12 } },
            h('div', { style: { fontWeight: 600, marginBottom: 4 } }, 'Models (' + discovered.length + ')'),
            h('div', { style: { maxHeight: 120, overflow: 'auto' } },
              discovered.map(function(m) {
                var modelName = typeof m === 'string' ? m : (m.id || m.name || m.model);
                return h('div', { key: modelName, style: { padding: '2px 0', color: '#6b7280' } }, modelName);
              })
            )
          )
        );
      })
    ),

    // Add Custom Provider Modal
    props.showAddProvider && h(Modal, {
      title: 'Add Custom Provider',
      onClose: function() { props.setShowAddProvider(false); },
    },
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'ID'),
          h('input', { className: 'input', placeholder: 'e.g. internal-llm', value: props.newProvider.id, onChange: function(e) { props.setNewProvider(Object.assign({}, props.newProvider, { id: e.target.value })); } }),
          h('p', { className: 'form-help' }, 'Lowercase slug, used as identifier')
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Display Name'),
          h('input', { className: 'input', placeholder: 'e.g. Internal LLM', value: props.newProvider.name, onChange: function(e) { props.setNewProvider(Object.assign({}, props.newProvider, { name: e.target.value })); } })
        ),
        h('div', { className: 'form-group', style: { gridColumn: '1 / -1' } },
          h('label', { className: 'form-label' }, 'Base URL'),
          h('input', { className: 'input', placeholder: 'e.g. http://internal-llm:8080/v1', value: props.newProvider.baseUrl, onChange: function(e) { props.setNewProvider(Object.assign({}, props.newProvider, { baseUrl: e.target.value })); } })
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'API Type'),
          h('select', { className: 'input', value: props.newProvider.apiType, onChange: function(e) { props.setNewProvider(Object.assign({}, props.newProvider, { apiType: e.target.value })); } },
            h('option', { value: 'openai-compatible' }, 'OpenAI Compatible'),
            h('option', { value: 'anthropic' }, 'Anthropic'),
            h('option', { value: 'google' }, 'Google'),
            h('option', { value: 'ollama' }, 'Ollama')
          )
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'API Key Env Var'),
          h('input', { className: 'input', placeholder: 'e.g. INTERNAL_LLM_KEY', value: props.newProvider.apiKeyEnvVar, onChange: function(e) { props.setNewProvider(Object.assign({}, props.newProvider, { apiKeyEnvVar: e.target.value })); } }),
          h('p', { className: 'form-help' }, 'Environment variable name for the API key')
        ),
        h('div', { className: 'form-group', style: { gridColumn: '1 / -1' } },
          h('label', { className: 'form-label' }, 'Custom Headers (JSON)'),
          h('textarea', { className: 'input', rows: 3, placeholder: '{"X-Custom-Header": "value"}', value: props.newProvider.customHeaders, onChange: function(e) { props.setNewProvider(Object.assign({}, props.newProvider, { customHeaders: e.target.value })); } })
        )
      ),
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 } },
        h('button', { className: 'btn', onClick: function() { props.setShowAddProvider(false); } }, 'Cancel'),
        h('button', { className: 'btn btn-primary', onClick: handleAddProvider }, 'Add Provider')
      )
    ),

    // API Key Modal
    props.apiKeyModal && h(Modal, {
      title: (props.apiKeyModal.isUpdate ? 'Update' : 'Add') + ' API Key — ' + props.apiKeyModal.providerName,
      onClose: function() { props.setApiKeyModal(null); props.setApiKeyInput(''); },
    },
      h('div', { style: { marginBottom: 16 } },
        h('p', { style: { color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 16px 0', lineHeight: 1.5 } },
          props.apiKeyModal.isUpdate
            ? 'Enter a new API key to replace the current one for ' + props.apiKeyModal.providerName + '.'
            : 'Enter your ' + props.apiKeyModal.providerName + ' API key to enable this provider.'
        ),
        h('label', { className: 'form-label' }, 'API Key'),
        h('input', {
          className: 'input',
          type: 'password',
          placeholder: 'sk-...',
          value: props.apiKeyInput,
          autoFocus: true,
          onChange: function(e) { props.setApiKeyInput(e.target.value); },
          onKeyDown: function(e) {
            if (e.key === 'Enter' && props.apiKeyInput.trim()) {
              var m = props.apiKeyModal;
              apiCall('/providers/' + m.providerId + '/api-key', { method: 'POST', body: JSON.stringify({ apiKey: props.apiKeyInput.trim() }) })
                .then(function() { toast((m.isUpdate ? 'API key updated' : 'API key saved') + ' for ' + m.providerName + '!', 'success'); props.setApiKeyModal(null); props.setApiKeyInput(''); window.location.reload(); })
                .catch(function(e) { toast(e.message || 'Failed to save', 'error'); });
            }
          },
          style: { fontSize: 14, fontFamily: 'var(--font-mono, monospace)' },
        }),
        h('p', { className: 'form-help', style: { marginTop: 6 } }, 'Your key is stored encrypted and never exposed in the dashboard.')
      ),
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
        h('button', { className: 'btn', onClick: function() { props.setApiKeyModal(null); props.setApiKeyInput(''); } }, 'Cancel'),
        h('button', {
          className: 'btn btn-primary',
          disabled: !props.apiKeyInput.trim(),
          onClick: function() {
            var m = props.apiKeyModal;
            apiCall('/providers/' + m.providerId + '/api-key', { method: 'POST', body: JSON.stringify({ apiKey: props.apiKeyInput.trim() }) })
              .then(function() { toast((m.isUpdate ? 'API key updated' : 'API key saved') + ' for ' + m.providerName + '!', 'success'); props.setApiKeyModal(null); props.setApiKeyInput(''); window.location.reload(); })
              .catch(function(e) { toast(e.message || 'Failed to save', 'error'); });
          }
        }, props.apiKeyModal.isUpdate ? 'Update Key' : 'Save Key')
      )
    )
  );
}

// ═══════════════════════════════════════════════════════════
// MODEL PRICING TAB
// ═══════════════════════════════════════════════════════════

function ModelPricingTab(props) {
  var pricing = props.pricing;
  var models = pricing.models || [];
  var providerGroups = {};
  models.forEach(function(m) {
    if (!providerGroups[m.provider]) providerGroups[m.provider] = [];
    providerGroups[m.provider].push(m);
  });

  var allProviders = props.providers || [];
  var providerNames = {};
  allProviders.forEach(function(p) { providerNames[p.id] = p.name; });

  return h(Fragment, null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
      h('div', null,
        h('h3', { style: { fontSize: 15, fontWeight: 700, margin: '0 0 4px 0' } }, 'Model Pricing'),
        h('p', { style: { color: '#6b7280', fontSize: 13, margin: 0 } }, 'Configure token costs per model for accurate budget tracking and cost reporting. Costs are in USD per 1 million tokens.')
      ),
      h('div', { style: { display: 'flex', gap: 8 } },
        props.dirty && h('button', {
          className: 'btn btn-primary',
          disabled: props.saving,
          onClick: props.onSave,
        }, props.saving ? 'Saving...' : 'Save Changes'),
        h('button', { className: 'btn', onClick: function() { props.setShowAddModel(true); } }, '+ Add Model')
      )
    ),

    // Add Model Modal
    props.showAddModel && h(Modal, {
      title: 'Add Model Pricing',
      onClose: function() { props.setShowAddModel(false); },
    },
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Provider'),
          h('select', { className: 'input', value: props.newModel.provider, onChange: function(e) { props.setNewModel(Object.assign({}, props.newModel, { provider: e.target.value })); } },
            allProviders.map(function(p) {
              return h('option', { key: p.id, value: p.id }, p.name);
            })
          )
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Model ID'),
          h('input', { className: 'input', placeholder: 'e.g. claude-sonnet-4-5-20250929', value: props.newModel.modelId, onChange: function(e) { props.setNewModel(Object.assign({}, props.newModel, { modelId: e.target.value })); } })
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Display Name'),
          h('input', { className: 'input', placeholder: 'e.g. Claude Sonnet 4.5', value: props.newModel.displayName, onChange: function(e) { props.setNewModel(Object.assign({}, props.newModel, { displayName: e.target.value })); } })
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Context Window'),
          h('input', { className: 'input', type: 'number', value: props.newModel.contextWindow || '', onChange: function(e) { props.setNewModel(Object.assign({}, props.newModel, { contextWindow: parseInt(e.target.value) || 0 })); } })
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Input Cost (per 1M tokens)'),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
            h('span', { style: { color: '#6b7280' } }, '$'),
            h('input', { className: 'input', type: 'number', step: '0.01', value: props.newModel.inputCostPerMillion || '', onChange: function(e) { props.setNewModel(Object.assign({}, props.newModel, { inputCostPerMillion: parseFloat(e.target.value) || 0 })); } })
          )
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Output Cost (per 1M tokens)'),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
            h('span', { style: { color: '#6b7280' } }, '$'),
            h('input', { className: 'input', type: 'number', step: '0.01', value: props.newModel.outputCostPerMillion || '', onChange: function(e) { props.setNewModel(Object.assign({}, props.newModel, { outputCostPerMillion: parseFloat(e.target.value) || 0 })); } })
          )
        )
      ),
      h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 } },
        h('button', { className: 'btn', onClick: function() { props.setShowAddModel(false); } }, 'Cancel'),
        h('button', { className: 'btn btn-primary', onClick: props.onAddModel }, 'Add Model')
      )
    ),

    // Model pricing table grouped by provider
    Object.keys(providerGroups).length === 0
      ? h('div', { className: 'card', style: { padding: 32, textAlign: 'center' } },
          h('p', { style: { color: '#6b7280' } }, 'No model pricing configured. Default pricing will be used for cost tracking.'),
          h('button', { className: 'btn btn-primary', onClick: function() { props.setShowAddModel(true); } }, 'Add First Model')
        )
      : Object.keys(providerGroups).sort().map(function(provider) {
          var providerModels = providerGroups[provider];
          var providerLabel = providerNames[provider] || provider;
          return h('div', { key: provider, className: 'card', style: { marginBottom: 16 } },
            h('div', { className: 'card-header' }, h('h3', null, providerLabel)),
            h('div', { className: 'card-body', style: { padding: 0 } },
              h('table', { className: 'table', style: { width: '100%' } },
                h('thead', null,
                  h('tr', null,
                    h('th', { style: { padding: '8px 12px' } }, 'Model'),
                    h('th', { style: { padding: '8px 12px', textAlign: 'right' } }, 'Input $/1M'),
                    h('th', { style: { padding: '8px 12px', textAlign: 'right' } }, 'Output $/1M'),
                    h('th', { style: { padding: '8px 12px', textAlign: 'right' } }, 'Context'),
                    h('th', { style: { padding: '8px 12px', width: 60 } }, '')
                  )
                ),
                h('tbody', null,
                  providerModels.map(function(m) {
                    var globalIdx = models.indexOf(m);
                    return h('tr', { key: m.modelId },
                      h('td', { style: { padding: '8px 12px' } },
                        h('div', null, h('strong', null, m.displayName || m.modelId)),
                        h('div', { style: { fontSize: 12, color: '#6b7280' } }, m.modelId)
                      ),
                      h('td', { style: { padding: '8px 12px', textAlign: 'right' } },
                        h('input', {
                          className: 'input',
                          type: 'number',
                          step: '0.01',
                          style: { width: 90, textAlign: 'right' },
                          value: m.inputCostPerMillion,
                          onChange: function(e) { props.onUpdateModel(globalIdx, 'inputCostPerMillion', parseFloat(e.target.value) || 0); }
                        })
                      ),
                      h('td', { style: { padding: '8px 12px', textAlign: 'right' } },
                        h('input', {
                          className: 'input',
                          type: 'number',
                          step: '0.01',
                          style: { width: 90, textAlign: 'right' },
                          value: m.outputCostPerMillion,
                          onChange: function(e) { props.onUpdateModel(globalIdx, 'outputCostPerMillion', parseFloat(e.target.value) || 0); }
                        })
                      ),
                      h('td', { style: { padding: '8px 12px', textAlign: 'right', fontSize: 13, color: '#6b7280' } },
                        m.contextWindow ? (m.contextWindow >= 1000000 ? (m.contextWindow / 1000000) + 'M' : Math.round(m.contextWindow / 1000) + 'K') : '\u2014'
                      ),
                      h('td', { style: { padding: '8px 12px', textAlign: 'center' } },
                        h('button', {
                          className: 'btn btn-sm btn-danger',
                          style: { padding: '2px 8px', fontSize: 12 },
                          onClick: function() { props.onRemoveModel(globalIdx); }
                        }, I.trash())
                      )
                    );
                  })
                )
              )
            )
          );
        }),

    // Summary footer
    models.length > 0 && h('div', { style: { fontSize: 13, color: '#6b7280', marginTop: 8 } },
      models.length + ' model(s) configured across ' + Object.keys(providerGroups).length + ' provider(s)',
      pricing.updatedAt && h('span', null, ' \u2014 Last updated: ' + new Date(pricing.updatedAt).toLocaleString())
    )
  );
}

// ─── Two-Factor Authentication Card ─────────────────────

function TwoFactorCard({ toast }) {
  var [status, setStatus] = useState(null); // null=loading, true=enabled, false=disabled
  var [setupData, setSetupData] = useState(null); // { secret, otpauthUrl }
  var [verifyCode, setVerifyCode] = useState('');
  var [backupCodes, setBackupCodes] = useState(null);
  var [disablePassword, setDisablePassword] = useState('');
  var [showDisable, setShowDisable] = useState(false);
  var [loading, setLoading] = useState(false);
  var [error, setError] = useState('');

  useEffect(function() {
    fetch('/auth/2fa/status', { credentials: 'same-origin' }).then(function(r) { return r.ok ? r.json() : null; }).then(function(d) {
      if (d) setStatus(d.enabled);
    }).catch(function() { setStatus(false); });
  }, []);

  var startSetup = async function() {
    setError(''); setLoading(true);
    try {
      var r = await fetch('/auth/2fa/setup', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Setup failed');
      setSetupData(d);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  var confirmSetup = async function() {
    setError(''); setLoading(true);
    try {
      var r = await fetch('/auth/2fa/confirm', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: verifyCode }) });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Verification failed');
      setBackupCodes(d.backupCodes);
      setStatus(true);
      setSetupData(null);
      toast('Two-factor authentication enabled', 'success');
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  var disable2fa = async function() {
    setError(''); setLoading(true);
    try {
      var r = await fetch('/auth/2fa/disable', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: disablePassword }) });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to disable');
      setStatus(false);
      setShowDisable(false);
      setDisablePassword('');
      toast('Two-factor authentication disabled', 'success');
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return h('div', { className: 'card', style: { marginBottom: 16 } },
    h('div', { className: 'card-header' }, h('h3', null, I.shield(), ' Two-Factor Authentication (2FA)')),
    h('div', { className: 'card-body' },

      // Loading state
      status === null && h('div', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Checking 2FA status...'),

      // Enabled state
      status === true && !backupCodes && h('div', null,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 } },
          h('span', { className: 'badge badge-success' }, 'Enabled'),
          h('span', { style: { fontSize: 13, color: 'var(--text-secondary)' } }, 'Your account is protected with two-factor authentication.')
        ),
        !showDisable && h('button', { className: 'btn btn-danger btn-sm', onClick: function() { setShowDisable(true); } }, 'Disable 2FA'),
        showDisable && h('div', { style: { marginTop: 12, padding: 16, background: 'var(--danger-soft)', borderRadius: 'var(--radius)', border: '1px solid var(--danger)' } },
          h('div', { style: { fontWeight: 600, marginBottom: 8, color: 'var(--danger)' } }, 'Confirm disable'),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Enter your password to disable 2FA'),
            h('input', { className: 'input', type: 'password', value: disablePassword, onChange: function(e) { setDisablePassword(e.target.value); }, placeholder: 'Your password' })
          ),
          error && h('div', { style: { color: 'var(--danger)', fontSize: 12, marginBottom: 8 } }, error),
          h('div', { style: { display: 'flex', gap: 8 } },
            h('button', { className: 'btn btn-danger btn-sm', disabled: loading || !disablePassword, onClick: disable2fa }, loading ? 'Disabling...' : 'Disable 2FA'),
            h('button', { className: 'btn btn-secondary btn-sm', onClick: function() { setShowDisable(false); setError(''); } }, 'Cancel')
          )
        )
      ),

      // Backup codes display (shown once after enabling)
      backupCodes && h('div', null,
        h('div', { style: { background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 } },
          h('div', { style: { fontWeight: 600, marginBottom: 8, color: 'var(--warning)' } }, 'Save Your Backup Codes'),
          h('div', { style: { fontSize: 12, marginBottom: 12, color: 'var(--text-secondary)' } }, 'These codes can be used if you lose access to your authenticator app. Each code can only be used once. Store them securely.'),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 } },
            backupCodes.map(function(code) {
              return h('code', { key: code, style: { padding: '6px 8px', background: 'var(--bg-tertiary)', borderRadius: 4, textAlign: 'center', fontSize: 13, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' } }, code);
            })
          )
        ),
        h('button', { className: 'btn btn-primary btn-sm', onClick: function() { setBackupCodes(null); } }, 'I have saved my backup codes')
      ),

      // Disabled state — setup flow
      status === false && !setupData && h('div', null,
        h('p', { style: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 } }, 'Add an extra layer of security to your account. You will need an authenticator app like Google Authenticator, Authy, or 1Password.'),
        h('button', { className: 'btn btn-primary btn-sm', disabled: loading, onClick: startSetup }, loading ? 'Setting up...' : 'Enable 2FA'),
        error && h('div', { style: { color: 'var(--danger)', fontSize: 12, marginTop: 8 } }, error)
      ),

      // Setup flow — show secret + verify
      setupData && h('div', null,
        h('div', { style: { marginBottom: 16 } },
          h('div', { style: { fontWeight: 600, marginBottom: 8 } }, 'Step 1: Scan QR Code'),
          h('p', { style: { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 } }, 'Scan this code with your authenticator app. If you cannot scan, enter the secret key manually.'),
          // QR code as a simple image from a public API
          h('div', { style: { display: 'flex', gap: 16, alignItems: 'flex-start' } },
            h('img', { src: 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' + encodeURIComponent(setupData.otpauthUrl), alt: 'QR Code', style: { width: 160, height: 160, borderRadius: 8, border: '1px solid var(--border)' } }),
            h('div', null,
              h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 } }, 'Secret Key (manual entry):'),
              h('code', { style: { display: 'block', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6, fontSize: 14, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', wordBreak: 'break-all', cursor: 'pointer' }, onClick: function() { navigator.clipboard?.writeText(setupData.secret); toast('Secret copied', 'info'); } }, setupData.secret),
              h('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 } }, 'Click to copy')
            )
          )
        ),
        h('div', null,
          h('div', { style: { fontWeight: 600, marginBottom: 8 } }, 'Step 2: Verify Code'),
          h('p', { style: { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 } }, 'Enter the 6-digit code from your authenticator app to confirm setup.'),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
            h('input', {
              className: 'input', type: 'text', inputMode: 'numeric', autoComplete: 'one-time-code',
              value: verifyCode, onChange: function(e) { setVerifyCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6)); },
              placeholder: '000000', maxLength: 6,
              style: { width: 160, textAlign: 'center', fontSize: 20, letterSpacing: '0.3em', fontFamily: 'var(--font-mono)' }
            }),
            h('button', { className: 'btn btn-primary btn-sm', disabled: loading || verifyCode.length !== 6, onClick: confirmSetup }, loading ? 'Verifying...' : 'Verify & Enable'),
            h('button', { className: 'btn btn-secondary btn-sm', onClick: function() { setSetupData(null); setVerifyCode(''); setError(''); } }, 'Cancel')
          ),
          error && h('div', { style: { color: 'var(--danger)', fontSize: 12, marginTop: 8 } }, error)
        )
      )
    )
  );
}

// ─── Platform Capabilities Tab ──────────────────────────

function PlatformCapabilitiesTab({ toast }) {
  var [caps, setCaps] = useState(null);
  var [serverOS, setServerOS] = useState(null);
  var [loading, setLoading] = useState(true);
  var [saving, setSaving] = useState(false);

  // Triple confirm state
  var [confirmTarget, setConfirmTarget] = useState(null); // { key, label }
  var [confirmStep, setConfirmStep] = useState(0);
  var [confirmTyped, setConfirmTyped] = useState('');

  useEffect(function() {
    apiCall('/platform-capabilities').then(function(d) {
      setCaps(d.capabilities || {});
      if (d.serverOS) setServerOS(d.serverOS);
    }).catch(function() { setCaps({}); }).finally(function() { setLoading(false); });
  }, []);

  var startToggle = function(key, label, currentValue) {
    if (currentValue) {
      saveCap(key, false);
    } else {
      setConfirmTarget({ key: key, label: label });
      setConfirmStep(1);
      setConfirmTyped('');
    }
  };

  var advanceConfirm = function() {
    if (confirmStep < 3) { setConfirmStep(confirmStep + 1); return; }
    if (confirmStep === 3) {
      if (confirmTyped.trim().toUpperCase() !== 'ENABLE') { toast('Type ENABLE to confirm', 'error'); return; }
      saveCap(confirmTarget.key, true);
      setConfirmStep(0); setConfirmTarget(null); setConfirmTyped('');
    }
  };

  var cancelConfirm = function() { setConfirmStep(0); setConfirmTarget(null); setConfirmTyped(''); };

  var saveCap = async function(key, value) {
    var next = Object.assign({}, caps, { [key]: value });
    setCaps(next); setSaving(true);
    try {
      await apiCall('/platform-capabilities', { method: 'PUT', body: JSON.stringify(next) });
      toast((value ? 'Enabled! Go to agent > Channels tab to configure.' : 'Disabled successfully'), 'success');
    } catch (e) { toast(e.message, 'error'); }
    setSaving(false);
  };

  if (loading) return h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading...');

  var CAPS = [
    { key: 'localSystemAccess', label: 'Local System Access', desc: 'Full access to host filesystem (read/write/delete) and shell (execute commands, sudo, install packages). Equivalent to terminal access.', icon: E.terminal, danger: 'Agents can read, modify, and delete ANY file on this machine, execute arbitrary shell commands, and install software with sudo. Only enable if you trust the agents completely.', nextSteps: 'Tools are now available to all agents. No further config needed — agents can use shell_exec, file_read, shell_sudo, shell_install, etc.' },
    { key: 'telegram', label: 'Telegram', desc: 'Send and receive Telegram messages via Bot API. Webhook preferred, long-polling fallback.', icon: E.telegram, danger: 'Agents will send messages through the configured Telegram bot. Webhook preferred (auto-detected), long-polling fallback.', nextSteps: 'Step 1: Open Telegram, search @BotFather, send /newbot, follow the steps to get a bot token. Step 2: Go to any agent > Channels tab > Telegram card, paste the bot token. Step 3: Add your Telegram user ID to Trusted Chat IDs (get it from @userinfobot).' },
    { key: 'whatsapp', label: 'WhatsApp', desc: 'Connect via QR code scan — agents link as a device on a WhatsApp account. No Business API needed.', icon: E.whatsapp, danger: 'Agents will appear as a linked device on the WhatsApp account and can send/receive messages, voice notes, media, and manage groups as that phone number.', nextSteps: 'Go to any agent > Channels tab > WhatsApp card. Click "Connect WhatsApp" to generate a QR code. Open WhatsApp on your phone > Settings > Linked Devices > Link a Device > Scan the QR code.' },
  ];

  return h(Fragment, null,
    h('div', { style: { marginBottom: 16 } },
      h('p', { style: { color: 'var(--text-secondary)', fontSize: 13 } }, 'Control platform-level capabilities for agents. These are powerful features that operate outside the normal API sandbox. Each requires triple confirmation to enable.')
    ),

    CAPS.map(function(cap) {
      var enabled = !!caps[cap.key];
      var osUnavailable = cap.requiresOS && serverOS && serverOS !== cap.requiresOS;
      return h('div', { key: cap.key, className: 'card', style: { marginBottom: 12, borderColor: osUnavailable ? 'var(--border)' : enabled ? 'var(--success)' : 'var(--border)', opacity: osUnavailable ? 0.7 : 1 } },
        h('div', { className: 'card-body' },
          h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 } },
            h('div', { style: { flex: 1 } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
                cap.icon(),
                h('span', { style: { fontWeight: 600, fontSize: 14 } }, cap.label),
                osUnavailable
                  ? h('span', { className: 'badge badge-neutral', style: { marginLeft: 8, background: '#dc354520', color: '#dc3545' } }, 'Unavailable')
                  : h('span', { className: 'badge badge-' + (enabled ? 'success' : 'neutral'), style: { marginLeft: 8 } }, enabled ? 'Enabled' : 'Disabled')
              ),
              osUnavailable
                ? h('div', { style: { marginTop: 6, padding: '10px 12px', background: '#dc354508', borderRadius: 8, fontSize: 12, border: '1px solid #dc354520', color: 'var(--text-secondary)' } },
                    E.warning(14), ' ', cap.unavailableMsg
                  )
                : h(Fragment, null,
                    h('p', { style: { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 0 } }, cap.desc),
                    enabled && cap.nextSteps && h('div', { style: { marginTop: 10, padding: '10px 12px', background: 'var(--accent-soft, #e8f4ff)', borderRadius: 8, fontSize: 12, borderLeft: '3px solid var(--accent)' } },
                      h('strong', null, 'Next: '), cap.nextSteps
                    )
                  )
            ),
            !osUnavailable && h('button', {
              className: 'btn btn-sm ' + (enabled ? 'btn-danger' : 'btn-primary'),
              disabled: saving,
              onClick: function() { startToggle(cap.key, cap.label, enabled); }
            }, enabled ? 'Disable' : 'Enable')
          )
        )
      );
    }),

    // Triple confirmation modal
    confirmStep >= 1 && confirmTarget && h('div', { className: 'modal-overlay', onClick: cancelConfirm },
      h('div', { className: 'modal', onClick: function(e) { e.stopPropagation(); }, style: { width: 480 } },
        h('div', { className: 'modal-header' },
          h('h2', { style: { color: 'var(--danger)' } },
            confirmStep === 1 ? 'Enable ' + confirmTarget.label + '?' :
            confirmStep === 2 ? 'Security Warning' :
            'Final Confirmation'
          ),
          h('button', { className: 'btn btn-ghost btn-icon', onClick: cancelConfirm }, '\u00D7')
        ),
        h('div', { className: 'modal-body', style: { padding: 20 } },

          confirmStep === 1 && h(Fragment, null,
            h('p', { style: { marginBottom: 12 } }, 'You are about to enable ', h('strong', null, confirmTarget.label), ' for all agents in your organization.'),
            h('p', { style: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 } }, 'This gives agents access to powerful system-level features outside the normal API sandbox.'),
            h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
              h('button', { className: 'btn btn-secondary', onClick: cancelConfirm }, 'Cancel'),
              h('button', { className: 'btn btn-danger', onClick: advanceConfirm }, 'I understand, continue')
            )
          ),

          confirmStep === 2 && h(Fragment, null,
            h('div', { style: { background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16 } },
              h('strong', { style: { color: 'var(--danger)', display: 'block', marginBottom: 4 } }, 'SECURITY WARNING'),
              h('p', { style: { fontSize: 12, margin: 0 } }, CAPS.find(function(c) { return c.key === confirmTarget.key; })?.danger)
            ),
            h('ul', { style: { fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 20, marginBottom: 16 } },
              h('li', null, 'This action is logged in the audit trail'),
              h('li', null, 'Only organization owners can enable this'),
              h('li', null, 'Takes effect immediately for ALL agents'),
              h('li', null, 'Can be disabled at any time')
            ),
            h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
              h('button', { className: 'btn btn-secondary', onClick: cancelConfirm }, 'Cancel'),
              h('button', { className: 'btn btn-danger', onClick: advanceConfirm }, 'I accept the risks')
            )
          ),

          confirmStep === 3 && h(Fragment, null,
            h('p', { style: { marginBottom: 12 } }, 'Type ', h('strong', { style: { fontFamily: 'var(--font-mono)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4 } }, 'ENABLE'), ' to confirm:'),
            h('input', {
              type: 'text', className: 'form-control', placeholder: 'Type ENABLE...',
              value: confirmTyped, autoFocus: true,
              onInput: function(e) { setConfirmTyped(e.target.value); },
              onKeyDown: function(e) { if (e.key === 'Enter') advanceConfirm(); },
              style: { marginBottom: 16, textAlign: 'center', fontSize: 18, letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', borderColor: confirmTyped.trim().toUpperCase() === 'ENABLE' ? 'var(--danger)' : 'var(--border)' }
            }),
            h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
              h('button', { className: 'btn btn-secondary', onClick: cancelConfirm }, 'Cancel'),
              h('button', {
                className: 'btn btn-danger',
                disabled: confirmTyped.trim().toUpperCase() !== 'ENABLE',
                onClick: advanceConfirm
              }, 'Enable ' + confirmTarget.label)
            )
          )
        )
      )
    )
  );
}
