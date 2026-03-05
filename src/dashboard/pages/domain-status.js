import { h, useState, useEffect, useCallback, Fragment, useApp, apiCall, showConfirm } from '../components/utils.js';
import { I } from '../components/icons.js';
import { E } from '../assets/icons/emoji-icons.js';
import { HelpButton } from '../components/help-button.js';
import { KnowledgeLink } from '../components/knowledge-link.js';

export function DomainStatusPage() {
  var { toast } = useApp();
  var [data, setData] = useState(null);
  var [loading, setLoading] = useState(true);
  var [checking, setChecking] = useState(false);

  // Forms
  var [showRegister, setShowRegister] = useState(false);
  var [showChangeDomain, setShowChangeDomain] = useState(false);
  var [showEditSub, setShowEditSub] = useState(false);
  var [newDomain, setNewDomain] = useState('');
  var [newSub, setNewSub] = useState('');
  var [subError, setSubError] = useState('');
  var [isRootDomain, setIsRootDomain] = useState(false);
  var [contactEmail, setContactEmail] = useState('');
  var [registering, setRegistering] = useState(false);
  var [savingSub, setSavingSub] = useState(false);
  var [deploymentKey, setDeploymentKey] = useState(null);
  // CORS (read-only, managed in Settings > Network)
  var [corsOrigins, setCorsOrigins] = useState([]);

  function reload() {
    apiCall('/domain/cors').then(function(r) { setCorsOrigins(r.origins || []); }).catch(function() {});
    return apiCall('/domain/status').then(function(r) {
      setData(r);
    }).catch(function() {
      var s = window.__EM_DOMAIN_STATE__;
      if (s) setData({ domain: s.domain, status: s.status, verifiedAt: s.verifiedAt, dnsChallenge: s.dnsChallenge, subdomain: null });
    }).finally(function() { setLoading(false); });
  }

  useEffect(function() { reload(); }, []);

  // The ACTUAL deployment URL is always window.location.host — that's where they're accessing from
  var actualHost = window.location.host;
  var actualUrl = window.location.origin;

  // ─── DNS Verify ─────────────────────────────────────
  var checkVerification = useCallback(function() {
    if (!data || !data.domain) return;
    setChecking(true);
    apiCall('/domain/verify', { method: 'POST', body: JSON.stringify({ domain: data.domain }) })
      .then(function(r) {
        if (r.verified) {
          setData(function(d) { return Object.assign({}, d, { status: 'verified', verifiedAt: new Date().toISOString() }); });
          toast('Domain verified!', 'success');
        } else {
          toast('DNS record not detected yet. Changes can take up to 48 hours.', 'warning');
        }
      })
      .catch(function() { toast('Could not check verification status', 'error'); })
      .finally(function() { setChecking(false); });
  }, [data, toast]);

  // ─── Register / Change Domain ───────────────────────
  var registerDomain = useCallback(function() {
    var d = newDomain.trim().toLowerCase();
    if (!d || !d.includes('.')) { toast('Enter a valid domain', 'error'); return; }
    if (d.startsWith('http')) { toast('Enter just the domain, not a URL', 'error'); return; }

    function doRegister() {
      setRegistering(true);
      var endpoint = data && data.domain ? '/domain/change' : '/domain/register';
      apiCall(endpoint, {
        method: 'POST',
        body: JSON.stringify({ domain: d, contactEmail: contactEmail || undefined, useRootDomain: isRootDomain }),
      })
        .then(function(r) {
          if (r.error) { toast(r.error, 'error'); return; }
          setDeploymentKey(r.deploymentKey);
          setShowRegister(false);
          setShowChangeDomain(false);
          setNewDomain('');
          setContactEmail('');
          setIsRootDomain(false);
          reload();
          toast('Domain registered! Add the DNS records below to verify ownership.', 'success');
        })
        .catch(function(err) { toast(err.message || 'Registration failed', 'error'); })
        .finally(function() { setRegistering(false); });
    }

    if (data && data.domain && data.status === 'verified') {
      showConfirm({title: 'Change Domain', message: 'You are changing your verified domain from "' + data.domain + '" to "' + d + '". You will need to re-verify DNS. Continue?'}).then(function(ok) { if (ok) doRegister(); });
    } else {
      doRegister();
    }
  }, [newDomain, contactEmail, isRootDomain, data, toast]);

  // ─── Save Subdomain ─────────────────────────────────
  var saveSubdomain = useCallback(function() {
    var s = newSub.trim().toLowerCase().replace(/\.agenticmail\.io$/, '');
    setSubError('');
    if (!s || s.length < 2) { setSubError('Subdomain must be at least 2 characters.'); return; }
    if (s.length > 63) { setSubError('Subdomain must be 63 characters or fewer.'); return; }
    if (/^-|-$/.test(s)) { setSubError('Cannot start or end with a hyphen.'); return; }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(s)) { setSubError('Only lowercase letters, numbers, and hyphens.'); return; }

    var oldSub = data && data.subdomain;
    var isActive = oldSub && actualHost === oldSub + '.agenticmail.io';

    function doSave() {
      setSavingSub(true);
      apiCall('/domain/subdomain', { method: 'POST', body: JSON.stringify({ subdomain: s }) })
        .then(function(r) {
          if (r.error) { setSubError(r.error); return; }
          setData(function(d) { return Object.assign({}, d, { subdomain: s }); });
          setShowEditSub(false);
          setSubError('');

          // Reload CORS to show updated list
          apiCall('/domain/cors').then(function(r) { setCorsOrigins(r.origins || []); }).catch(function() {});
          if (isActive) {
            toast('Subdomain updated to ' + s + '.agenticmail.io — CORS has been auto-updated. Update your DNS and access the dashboard from the new URL.', 'warning');
          } else {
            toast('Subdomain updated to ' + s + '.agenticmail.io — CORS has been auto-updated.', 'success');
          }
        })
        .catch(function(err) { setSubError(err.message || 'Failed to update subdomain'); })
        .finally(function() { setSavingSub(false); });
    }

    if (isActive) {
      showConfirm({title: 'Change Active Subdomain', message: 'You are currently accessing this dashboard from "' + oldSub + '.agenticmail.io". Changing the subdomain will NOT automatically redirect traffic to the new URL.\n\nYou will need to:\n1. Update DNS records to point "' + s + '.agenticmail.io" to your server\n2. Update any bookmarks, integrations, or agent configs that reference the old URL\n3. Access the dashboard from the new URL after DNS propagates\n\nThe old URL will stop working once DNS is updated. Continue?'}).then(function(ok) { if (ok) doSave(); });
    } else {
      doSave();
    }
  }, [newSub, data, actualHost, toast]);

  // ─── Remove Domain ─────────────────────────────────
  var removeDomain = useCallback(function() {
    showConfirm({title: 'Remove Custom Domain', message: 'This will remove "' + data.domain + '" from your deployment. Your domain registration and DNS verification will be cleared. Continue?'}).then(function(ok) {
      if (!ok) return;
      apiCall('/domain', { method: 'DELETE' })
        .then(function() {
          setDeploymentKey(null);
          setShowChangeDomain(false);
          reload();
          toast('Custom domain removed', 'success');
        })
        .catch(function() { toast('Failed to remove domain', 'error'); });
    });
  }, [data, toast]);

  if (loading) {
    return h(Fragment, null,
      h('div', { style: { marginBottom: 20 } },
        h('h1', { style: { fontSize: 20, fontWeight: 700 } }, 'Domain & Deployment'),
        h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Loading...')
      )
    );
  }

  var isLocalhost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(actualHost);
  var hasDomain = data && data.domain;
  var isDomainVerified = hasDomain && data.status === 'verified';
  var isDomainPending = hasDomain && data.status === 'pending_dns';
  var sub = data && data.subdomain;

  // ─── Styles ──────────────────────────────────
  var _h4 = { marginTop: 16, marginBottom: 8, fontSize: 14 };
  var _ul = { paddingLeft: 20, margin: '4px 0 8px' };
  var _tip = { marginTop: 12, padding: 12, background: 'var(--bg-secondary, #1e293b)', borderRadius: 'var(--radius, 8px)', fontSize: 13 };
  var card = { padding: 24, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', marginBottom: 16 };
  var labelSt = { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 };
  var rowSt = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' };

  return h(Fragment, null,
    // ─── Page Header ──────────────────────────────
    h('div', { style: { marginBottom: 24 } },
      h('h1', { style: { fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center' } }, 'Domain & Deployment', h(KnowledgeLink, { page: 'domain-status' }), h(HelpButton, { label: 'Domain & Deployment' },
        h('p', null, 'Configure how your AgenticMail Enterprise instance is accessed on the internet. Set up subdomains, custom domains, CORS policies, and deployment tunnels.'),
        h('h4', { style: _h4 }, 'Sections'),
        h('ul', { style: _ul },
          h('li', null, h('strong', null, 'Current Deployment'), ' — The URL where your dashboard is running right now.'),
          h('li', null, h('strong', null, 'Subdomain'), ' — Your free agenticmail.io subdomain.'),
          h('li', null, h('strong', null, 'Custom Domain'), ' — Use your own domain with DNS verification.'),
          h('li', null, h('strong', null, 'CORS'), ' — Control which origins can make API requests.'),
          h('li', null, h('strong', null, 'Migration'), ' — Move your deployment to another machine.')
        ),
        h('div', { style: _tip }, h('strong', null, 'Tip: '), 'If running locally, use the "Deploy to Production" section to expose your instance via a Cloudflare Tunnel.')
      )),
      h('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Manage the domain and URL for your AgenticMail Enterprise deployment')
    ),

    // ═══════════════════════════════════════════════
    // CLOUDFLARE TUNNEL MANAGEMENT
    // ═══════════════════════════════════════════════
    h(DeployToProduction, { toast: toast, isLocalhost: isLocalhost }),

    // ═══════════════════════════════════════════════
    // SECTION 1: Current Deployment
    // ═══════════════════════════════════════════════
    h('div', { style: card },
      h('div', { style: Object.assign({}, labelSt, { display: 'flex', alignItems: 'center' }) }, 'Current Deployment', h(HelpButton, { label: 'Current Deployment' },
        h('p', null, 'This shows the URL you\'re currently accessing the dashboard from. This is where your team and agents connect.'),
        h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Share this URL with your team. If it shows localhost, you\'ll need to set up a tunnel or deploy to a server for external access.')
      )),
      h('div', { style: { padding: '14px 16px', background: 'var(--bg-primary)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border)', marginBottom: 12 } },
        h('span', { style: { fontSize: 15, fontFamily: 'var(--font-mono, monospace)', color: 'var(--accent)', wordBreak: 'break-all' } }, actualUrl),
        h('button', { className: 'btn btn-sm', onClick: function() { navigator.clipboard.writeText(actualUrl); toast('Copied!', 'success'); } }, 'Copy')
      ),
      h('p', { style: { fontSize: 12, color: 'var(--text-muted)', margin: 0 } },
        'This is where your dashboard is currently running. Share this URL with your team.'
      )
    ),

    // ═══════════════════════════════════════════════
    // SECTION 2: AgenticMail Subdomain
    // ═══════════════════════════════════════════════
    h('div', { style: card },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
        h('div', { style: Object.assign({}, labelSt, { display: 'flex', alignItems: 'center' }) }, 'AgenticMail Subdomain', h(HelpButton, { label: 'AgenticMail Subdomain' },
          h('p', null, 'A free subdomain on agenticmail.io (e.g., yourcompany.agenticmail.io). This gives you a public URL without needing your own domain.'),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Changing the subdomain requires updating DNS records and any bookmarks or integrations that reference the old URL.')
        )),
        !showEditSub && sub && h('button', { className: 'btn btn-sm', onClick: function() { setShowEditSub(true); setNewSub(sub || ''); setSubError(''); } }, 'Change')
      ),

      // View mode
      !showEditSub && h(Fragment, null,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 } },
          h('span', { style: { fontSize: 15, fontWeight: 500 } }, sub ? sub + '.agenticmail.io' : h('span', { style: { color: 'var(--text-muted)', fontStyle: 'italic' } }, 'Not configured')),
          sub && actualHost === sub + '.agenticmail.io' && h('span', { style: { fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--success-soft)', color: 'var(--success)', fontWeight: 600 } }, 'ACTIVE')
        ),
        h('p', { style: { fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 } },
          'Your default AgenticMail-hosted URL. Changing this requires DNS updates on your hosting side.'
        )
      ),

      // Edit mode
      showEditSub && h(Fragment, null,
        // Warning if currently active
        sub && actualHost === sub + '.agenticmail.io' && h('div', { style: { padding: '10px 14px', background: 'rgba(153,27,27,0.08)', border: '1px solid rgba(153,27,27,0.2)', borderRadius: 'var(--radius)', marginBottom: 14, fontSize: 12, lineHeight: 1.6, color: 'var(--warning)' } },
          h('strong', null, 'Warning:'), ' You are currently accessing this dashboard from ', h('strong', null, sub + '.agenticmail.io'),
          '. Changing the subdomain will update the database but will NOT automatically redirect traffic. You will need to update your DNS records and access the dashboard from the new URL.'
        ),

        h('div', { style: { marginBottom: 12 } },
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 } }, 'New Subdomain'),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
            h('input', {
              className: 'input', value: newSub, style: { flex: 1, maxWidth: 280 },
              onInput: function(e) { setNewSub(e.target.value.toLowerCase()); setSubError(''); },
              onKeyDown: function(e) { if (e.key === 'Enter') saveSubdomain(); },
              placeholder: 'your-company',
            }),
            h('span', { style: { color: 'var(--text-muted)', fontSize: 14, whiteSpace: 'nowrap' } }, '.agenticmail.io')
          ),
          // Preview
          newSub.trim() && newSub.trim() !== sub && h('div', { style: { marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' } },
            'New URL: ', h('strong', null, 'https://' + newSub.trim().toLowerCase() + '.agenticmail.io')
          ),
          // Validation error
          subError && h('div', { style: { marginTop: 6, fontSize: 12, color: 'var(--danger)' } }, subError)
        ),

        // What you need to do after
        h('div', { style: { padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 14, fontSize: 12, lineHeight: 1.6, color: 'var(--text-muted)' } },
          h('strong', { style: { color: 'var(--text-secondary)' } }, 'After changing:'), h('br'),
          '1. Update your DNS — point ', h('strong', null, (newSub.trim() || 'new-sub') + '.agenticmail.io'), ' to your server', h('br'),
          '2. Update your reverse proxy / load balancer (if self-hosted)', h('br'),
          '3. Update any bookmarks, agent configs, or integrations referencing the old URL', h('br'),
          '4. Access the dashboard from the new URL once DNS propagates'
        ),

        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', {
            className: 'btn btn-primary btn-sm',
            onClick: saveSubdomain,
            disabled: savingSub || !newSub.trim() || newSub.trim().toLowerCase() === sub,
          }, savingSub ? 'Saving...' : 'Change Subdomain'),
          h('button', { className: 'btn btn-sm', onClick: function() { setShowEditSub(false); setSubError(''); } }, 'Cancel')
        )
      )
    ),

    // ═══════════════════════════════════════════════
    // SECTION 3: Custom Domain
    // ═══════════════════════════════════════════════
    h('div', { style: card },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 } },
        h('div', null,
          h('div', { style: Object.assign({}, labelSt, { display: 'flex', alignItems: 'center' }) }, 'Custom Domain', h(HelpButton, { label: 'Custom Domain' },
            h('p', null, 'Use your own domain (e.g., agents.yourcompany.com) for a professional, branded deployment. Requires DNS verification to prove ownership.'),
            h('h4', { style: _h4 }, 'Setup Process'),
            h('ul', { style: _ul },
              h('li', null, h('strong', null, 'Register'), ' — Enter your domain and get DNS challenge records.'),
              h('li', null, h('strong', null, 'Add DNS records'), ' — Add TXT (verification) and CNAME/A (routing) records at your DNS provider.'),
              h('li', null, h('strong', null, 'Verify'), ' — Click "Verify DNS Now" once records propagate (up to 48 hours).')
            ),
            h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Use a subdomain like agents.yourcompany.com instead of the root domain — it\'s easier to set up and doesn\'t affect your main website.')
          )),
          h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: -6 } }, 'Deploy on your own domain — either a subdomain (agents.yourcompany.com) or root domain (yourcompany.com)')
        )
      ),

      // === Verified domain ===
      isDomainVerified && !showChangeDomain && h(Fragment, null,
        h('div', { style: { marginBottom: 16 } },
          h('div', { style: rowSt },
            h('span', { style: { color: 'var(--text-secondary)', fontSize: 13 } }, 'Domain'),
            h('span', { style: { fontSize: 14, fontWeight: 500 } }, data.domain)
          ),
          h('div', { style: rowSt },
            h('span', { style: { color: 'var(--text-secondary)', fontSize: 13 } }, 'Type'),
            h('span', { style: { fontSize: 13 } }, data.useRootDomain ? 'Root domain (apex)' : 'Subdomain')
          ),
          h('div', { style: rowSt },
            h('span', { style: { color: 'var(--text-secondary)', fontSize: 13 } }, 'Status'),
            h('span', { style: { color: 'var(--success)', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 } },
              h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' } }),
              'Verified'
            )
          ),
          data.verifiedAt && h('div', { style: Object.assign({}, rowSt, { borderBottom: 'none' }) },
            h('span', { style: { color: 'var(--text-secondary)', fontSize: 13 } }, 'Verified On'),
            h('span', { style: { fontSize: 13 } }, new Date(data.verifiedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))
          )
        ),
        // ACTIVE badge if custom domain matches actual host
        actualHost === data.domain && h('div', { style: { marginBottom: 12, padding: '8px 12px', background: 'rgba(34,197,94,0.08)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--success)' } },
          'This domain is currently serving your deployment.'
        ),
        h('div', { style: { marginBottom: 12, padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 } },
          'Domain is locked to your deployment. The system operates fully offline after verification — no outbound calls are made.'
        ),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { className: 'btn btn-sm', onClick: function() { setShowChangeDomain(true); setNewDomain(''); } }, 'Change Domain'),
          h('button', { className: 'btn btn-sm', style: { color: 'var(--danger)' }, onClick: removeDomain }, 'Remove')
        )
      ),

      // === Pending DNS ===
      isDomainPending && !showChangeDomain && h(Fragment, null,
        h('div', { style: { marginBottom: 16 } },
          h('div', { style: rowSt },
            h('span', { style: { color: 'var(--text-secondary)', fontSize: 13 } }, 'Domain'),
            h('span', { style: { fontSize: 14, fontWeight: 500 } }, data.domain)
          ),
          h('div', { style: Object.assign({}, rowSt, { borderBottom: 'none' }) },
            h('span', { style: { color: 'var(--text-secondary)', fontSize: 13 } }, 'Status'),
            h('span', { style: { color: 'var(--warning)', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 } },
              h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)', display: 'inline-block' } }),
              'Pending DNS Verification'
            )
          )
        ),

        // DNS instructions
        h('div', { style: { padding: 16, background: 'var(--bg-primary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 16 } },
          h('div', { style: { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 } }, 'Step 1: Ownership Verification (TXT Record)'),
          dnsField('Type', 'TXT'),
          dnsField('Host / Name', '_agenticmail-verify.' + data.domain),
          data.dnsChallenge ? dnsField('Value', data.dnsChallenge, true) : dnsField('Value', '(check your CLI setup output)', false),

          h('div', { style: { marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' } },
            h('div', { style: { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 } }, 'Step 2: Route Traffic (' + (data.useRootDomain ? 'A Record' : 'CNAME') + ')'),
            data.useRootDomain
              ? h(Fragment, null,
                  dnsField('Type', 'A'),
                  dnsField('Host / Name', data.domain + ' (or @)'),
                  dnsField('Value', 'Your server IP address', false),
                  h('p', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 8, marginBottom: 0, lineHeight: 1.5 } },
                    'Root/apex domains typically require an A record. Some DNS providers (Cloudflare, Route 53) support CNAME flattening at the apex.'
                  )
                )
              : h(Fragment, null,
                  dnsField('Type', 'CNAME'),
                  dnsField('Host / Name', data.domain),
                  dnsField('Value', sub ? sub + '.agenticmail.io' : 'Your server hostname', false)
                )
          )
        ),

        h('div', { style: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' } },
          h('button', { className: 'btn btn-primary', onClick: checkVerification, disabled: checking },
            checking ? 'Checking...' : 'Verify DNS Now'
          ),
          h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'DNS changes can take up to 48 hours to propagate'),
          h('div', { style: { width: '100%' } }),
          h('button', { className: 'btn btn-sm', style: { marginTop: 4 }, onClick: function() { setShowChangeDomain(true); setNewDomain(''); } }, 'Change Domain'),
          h('button', { className: 'btn btn-sm', style: { marginTop: 4, color: 'var(--danger)' }, onClick: removeDomain }, 'Remove')
        )
      ),

      // === No domain — show add button ===
      !hasDomain && !showRegister && h('div', null,
        h('p', { style: { color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5, marginBottom: 16 } },
          'No custom domain configured. Add one to serve your deployment from your own branded URL.'
        ),
        h('button', { className: 'btn btn-primary', onClick: function() { setShowRegister(true); setIsRootDomain(false); } }, 'Add Custom Domain')
      ),

      // === Register / Change form ===
      (showRegister || showChangeDomain) && renderDomainForm()
    ),

    // ═══════════════════════════════════════════════
    // Deployment Key (shown after registration)
    // ═══════════════════════════════════════════════
    deploymentKey && h('div', { style: Object.assign({}, card, { border: '2px solid var(--warning)' }) },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 } },
        E.key(20),
        h('span', { style: { fontWeight: 700, color: 'var(--warning)', fontSize: 14 } }, 'SAVE YOUR DEPLOYMENT KEY')
      ),
      h('p', { style: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 } },
        'This key is shown ONCE. Save it securely — you need it to recover your domain if you redeploy or migrate servers.'
      ),
      h('div', { style: { padding: 12, background: 'var(--bg-primary)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)' } },
        h('code', { style: { fontSize: 11, wordBreak: 'break-all', flex: 1 } }, deploymentKey),
        h('button', { className: 'btn btn-sm', onClick: function() { navigator.clipboard.writeText(deploymentKey); toast('Key copied!', 'success'); } }, 'Copy')
      ),
      h('div', { style: { marginTop: 10, fontSize: 12, color: 'var(--text-muted)' } },
        'Recovery: ', h('code', { style: { fontSize: 11 } }, 'npx @agenticmail/enterprise recover --domain ' + (data && data.domain || 'your.domain.com'))
      )
    ),

    // ═══════════════════════════════════════════════
    // SECTION: CORS (read-only summary, links to Settings)
    // ═══════════════════════════════════════════════
    h('div', { style: card },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
        h('div', { style: Object.assign({}, labelSt, { display: 'flex', alignItems: 'center' }) }, 'Allowed Origins (CORS)', h(HelpButton, { label: 'Allowed Origins (CORS)' },
          h('p', null, 'CORS (Cross-Origin Resource Sharing) controls which websites can make API requests to your AgenticMail server. This is a security measure to prevent unauthorized access.'),
          h('h4', { style: _h4 }, 'What This Means'),
          h('ul', { style: _ul },
            h('li', null, h('strong', null, 'No origins listed'), ' — Any website can make API requests (open access). Fine for development, risky for production.'),
            h('li', null, h('strong', null, 'Origins listed'), ' — Only those specific domains can make API requests.')
          ),
          h('div', { style: _tip }, h('strong', null, 'Tip: '), 'CORS is auto-updated when you change your subdomain or custom domain. For manual control, go to Settings → Network & Firewall.')
        )),
        h('a', { href: '/dashboard/settings#network', style: { fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 } }, 'Manage in Settings \u2192')
      ),
      corsOrigins.length === 0
        ? h('div', { style: { padding: '10px 14px', background: 'rgba(153,27,27,0.08)', border: '1px solid rgba(153,27,27,0.2)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--warning)', lineHeight: 1.5 } },
            h('strong', null, 'Open access:'), ' No CORS restrictions configured. Any domain can make API requests. ',
            h('a', { href: '/dashboard/settings#network', style: { color: 'var(--warning)', fontWeight: 600 } }, 'Configure in Settings \u2192 Network & Firewall')
          )
        : h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
            corsOrigins.map(function(o) {
              return h('span', { key: o, style: { padding: '4px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 12, fontFamily: 'var(--font-mono, monospace)' } }, o);
            })
          ),
      h('p', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0, lineHeight: 1.5 } },
        'CORS is auto-updated when you change your subdomain or custom domain. To manually edit, go to Settings \u2192 Network & Firewall.'
      )
    ),

    // ═══════════════════════════════════════════════
    // SECTION: Migrate to Another Machine
    // ═══════════════════════════════════════════════
    h('div', { style: Object.assign({}, card, { border: '1px solid rgba(59,130,246,0.25)', background: 'linear-gradient(135deg, rgba(59,130,246,0.04), rgba(99,102,241,0.04))' }) },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 } },
        E.package(20),
        h('div', null,
          h('div', { style: { fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center' } }, 'Migrate to Another Machine', h(HelpButton, { label: 'Migration' },
            h('p', null, 'Move your entire AgenticMail deployment to a different server or computer. You need the .env file (configuration and encryption keys) and optionally the ~/.agenticmail/branding/ folder (company logo, favicon, login background).'),
            h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Always back up your .env file securely. Without the VAULT_KEY, encrypted credentials cannot be recovered.')
          )),
          h('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Move your entire deployment to a new server or computer')
        )
      ),
      h('p', { style: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 } },
        'All your configuration is stored in ', h('code', { style: { fontSize: 11, color: 'var(--accent)' } }, '~/.agenticmail/.env'),
        '. To run on a different machine, copy this file and you\'re done.'
      ),
      h('div', { style: { marginBottom: 16 } },
        h('div', { style: { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 } }, 'Steps to migrate'),
        h('ol', { style: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 2, paddingLeft: 20, marginBottom: 0 } },
          h('li', null, 'On your current machine, copy ', h('code', { style: { fontSize: 11, color: 'var(--accent)' } }, '~/.agenticmail/.env'), ' — this has your DATABASE_URL, JWT_SECRET, and VAULT_KEY'),
          h('li', null, 'On the new machine, create the directory: ', h('code', { style: { fontSize: 11, color: 'var(--accent)' } }, 'mkdir -p ~/.agenticmail')),
          h('li', null, 'Save the .env file there: ', h('code', { style: { fontSize: 11, color: 'var(--accent)' } }, '~/.agenticmail/.env')),
          h('li', null, 'Start the server: ', h('code', { style: { fontSize: 11, color: 'var(--accent)' } }, 'npx @agenticmail/enterprise@latest start')),
          h('li', null, 'If using Cloudflare Tunnel: run ', h('code', { style: { fontSize: 11, color: 'var(--accent)' } }, 'cloudflared tunnel login'), ' on the new machine (same CF account), then redeploy the tunnel from the dashboard'),
          h('li', null, 'If you have company branding (logo, favicon, login background): copy the ', h('code', { style: { fontSize: 11, color: 'var(--accent)' } }, '~/.agenticmail/branding/'), ' folder to the new machine')
        )
      ),
      h('div', { style: { padding: '12px 16px', background: 'var(--bg-primary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 } },
        h('strong', { style: { color: 'var(--text-secondary)' } }, 'What\'s in .env:'), h('br'),
        '\u2022 ', h('strong', null, 'DATABASE_URL'), ' — your database connection (all data lives here)', h('br'),
        '\u2022 ', h('strong', null, 'JWT_SECRET'), ' — keeps login sessions valid across restarts', h('br'),
        '\u2022 ', h('strong', null, 'AGENTICMAIL_VAULT_KEY'), ' — decrypts stored credentials (email passwords, API keys)', h('br'),
        '\u2022 ', h('strong', null, 'PORT'), ' — the port your server runs on', h('br'),
        '\u2022 ', h('strong', null, 'TRANSPORT_ENCRYPTION_KEY'), ' — custom key for API transport encryption (optional, falls back to ENCRYPTION_KEY or JWT_SECRET)', h('br'),
        '\u2022 ', h('strong', null, 'ENCRYPTION_KEY'), ' — general-purpose encryption key (optional)', h('br'),
        h('br'),
        h('strong', { style: { color: 'var(--text-secondary)' } }, 'Branding assets:'), h('br'),
        'Company branding files (logo, favicon, login background) are stored on disk at ', h('code', { style: { fontSize: 11, color: 'var(--accent)' } }, '~/.agenticmail/branding/'),
        '. These are ', h('strong', null, 'not'), ' in the database — copy this folder to keep your branding on the new machine. If you skip this, you can re-upload them from Settings after migration.',
        h('br'), h('br'),
        h('strong', { style: { color: 'var(--warning)' } }, 'Important:'), ' Without the same VAULT_KEY, encrypted credentials (agent email passwords, API keys) cannot be decrypted. You would need to re-enter them in the dashboard.'
      ),
      h('div', { style: { marginTop: 12 } },
        h('button', {
          className: 'btn btn-sm',
          onClick: function() {
            var text = 'To migrate AgenticMail to a new machine:\\n\\n1. mkdir -p ~/.agenticmail\\n2. Copy this file to ~/.agenticmail/.env on the new machine\\n3. Copy ~/.agenticmail/branding/ folder (if you have company branding)\\n4. npx @agenticmail/enterprise@latest start\\n5. If using CF Tunnel: cloudflared tunnel login + redeploy from dashboard';
            navigator.clipboard.writeText(text);
            toast('Migration instructions copied!', 'success');
          }
        }, 'Copy Instructions')
      )
    ),

    // ═══════════════════════════════════════════════
    // CLI Reference
    // ═══════════════════════════════════════════════
    h('div', { style: card },
      h('div', { style: Object.assign({}, labelSt, { display: 'flex', alignItems: 'center' }) }, 'CLI Commands', h(HelpButton, { label: 'CLI Commands' },
        h('p', null, 'Common command-line commands for managing your AgenticMail Enterprise installation. Run these in your terminal on the server where AgenticMail is installed.'),
        h('div', { style: _tip }, h('strong', null, 'Tip: '), 'Use "npx @agenticmail/enterprise@latest" to always run the latest version without manually updating.')
      )),
      h('div', { style: { display: 'grid', gap: 8 } },
        cliRow('Initial setup', 'npx @agenticmail/enterprise setup'),
        cliRow('Start server', 'npx @agenticmail/enterprise start'),
        cliRow('Verify DNS ownership', 'npx @agenticmail/enterprise verify-domain'),
        cliRow('Recover on new server', 'npx @agenticmail/enterprise recover --domain your.domain.com')
      )
    )
  );

  // ─── Domain Registration Form (inline) ────────
  function renderDomainForm() {
    return h('div', { style: { marginTop: showChangeDomain ? 0 : 0 } },
      showChangeDomain && h('p', { style: { color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5, marginBottom: 16 } },
        'Enter a new domain to replace ', h('strong', null, data.domain), '. A new DNS challenge will be issued and you will need to re-verify.'
      ),

      // Domain type selector
      h('div', { style: { display: 'flex', gap: 10, marginBottom: 16 } },
        domainTypeBtn('Subdomain', 'e.g. agents.yourcompany.com', !isRootDomain, function() { setIsRootDomain(false); }),
        domainTypeBtn('Root Domain', 'e.g. yourcompany.com', isRootDomain, function() { setIsRootDomain(true); })
      ),

      isRootDomain && h('div', { style: { padding: 10, background: 'rgba(59,130,246,0.08)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--accent)', marginBottom: 12, lineHeight: 1.5 } },
        'Root domain deployment means the entire domain is dedicated to AgenticMail. You will need an A record pointing to your server IP (CNAME is not supported at most DNS providers for apex domains).'
      ),

      h('div', { style: { display: 'grid', gap: 12 } },
        h('div', null,
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Domain'),
          h('input', {
            className: 'input', value: newDomain,
            onInput: function(e) { setNewDomain(e.target.value); },
            placeholder: isRootDomain ? 'yourcompany.com' : 'agents.yourcompany.com',
            onKeyDown: function(e) { if (e.key === 'Enter') registerDomain(); }
          })
        ),
        h('div', null,
          h('label', { style: { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } }, 'Contact Email ', h('span', { style: { fontWeight: 400, color: 'var(--text-muted)' } }, '(optional)')),
          h('input', { className: 'input', value: contactEmail, onInput: function(e) { setContactEmail(e.target.value); }, placeholder: 'admin@yourcompany.com' })
        ),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { className: 'btn btn-primary', onClick: registerDomain, disabled: registering || !newDomain.trim() },
            registering ? 'Registering...' : (showChangeDomain ? 'Change Domain' : 'Register Domain')
          ),
          h('button', { className: 'btn', onClick: function() { setShowRegister(false); setShowChangeDomain(false); } }, 'Cancel')
        )
      )
    );
  }
}

// ─── Helpers ─────────────────────────────────────

function domainTypeBtn(label, hint, active, onClick) {
  return h('div', {
    onClick: onClick,
    style: {
      flex: 1, padding: '12px 16px', borderRadius: 'var(--radius)',
      border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
      background: active ? 'var(--accent-soft)' : 'var(--bg-primary)',
      cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center'
    }
  },
    h('div', { style: { fontWeight: 600, fontSize: 13, marginBottom: 2 } }, label),
    h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, hint)
  );
}

function dnsField(label, value, copyable) {
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 } },
    h('span', { style: { fontWeight: 600, fontSize: 12, minWidth: 90, color: 'var(--text-muted)' } }, label),
    h('code', { style: { fontSize: 12, wordBreak: 'break-all', color: 'var(--accent)', flex: 1 } }, value),
    copyable !== false && value && !String(value).startsWith('(') && h('button', {
      className: 'btn btn-sm',
      style: { fontSize: 10, padding: '2px 8px', flexShrink: 0 },
      onClick: function() { navigator.clipboard.writeText(value); }
    }, 'Copy')
  );
}

function cliRow(label, cmd) {
  return h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' } },
    h('span', { style: { fontSize: 13, color: 'var(--text-secondary)' } }, label),
    h('code', { style: { fontSize: 12, color: 'var(--accent)' } }, cmd)
  );
}

// ─── Deploy to Production Component ─────────────────────

function DeployToProduction({ toast, isLocalhost }) {
  var [expanded, setExpanded] = useState(false);
  var [selectedMethod, setSelectedMethod] = useState(null);
  // Cloudflare Tunnel state
  var [tunnelStatus, setTunnelStatus] = useState(null);
  var [tunnelLoading, setTunnelLoading] = useState(false);
  var [tunnelDomain, setTunnelDomain] = useState('');
  var [tunnelPort, setTunnelPort] = useState('3200');
  var [deploying, setDeploying] = useState(false);
  var [deploySteps, setDeploySteps] = useState([]);
  var [deployError, setDeployError] = useState('');

  var loadTunnelStatus = function() {
    setTunnelLoading(true);
    apiCall('/tunnel/status').then(function(r) {
      setTunnelStatus(r);
      if (r.config && r.config.hostname) setTunnelDomain(r.config.hostname);
    }).catch(function() {}).finally(function() { setTunnelLoading(false); });
  };

  useEffect(function() {
    if (selectedMethod === 'cloudflare') loadTunnelStatus();
  }, [selectedMethod]);

  var card = { padding: 24, background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(99,102,241,0.25)', marginBottom: 20 };
  var methodCard = function(id, icon, title, subtitle, difficulty, recommended) {
    var isActive = selectedMethod === id;
    return h('div', {
      onClick: function() { setSelectedMethod(isActive ? null : id); },
      style: {
        padding: 16, borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all 0.15s',
        background: isActive ? 'rgba(99,102,241,0.12)' : 'var(--bg-secondary)',
        border: '1px solid ' + (isActive ? 'var(--accent)' : 'var(--border)'),
        position: 'relative',
      },
    },
      recommended && h('span', { style: { position: 'absolute', top: -8, right: 12, fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--accent)', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' } }, 'Recommended'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 } },
        h('span', { style: { fontSize: 20, display: 'inline-flex' } }, icon),
        h('span', { style: { fontWeight: 600, fontSize: 14 } }, title),
      ),
      h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.5 } }, subtitle),
      h('div', { style: { fontSize: 10, fontWeight: 600, color: difficulty === 'Easy' ? 'var(--success)' : difficulty === 'Medium' ? 'var(--warning)' : 'var(--text-muted)' } }, difficulty),
    );
  };

  var copyCmd = function(cmd) {
    navigator.clipboard.writeText(cmd);
    toast('Command copied!', 'success');
  };

  var cmdBlock = function(cmd, label) {
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#0d1117', borderRadius: 6, marginBottom: 6, fontFamily: 'var(--font-mono)', fontSize: 12, color: '#e6edf3', border: '1px solid rgba(255,255,255,0.08)' } },
      h('span', { style: { flex: 1, wordBreak: 'break-all' } }, cmd),
      h('button', { onClick: function() { copyCmd(cmd); }, style: { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: '2px 6px', borderRadius: 4, flexShrink: 0 }, title: 'Copy' }, 'Copy'),
    );
  };

  var stepItem = function(num, text) {
    return h('div', { style: { display: 'flex', gap: 10, marginBottom: 8, fontSize: 13, lineHeight: 1.6 } },
      h('span', { style: { width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 } }, num),
      h('div', null, text),
    );
  };

  return h('div', { style: card },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }, onClick: function() { setExpanded(!expanded); } },
      h('div', null,
        h('div', { style: { fontSize: 16, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 } },
          isLocalhost ? [E.rocket(16), ' Deploy to Production'] : [E.cloud(16), ' Tunnel & Deployment'],
          isLocalhost && h('span', { style: { fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(153,27,27,0.15)', color: 'var(--warning)', fontWeight: 600 } }, 'LOCALHOST'),
        ),
        h('div', { style: { fontSize: 13, color: 'var(--text-muted)' } }, isLocalhost ? 'You\'re running locally. Deploy to a domain so your agents can be reached from anywhere.' : 'Manage your Cloudflare Tunnel and deployment configuration.'),
      ),
      h('span', { style: { color: 'var(--text-muted)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-flex' } }, I.chevronDown()),
    ),

    expanded && h('div', { style: { marginTop: 20 } },
      // Method cards
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 20 } },
        methodCard('cloudflare', E.cloud(20), 'Cloudflare Tunnel', 'Keep running locally, expose via your domain or get one for free thru agenticmail.io. No server needed.', 'Easy', true),
        methodCard('vps', E.computer(20), 'VPS / Server', 'Deploy to any Linux server (DigitalOcean, Hetzner, AWS, etc.)', 'Easy'),
        methodCard('docker', E.package(20), 'Docker', 'Run as a Docker container on any host', 'Medium'),
        methodCard('railway', E.rocket(20), 'Railway', 'One-click deploy to Railway.app', 'Easy'),
        methodCard('fly', E.globe(20), 'Fly.io', 'Deploy to Fly.io edge network', 'Medium'),
      ),

      // ─── Cloudflare Tunnel ─────────────────────────
      selectedMethod === 'cloudflare' && h('div', { style: { padding: 20, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' } },
        h('h3', { style: { fontSize: 15, fontWeight: 700, marginBottom: 6 } }, 'Deploy via Cloudflare Tunnel'),
        h('p', { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 } },
          'Your app keeps running on this machine. Cloudflare Tunnel securely exposes it on your domain with automatic HTTPS. No port forwarding, no firewall changes.',
        ),

        // Status
        tunnelLoading && h('div', { style: { padding: 16, textAlign: 'center', color: 'var(--text-muted)' } }, 'Checking tunnel status...'),

        !tunnelLoading && tunnelStatus && h(Fragment, null,
          // Current status card
          h('div', { style: { padding: '12px 16px', background: 'var(--bg-primary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 } },
            h('div', { style: { width: 10, height: 10, borderRadius: '50%', background: tunnelStatus.running ? 'var(--success)' : 'var(--text-muted)' } }),
            h('div', { style: { flex: 1 } },
              h('div', { style: { fontSize: 13, fontWeight: 600 } },
                tunnelStatus.running ? 'Tunnel Running' : tunnelStatus.installed ? 'Cloudflared Installed (not running)' : 'Cloudflared Not Installed'
              ),
              tunnelStatus.version && h('div', { style: { fontSize: 11, color: 'var(--text-muted)' } }, tunnelStatus.version),
              tunnelStatus.config && tunnelStatus.config.hostname && h('div', { style: { fontSize: 12, color: 'var(--accent)', marginTop: 2 } }, tunnelStatus.config.hostname + ' \u2192 ' + (tunnelStatus.config.service || 'localhost')),
            ),
            tunnelStatus.running && h('button', {
              className: 'btn btn-sm',
              style: { color: 'var(--danger)' },
              onClick: function() {
                apiCall('/tunnel/stop', { method: 'POST' }).then(function() { toast('Tunnel stopped', 'success'); loadTunnelStatus(); }).catch(function(e) { toast(e.message, 'error'); });
              },
            }, 'Stop'),
          ),

          // Step 1: Install cloudflared (if needed)
          !tunnelStatus.installed && h('div', { style: { marginBottom: 16 } },
            stepItem('1', h(Fragment, null,
              h('strong', null, 'Install Cloudflared'),
              h('div', { style: { marginTop: 8 } },
                h('button', {
                  className: 'btn btn-primary btn-sm',
                  disabled: tunnelLoading,
                  onClick: function() {
                    setTunnelLoading(true);
                    apiCall('/tunnel/install', { method: 'POST' }).then(function(r) {
                      toast('Cloudflared installed: ' + r.version, 'success');
                      loadTunnelStatus();
                    }).catch(function(e) { toast('Install failed: ' + e.message, 'error'); setTunnelLoading(false); });
                  },
                }, 'Install Cloudflared'),
              ),
            )),
          ),

          // Step 2: Login to Cloudflare (if installed but no cert)
          tunnelStatus.installed && !tunnelStatus.config && h('div', { style: { marginBottom: 16 } },
            stepItem(tunnelStatus.installed ? '1' : '2', h(Fragment, null,
              h('strong', null, 'Login to Cloudflare'),
              h('p', { style: { fontSize: 12, color: 'var(--text-muted)', margin: '6px 0' } }, 'This opens your browser to authorize Cloudflare. Select the domain you want to use.'),
              h('button', {
                className: 'btn btn-primary btn-sm',
                onClick: function() {
                  setTunnelLoading(true);
                  toast('Opening Cloudflare login in your browser...', 'info');
                  apiCall('/tunnel/login', { method: 'POST' }).then(function() {
                    toast('Cloudflare authenticated!', 'success');
                    loadTunnelStatus();
                  }).catch(function(e) { toast('Login failed: ' + e.message, 'error'); setTunnelLoading(false); });
                },
              }, 'Login to Cloudflare'),
            )),
          ),

          // Step 3: Deploy (if authenticated)
          tunnelStatus.installed && h('div', { style: { marginTop: 8 } },
            h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 10 } }, tunnelStatus.running ? 'Update Deployment' : 'Deploy to Domain'),

            h('div', { style: { display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' } },
              h('div', { style: { flex: 1 } },
                h('label', { style: { fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-muted)' } }, 'Domain'),
                h('input', {
                  className: 'input',
                  value: tunnelDomain,
                  onInput: function(e) { setTunnelDomain(e.target.value); setDeployError(''); },
                  placeholder: 'app.yourdomain.com',
                  style: { width: '100%' },
                }),
              ),
              h('div', { style: { width: 100 } },
                h('label', { style: { fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-muted)' } }, 'Local Port'),
                h('input', {
                  className: 'input',
                  value: tunnelPort,
                  onInput: function(e) { setTunnelPort(e.target.value); },
                  placeholder: '3200',
                  style: { width: '100%' },
                }),
              ),
            ),

            deployError && h('div', { style: { fontSize: 12, color: 'var(--danger)', marginBottom: 10, padding: '8px 12px', background: 'var(--danger-soft)', borderRadius: 'var(--radius)' } }, deployError),

            // Deploy steps output
            deploySteps.length > 0 && h('div', { style: { marginBottom: 12, padding: '10px 14px', background: '#0d1117', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' } },
              deploySteps.map(function(s, i) {
                return h('div', { key: i, style: { fontSize: 12, fontFamily: 'var(--font-mono)', color: '#e6edf3', padding: '2px 0' } }, '\u2713 ' + s);
              }),
            ),

            h('button', {
              className: 'btn btn-primary',
              disabled: deploying || !tunnelDomain.trim(),
              onClick: function() {
                setDeploying(true);
                setDeploySteps([]);
                setDeployError('');
                apiCall('/tunnel/deploy', {
                  method: 'POST',
                  body: JSON.stringify({ domain: tunnelDomain.trim(), port: parseInt(tunnelPort) || 3200 }),
                }).then(function(r) {
                  if (r.error) { setDeployError(r.error); return; }
                  setDeploySteps(r.steps || []);
                  toast('Deployed! Your site is live at https://' + tunnelDomain.trim(), 'success');
                  loadTunnelStatus();
                }).catch(function(e) { setDeployError(e.message || 'Deployment failed'); })
                  .finally(function() { setDeploying(false); });
              },
            }, deploying ? 'Deploying...' : tunnelStatus.running ? 'Redeploy' : 'Deploy'),
          ),
        ),

        // Prerequisites note
        h('div', { style: { marginTop: 16, padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 } },
          h('strong', { style: { color: 'var(--text-secondary)' } }, 'Prerequisites:'),
          h('ul', { style: { margin: '6px 0 0', paddingLeft: 18 } },
            h('li', null, 'A Cloudflare account (free)'),
            h('li', null, 'A domain added to Cloudflare (nameservers pointed to CF)'),
            h('li', null, 'This machine must stay running for the tunnel to work'),
          ),
        ),
      ),

      // ─── VPS Instructions ─────────────────────────
      selectedMethod === 'vps' && h('div', { style: { padding: 20, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' } },
        h('h3', { style: { fontSize: 15, fontWeight: 700, marginBottom: 16 } }, 'Deploy to a VPS'),
        h('p', { style: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 } },
          'Works with any Linux server: DigitalOcean ($6/mo), Hetzner ($4/mo), Linode, AWS EC2, etc. Minimum: 1 CPU, 1GB RAM.',
        ),

        stepItem('1', h(Fragment, null, h('strong', null, 'Get a server'), ' — Any Ubuntu/Debian VPS. Point your domain\'s DNS to the server\'s IP address.')),

        stepItem('2', h(Fragment, null, h('strong', null, 'SSH in and install Node.js + PM2:'),
          cmdBlock('curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs'),
          cmdBlock('sudo npm install -g pm2'),
        )),

        stepItem('3', h(Fragment, null, h('strong', null, 'Install AgenticMail Enterprise:'),
          cmdBlock('sudo npm install -g @agenticmail/enterprise'),
        )),

        stepItem('4', h(Fragment, null, h('strong', null, 'Run the setup wizard:'),
          cmdBlock('agenticmail-enterprise setup'),
          h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'This will walk you through Google Workspace, database, and domain configuration.'),
        )),

        stepItem('5', h(Fragment, null, h('strong', null, 'Start with PM2 (auto-restart on crash):'),
          cmdBlock('pm2 start agenticmail-enterprise -- start'),
          cmdBlock('pm2 save && pm2 startup'),
        )),

        stepItem('6', h(Fragment, null, h('strong', null, 'Set up HTTPS with Caddy (automatic SSL):'),
          cmdBlock('sudo apt install -y caddy'),
          cmdBlock('echo "yourdomain.com { reverse_proxy localhost:3200 }" | sudo tee /etc/caddy/Caddyfile'),
          cmdBlock('sudo systemctl restart caddy'),
          h('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Replace yourdomain.com with your actual domain. Caddy handles SSL automatically.'),
        )),

        h('div', { style: { marginTop: 16, padding: '12px 16px', background: 'var(--success-soft)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--success)', lineHeight: 1.6 } },
          I.check(), ' Done! Your dashboard will be live at ', h('strong', null, 'https://yourdomain.com'), '. All your agents, settings, and data will be on your own server.'
        ),
      ),

      // ─── Docker Instructions ──────────────────────
      selectedMethod === 'docker' && h('div', { style: { padding: 20, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' } },
        h('h3', { style: { fontSize: 15, fontWeight: 700, marginBottom: 16 } }, 'Deploy with Docker'),

        stepItem('1', h(Fragment, null, h('strong', null, 'Create docker-compose.yml:'),
          cmdBlock('mkdir agenticmail && cd agenticmail'),
          h('div', { style: { padding: '10px 12px', background: '#0d1117', borderRadius: 6, marginBottom: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: '#e6edf3', whiteSpace: 'pre', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.08)' } },
            'version: "3.8"\nservices:\n  enterprise:\n    image: node:22\n    working_dir: /app\n    command: npx @agenticmail/enterprise start\n    ports:\n      - "3200:3200"\n    volumes:\n      - ./data:/app/data\n    restart: unless-stopped'
          ),
        )),

        stepItem('2', h(Fragment, null, h('strong', null, 'Start:'),
          cmdBlock('docker compose up -d'),
        )),

        stepItem('3', h(Fragment, null, h('strong', null, 'Add a reverse proxy (Caddy/Nginx) for HTTPS, same as VPS step 6.'))),
      ),

      // ─── Railway Instructions ─────────────────────
      selectedMethod === 'railway' && h('div', { style: { padding: 20, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' } },
        h('h3', { style: { fontSize: 15, fontWeight: 700, marginBottom: 16 } }, 'Deploy to Railway'),

        stepItem('1', h(Fragment, null,
          h('strong', null, 'Click to deploy:'),
          h('div', { style: { marginTop: 8 } },
            h('a', { href: 'https://railway.app/new', target: '_blank', style: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--accent)', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 600 } }, E.rocket(14), ' Open Railway'),
          ),
        )),
        stepItem('2', h(Fragment, null, h('strong', null, 'Create a new project'), ' and select "Deploy from GitHub" or "Empty Project".')),
        stepItem('3', h(Fragment, null, h('strong', null, 'Add a service'), ' with start command:',
          cmdBlock('npx @agenticmail/enterprise start'),
        )),
        stepItem('4', h(Fragment, null, h('strong', null, 'Set environment variables'), ' (DATABASE_URL, MASTER_KEY, etc.) in the Railway dashboard.')),
        stepItem('5', h(Fragment, null, h('strong', null, 'Generate a domain'), ' — Railway gives you a free URL, or add your custom domain.')),
      ),

      // ─── Fly.io Instructions ──────────────────────
      selectedMethod === 'fly' && h('div', { style: { padding: 20, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' } },
        h('h3', { style: { fontSize: 15, fontWeight: 700, marginBottom: 16 } }, 'Deploy to Fly.io'),

        stepItem('1', h(Fragment, null, h('strong', null, 'Install Fly CLI:'),
          cmdBlock('curl -L https://fly.io/install.sh | sh'),
          cmdBlock('fly auth login'),
        )),
        stepItem('2', h(Fragment, null, h('strong', null, 'Create fly.toml:'),
          h('div', { style: { padding: '10px 12px', background: '#0d1117', borderRadius: 6, marginBottom: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: '#e6edf3', whiteSpace: 'pre', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.08)' } },
            'app = "my-agenticmail"\n\n[build]\n  builder = "heroku/buildpacks:22"\n\n[env]\n  PORT = "3200"\n\n[[services]]\n  internal_port = 3200\n  protocol = "tcp"\n  [services.concurrency]\n    hard_limit = 250\n    soft_limit = 200\n  [[services.ports]]\n    port = 443\n    handlers = ["tls", "http"]'
          ),
        )),
        stepItem('3', h(Fragment, null, h('strong', null, 'Set secrets and deploy:'),
          cmdBlock('fly secrets set MASTER_KEY=your-key DATABASE_URL=your-db-url'),
          cmdBlock('fly deploy'),
        )),
        stepItem('4', h(Fragment, null, h('strong', null, 'Add custom domain:'),
          cmdBlock('fly certs create yourdomain.com'),
        )),
      ),

      // ─── Export / Migrate Data ────────────────────
      h('div', { style: { marginTop: 16, padding: '14px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' } },
        h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 6 } }, 'Migrating from Localhost?'),
        h('div', { style: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 } },
          'Your local data (SQLite) lives in ', h('code', { style: { fontSize: 11, color: 'var(--accent)' } }, './data/'),
          '. To migrate to a production Postgres database:',
        ),
        h('ol', { style: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8, paddingLeft: 20, marginTop: 8, marginBottom: 0 } },
          h('li', null, 'Set up a Postgres database (Neon, Supabase, Railway, or self-hosted)'),
          h('li', null, 'Set ', h('code', { style: { fontSize: 11, color: 'var(--accent)' } }, 'DATABASE_URL'), ' environment variable to your Postgres connection string'),
          h('li', null, 'Run ', h('code', { style: { fontSize: 11, color: 'var(--accent)' } }, 'agenticmail-enterprise setup'), ' — tables are auto-created on first run'),
          h('li', null, 'Re-configure your Google Workspace credentials in the setup wizard'),
        ),
      ),
    ),
  );
}
