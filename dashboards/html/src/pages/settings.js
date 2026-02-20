// Settings page — form + instance info

import { api } from '../api.js';
import { esc } from '../utils/escape.js';
import { toast } from '../utils/toast.js';
import { renderPageHeader } from '../components/layout.js';

export function loadSettings() {
  var el = document.getElementById('page-content');
  el.innerHTML = renderPageHeader('Settings', 'Loading...');
  Promise.all([
    api('/settings').catch(function() { return {}; }),
    api('/retention').catch(function() { return { enabled: false, retainDays: 365 }; }),
    api('/settings/tool-security').catch(function() { return {}; }),
    api('/settings/firewall').catch(function() { return {}; }),
    api('/settings/model-pricing').catch(function() { return {}; }),
  ])
    .then(function(results) {
      var s = results[0], r = results[1], tsRaw = results[2], fwRaw = results[3], mpRaw = results[4];
      var tsCfg = tsRaw.toolSecurityConfig || {};
      var sec = tsCfg.security || {};
      var mw = tsCfg.middleware || {};
      var ps = sec.pathSandbox || {};
      var ssrf = sec.ssrf || {};
      var cs = sec.commandSanitizer || {};
      var audit = mw.audit || {};
      var rl = mw.rateLimit || {};
      var cb = mw.circuitBreaker || {};
      var tel = mw.telemetry || {};
      var fw = fwRaw.firewallConfig || {};
      var ipAccess = fw.ipAccess || {};
      var egress = fw.egress || {};
      var proxy = fw.proxy || {};
      var trustedProxies = fw.trustedProxies || {};
      var network = fw.network || {};
      var netRl = network.rateLimit || {};
      var httpsEnf = network.httpsEnforcement || {};
      var secHeaders = network.securityHeaders || {};
      var mpCfg = mpRaw.modelPricingConfig || {};
      var mpModels = mpCfg.models || [];
      var mpProviders = {};
      mpModels.forEach(function(m) { if (!mpProviders[m.provider]) mpProviders[m.provider] = []; mpProviders[m.provider].push(m); });
      var providerLabels = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', deepseek: 'DeepSeek', xai: 'xAI (Grok)', mistral: 'Mistral', groq: 'Groq', together: 'Together', fireworks: 'Fireworks', moonshot: 'Moonshot (Kimi)', cerebras: 'Cerebras', openrouter: 'OpenRouter', ollama: 'Ollama (Local)', vllm: 'vLLM (Local)', lmstudio: 'LM Studio (Local)', litellm: 'LiteLLM (Local)', azure: 'Azure', aws: 'AWS Bedrock', custom: 'Custom' };

      el.innerHTML = renderPageHeader('Settings', 'Configure your organization') +
        '<div class="card"><div style="display:flex;align-items:center;gap:0"><div class="card-title">General</div>' +
        '<button class="settings-help-btn" onclick="toggleSettingsHelp(\'org\')" title="Learn more">?</button></div>' +
        '<div id="help-org" class="settings-help-panel">' +
          '<p>The General section configures your organization\u2019s identity and email delivery.</p>' +
          '<h4>Organization</h4>' +
          '<ul>' +
            '<li><strong>Company Name</strong> \u2014 Appears throughout the dashboard and in emails sent by agents.</li>' +
            '<li><strong>Domain</strong> \u2014 Your company\u2019s primary domain, used for agent email addresses.</li>' +
            '<li><strong>Subdomain</strong> \u2014 Your unique ID on the AgenticMail cloud (subdomain.agenticmail.io).</li>' +
            '<li><strong>Logo URL</strong> \u2014 Link to your company logo, shown in dashboard and emails.</li>' +
            '<li><strong>Primary Color</strong> \u2014 Customizes the dashboard accent color to match your brand.</li>' +
          '</ul>' +
          '<h4>SMTP Configuration</h4>' +
          '<p>Controls outgoing email delivery. Leave blank to use the default AgenticMail relay. Configure custom SMTP to send from your own mail infrastructure.</p>' +
        '</div>' +
        '<form id="settings-form" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">' +
        '<div class="form-group"><label class="form-label">Organization Name</label><input class="input" id="set-name" value="' + esc(s.name || '') + '"></div>' +
        '<div class="form-group"><label class="form-label">Domain</label><input class="input" id="set-domain" value="' + esc(s.domain || '') + '" placeholder="agents.agenticmail.io"></div>' +
        '<div class="form-group"><label class="form-label">Primary Color</label><input class="input" type="color" id="set-color" value="' + (s.primaryColor || '#e84393') + '" style="height:38px;padding:4px"></div>' +
        '<div class="form-group"><label class="form-label">Logo URL</label><input class="input" id="set-logo" value="' + esc(s.logoUrl || '') + '" placeholder="https://..."></div>' +
        '<div style="grid-column:span 2"><button class="btn btn-primary" type="submit" style="width:auto">Save Settings</button></div></form></div>' +
        '<div class="card"><div class="card-title">Plan</div>' +
        '<span class="badge badge-active" style="font-size:14px;padding:4px 12px">' + (s.plan || 'free').toUpperCase() + '</span> ' +
        '<span style="font-size:13px;color:var(--text-dim)">Subdomain: ' + esc(s.subdomain || 'not set') + '.agenticmail.io</span></div>' +
        '<div class="card"><div class="card-title">Data Retention</div><div style="font-size:13px">' +
        'Status: <span style="color:' + (r.enabled ? 'var(--success)' : 'var(--text-muted)') + '">' + (r.enabled ? 'Enabled' : 'Disabled') + '</span><br>' +
        '<span style="color:var(--text-dim)">Retain emails for ' + r.retainDays + ' days' + (r.archiveFirst ? ' (archive before delete)' : '') + '</span></div></div>' +

        // Tool Security
        '<div class="card" style="margin-top:16px">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
            '<div><div style="display:flex;align-items:center;gap:0"><div class="card-title" style="margin-bottom:4px">Tool Security</div>' +
            '<button class="settings-help-btn" onclick="toggleSettingsHelp(\'tool-security\')" title="Learn more">?</button></div>' +
            '<div style="font-size:13px;color:var(--text-dim)">Organization-wide defaults for all agent tools. Individual agents can override these settings.</div></div>' +
          '</div>' +
          '<div id="help-tool-security" class="settings-help-panel">' +
            '<p>Tool Security controls what AI agents are allowed to do at the system level \u2014 safety guardrails that prevent agents from accessing sensitive resources.</p>' +
            '<h4>Security Sandboxes</h4>' +
            '<ul>' +
              '<li><strong>Path Sandbox</strong> \u2014 Restricts which folders agents can read/write. Prevents access to sensitive files.</li>' +
              '<li><strong>SSRF Protection</strong> \u2014 Blocks agents from reaching internal networks, cloud metadata, or private IPs.</li>' +
              '<li><strong>Command Sanitizer</strong> \u2014 Controls which shell commands agents can execute. Blocklist blocks dangerous patterns; Allowlist only permits specified commands.</li>' +
            '</ul>' +
            '<h4>Middleware &amp; Observability</h4>' +
            '<ul>' +
              '<li><strong>Audit Logging</strong> \u2014 Records every tool action: what, when, success/failure, duration. Sensitive fields are auto-redacted.</li>' +
              '<li><strong>Rate Limiting</strong> \u2014 Limits tool calls per minute per agent. Prevents system overload.</li>' +
              '<li><strong>Circuit Breaker</strong> \u2014 Auto-pauses tools that keep failing (5 consecutive errors). Waits 30s before retry.</li>' +
              '<li><strong>Telemetry</strong> \u2014 Collects performance metrics: call duration, success rates, output sizes.</li>' +
            '</ul>' +
          '</div>' +

          '<div style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:12px 0 10px">Security Sandboxes</div>' +

          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">' +
            // Path Sandbox
            '<div style="border:1px solid var(--border);border-radius:8px;padding:14px">' +
              '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Path Sandbox</div>' +
              '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">Controls which directories agents can read/write.</div>' +
              '<div class="form-group" style="margin-bottom:8px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                '<input type="checkbox" id="ts-ps-enabled"' + (ps.enabled !== false ? ' checked' : '') + '>' +
                '<span style="font-size:13px">Enable path sandboxing</span></label></div>' +
              '<div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Allowed Directories (comma-separated)</label>' +
                '<input class="input" id="ts-ps-allowedDirs" value="' + esc((ps.allowedDirs || []).join(', ')) + '" placeholder="/path/to/allow" style="font-family:monospace;font-size:12px"></div>' +
              '<div class="form-group"><label class="form-label" style="font-size:11px">Blocked Patterns (comma-separated regex)</label>' +
                '<input class="input" id="ts-ps-blockedPatterns" value="' + esc((ps.blockedPatterns || []).join(', ')) + '" placeholder="\\.env$" style="font-family:monospace;font-size:12px"></div>' +
            '</div>' +

            // SSRF Protection
            '<div style="border:1px solid var(--border);border-radius:8px;padding:14px">' +
              '<div style="font-size:14px;font-weight:600;margin-bottom:4px">SSRF Protection</div>' +
              '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">Blocks agents from accessing internal networks and private IPs.</div>' +
              '<div class="form-group" style="margin-bottom:8px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                '<input type="checkbox" id="ts-ssrf-enabled"' + (ssrf.enabled !== false ? ' checked' : '') + '>' +
                '<span style="font-size:13px">Enable SSRF protection</span></label></div>' +
              '<div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Allowed Hosts (comma-separated)</label>' +
                '<input class="input" id="ts-ssrf-allowedHosts" value="' + esc((ssrf.allowedHosts || []).join(', ')) + '" placeholder="api.example.com" style="font-family:monospace;font-size:12px"></div>' +
              '<div class="form-group"><label class="form-label" style="font-size:11px">Blocked CIDRs (comma-separated)</label>' +
                '<input class="input" id="ts-ssrf-blockedCidrs" value="' + esc((ssrf.blockedCidrs || []).join(', ')) + '" placeholder="10.0.0.0/8" style="font-family:monospace;font-size:12px"></div>' +
            '</div>' +
          '</div>' +

          // Command Sanitizer (full width)
          '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">' +
            '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Command Sanitizer</div>' +
            '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">Controls which shell commands agents can execute. Blocks dangerous patterns.</div>' +
            '<div class="form-group" style="margin-bottom:8px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
              '<input type="checkbox" id="ts-cs-enabled"' + (cs.enabled !== false ? ' checked' : '') + '>' +
              '<span style="font-size:13px">Enable command validation</span></label></div>' +
            '<div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Mode</label>' +
              '<select class="input" id="ts-cs-mode" style="width:250px">' +
                '<option value="blocklist"' + ((cs.mode || 'blocklist') === 'blocklist' ? ' selected' : '') + '>Blocklist (block specific patterns)</option>' +
                '<option value="allowlist"' + (cs.mode === 'allowlist' ? ' selected' : '') + '>Allowlist (only allow specific commands)</option>' +
              '</select></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">' +
              '<div class="form-group"><label class="form-label" style="font-size:11px">Allowed Commands (comma-separated)</label>' +
                '<input class="input" id="ts-cs-allowedCommands" value="' + esc((cs.allowedCommands || []).join(', ')) + '" placeholder="git, npm, node" style="font-family:monospace;font-size:12px"></div>' +
              '<div class="form-group"><label class="form-label" style="font-size:11px">Blocked Patterns (comma-separated)</label>' +
                '<input class="input" id="ts-cs-blockedPatterns" value="' + esc((cs.blockedPatterns || []).join(', ')) + '" placeholder="curl.*\\|.*sh" style="font-family:monospace;font-size:12px"></div>' +
            '</div>' +
          '</div>' +

          '<div style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:12px 0 10px">Middleware &amp; Observability</div>' +

          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">' +
            // Audit Logging
            '<div style="border:1px solid var(--border);border-radius:8px;padding:14px">' +
              '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Audit Logging</div>' +
              '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">Logs every tool invocation with agent ID, parameters, timing, and status.</div>' +
              '<div class="form-group" style="margin-bottom:8px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                '<input type="checkbox" id="ts-audit-enabled"' + (audit.enabled !== false ? ' checked' : '') + '>' +
                '<span style="font-size:13px">Enable audit logging</span></label></div>' +
              '<div class="form-group"><label class="form-label" style="font-size:11px">Keys to Redact (comma-separated)</label>' +
                '<input class="input" id="ts-audit-redactKeys" value="' + esc((audit.redactKeys || []).join(', ')) + '" placeholder="custom_secret" style="font-family:monospace;font-size:12px"></div>' +
            '</div>' +

            // Rate Limiting
            '<div style="border:1px solid var(--border);border-radius:8px;padding:14px">' +
              '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Rate Limiting</div>' +
              '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">Per-agent, per-tool rate limits using token bucket algorithm.</div>' +
              '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                '<input type="checkbox" id="ts-rl-enabled"' + (rl.enabled !== false ? ' checked' : '') + '>' +
                '<span style="font-size:13px">Enable rate limiting</span></label></div>' +
            '</div>' +

            // Circuit Breaker
            '<div style="border:1px solid var(--border);border-radius:8px;padding:14px">' +
              '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Circuit Breaker</div>' +
              '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">Stops calling failing tools after consecutive failures.</div>' +
              '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                '<input type="checkbox" id="ts-cb-enabled"' + (cb.enabled !== false ? ' checked' : '') + '>' +
                '<span style="font-size:13px">Enable circuit breaker</span></label></div>' +
            '</div>' +

            // Telemetry
            '<div style="border:1px solid var(--border);border-radius:8px;padding:14px">' +
              '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Telemetry</div>' +
              '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">Collects execution timing, counters, and output size metrics.</div>' +
              '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                '<input type="checkbox" id="ts-tel-enabled"' + (tel.enabled !== false ? ' checked' : '') + '>' +
                '<span style="font-size:13px">Enable telemetry collection</span></label></div>' +
            '</div>' +
          '</div>' +

          '<button class="btn btn-primary" style="width:auto" id="btn-save-tool-security">Save Tool Security Settings</button>' +
        '</div>' +

        // Network & Firewall
        '<div class="card" style="margin-top:16px">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
            '<div><div style="display:flex;align-items:center;gap:0"><div class="card-title" style="margin-bottom:4px">Network &amp; Firewall</div>' +
            '<button class="settings-help-btn" onclick="toggleSettingsHelp(\'network\')" title="Learn more">?</button></div>' +
            '<div style="font-size:13px;color:var(--text-dim)">IP access control, egress filtering, proxy settings, and network security policies.</div></div>' +
          '</div>' +
          '<div id="help-network" class="settings-help-panel">' +
            '<p>Controls who can access your AgenticMail instance and what agents can reach on the internet.</p>' +
            '<h4>IP Access Control</h4>' +
            '<p>Restricts which IPs can reach the dashboard and APIs. Allowlist = only listed IPs connect. Blocklist = all except blocked IPs.</p>' +
            '<h4>Outbound Egress</h4>' +
            '<p>Controls which external hosts/ports agents can reach. Allowlist = only approved hosts. Blocklist = everything except blocked hosts.</p>' +
            '<h4>Proxy &amp; Trusted Proxies</h4>' +
            '<ul>' +
              '<li><strong>Proxy Config</strong> \u2014 HTTP/HTTPS proxy URLs for outbound access. \u201CNo-Proxy\u201D bypasses the proxy.</li>' +
              '<li><strong>Trusted Proxies</strong> \u2014 IPs of your load balancers/reverse proxies, so IP access control sees real client IPs.</li>' +
            '</ul>' +
            '<h4>Network Settings</h4>' +
            '<ul>' +
              '<li><strong>CORS Origins</strong> \u2014 Which websites can make API calls to AgenticMail. Empty = allow all.</li>' +
              '<li><strong>Rate Limiting</strong> \u2014 Limits API requests per IP per minute. Protects against abuse.</li>' +
              '<li><strong>HTTPS Enforcement</strong> \u2014 Forces encrypted connections. Recommended for production.</li>' +
              '<li><strong>Security Headers</strong> \u2014 Browser security: HSTS, X-Frame-Options, Content-Type-Options.</li>' +
            '</ul>' +
          '</div>' +

          // IP Access Control
          '<div style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:12px 0 10px">IP Access Control</div>' +
          '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">' +
            '<div class="form-group" style="margin-bottom:8px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
              '<input type="checkbox" id="fw-ip-enabled"' + (ipAccess.enabled ? ' checked' : '') + '>' +
              '<span style="font-size:13px">Enable IP access control</span></label></div>' +
            '<div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Mode</label>' +
              '<select class="input" id="fw-ip-mode" style="width:250px">' +
                '<option value="allowlist"' + ((ipAccess.mode || 'allowlist') === 'allowlist' ? ' selected' : '') + '>Allowlist (only allow listed IPs)</option>' +
                '<option value="blocklist"' + (ipAccess.mode === 'blocklist' ? ' selected' : '') + '>Blocklist (block listed IPs)</option>' +
              '</select></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">' +
              '<div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Allowlist IPs/CIDRs (comma-separated)</label>' +
                '<input class="input" id="fw-ip-allowlist" value="' + esc((ipAccess.allowlist || []).join(', ')) + '" placeholder="10.0.0.0/8, 192.168.1.0/24" style="font-family:monospace;font-size:12px"></div>' +
              '<div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Blocklist IPs/CIDRs (comma-separated)</label>' +
                '<input class="input" id="fw-ip-blocklist" value="' + esc((ipAccess.blocklist || []).join(', ')) + '" placeholder="203.0.113.0/24" style="font-family:monospace;font-size:12px"></div>' +
            '</div>' +
            '<div class="form-group"><label class="form-label" style="font-size:11px">Bypass Paths (comma-separated)</label>' +
              '<input class="input" id="fw-ip-bypassPaths" value="' + esc((ipAccess.bypassPaths || []).join(', ')) + '" placeholder="/health, /ready" style="font-family:monospace;font-size:12px"></div>' +
          '</div>' +

          // Outbound Egress
          '<div style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:12px 0 10px">Outbound Egress</div>' +
          '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">' +
            '<div class="form-group" style="margin-bottom:8px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
              '<input type="checkbox" id="fw-egress-enabled"' + (egress.enabled ? ' checked' : '') + '>' +
              '<span style="font-size:13px">Enable egress filtering</span></label></div>' +
            '<div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Mode</label>' +
              '<select class="input" id="fw-egress-mode" style="width:250px">' +
                '<option value="blocklist"' + ((egress.mode || 'blocklist') === 'blocklist' ? ' selected' : '') + '>Blocklist (block listed hosts)</option>' +
                '<option value="allowlist"' + (egress.mode === 'allowlist' ? ' selected' : '') + '>Allowlist (only allow listed hosts)</option>' +
              '</select></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">' +
              '<div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Allowed Hosts (comma-separated)</label>' +
                '<input class="input" id="fw-egress-allowedHosts" value="' + esc((egress.allowedHosts || []).join(', ')) + '" placeholder="api.example.com" style="font-family:monospace;font-size:12px"></div>' +
              '<div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Blocked Hosts (comma-separated)</label>' +
                '<input class="input" id="fw-egress-blockedHosts" value="' + esc((egress.blockedHosts || []).join(', ')) + '" placeholder="evil.com" style="font-family:monospace;font-size:12px"></div>' +
              '<div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Allowed Ports (comma-separated)</label>' +
                '<input class="input" id="fw-egress-allowedPorts" value="' + esc((egress.allowedPorts || []).join(', ')) + '" placeholder="80, 443" style="font-family:monospace;font-size:12px"></div>' +
              '<div class="form-group"><label class="form-label" style="font-size:11px">Blocked Ports (comma-separated)</label>' +
                '<input class="input" id="fw-egress-blockedPorts" value="' + esc((egress.blockedPorts || []).join(', ')) + '" placeholder="25, 445" style="font-family:monospace;font-size:12px"></div>' +
            '</div>' +
          '</div>' +

          // Proxy & Trusted Proxies
          '<div style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:12px 0 10px">Proxy &amp; Trusted Proxies</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">' +
            // Proxy
            '<div style="border:1px solid var(--border);border-radius:8px;padding:14px">' +
              '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Proxy Settings</div>' +
              '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">Configure outbound proxy for agent HTTP requests.</div>' +
              '<div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">HTTP Proxy</label>' +
                '<input class="input" id="fw-proxy-http" value="' + esc(proxy.httpProxy || '') + '" placeholder="http://proxy:8080" style="font-family:monospace;font-size:12px"></div>' +
              '<div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">HTTPS Proxy</label>' +
                '<input class="input" id="fw-proxy-https" value="' + esc(proxy.httpsProxy || '') + '" placeholder="http://proxy:8443" style="font-family:monospace;font-size:12px"></div>' +
              '<div class="form-group"><label class="form-label" style="font-size:11px">No-Proxy Hosts (comma-separated)</label>' +
                '<input class="input" id="fw-proxy-noProxy" value="' + esc((proxy.noProxy || []).join(', ')) + '" placeholder="localhost, 127.0.0.1" style="font-family:monospace;font-size:12px"></div>' +
            '</div>' +
            // Trusted Proxies
            '<div style="border:1px solid var(--border);border-radius:8px;padding:14px">' +
              '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Trusted Proxies</div>' +
              '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">Trust X-Forwarded-For headers from specific reverse proxies.</div>' +
              '<div class="form-group" style="margin-bottom:8px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                '<input type="checkbox" id="fw-tp-enabled"' + (trustedProxies.enabled ? ' checked' : '') + '>' +
                '<span style="font-size:13px">Enable trusted proxies</span></label></div>' +
              '<div class="form-group"><label class="form-label" style="font-size:11px">Trusted Proxy IPs/CIDRs (comma-separated)</label>' +
                '<input class="input" id="fw-tp-ips" value="' + esc((trustedProxies.ips || []).join(', ')) + '" placeholder="10.0.0.1, 172.16.0.0/12" style="font-family:monospace;font-size:12px"></div>' +
            '</div>' +
          '</div>' +

          // Network Settings
          '<div style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:12px 0 10px">Network Settings</div>' +

          // CORS
          '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">' +
            '<div style="font-size:14px;font-weight:600;margin-bottom:4px">CORS Origins</div>' +
            '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">Allowed origins for Cross-Origin Resource Sharing.</div>' +
            '<div class="form-group"><input class="input" id="fw-net-corsOrigins" value="' + esc((network.corsOrigins || []).join(', ')) + '" placeholder="https://app.example.com, https://admin.example.com" style="font-family:monospace;font-size:12px"></div>' +
          '</div>' +

          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">' +
            // Rate Limiting
            '<div style="border:1px solid var(--border);border-radius:8px;padding:14px">' +
              '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Rate Limiting</div>' +
              '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">Limit incoming requests per minute.</div>' +
              '<div class="form-group" style="margin-bottom:8px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                '<input type="checkbox" id="fw-net-rl-enabled"' + (netRl.enabled !== false ? ' checked' : '') + '>' +
                '<span style="font-size:13px">Enable rate limiting</span></label></div>' +
              '<div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Requests Per Minute</label>' +
                '<input class="input" type="number" id="fw-net-rl-rpm" value="' + esc(String(netRl.requestsPerMinute || 120)) + '" style="width:150px"></div>' +
              '<div class="form-group"><label class="form-label" style="font-size:11px">Skip Paths (comma-separated)</label>' +
                '<input class="input" id="fw-net-rl-skipPaths" value="' + esc((netRl.skipPaths || []).join(', ')) + '" placeholder="/health, /ready" style="font-family:monospace;font-size:12px"></div>' +
            '</div>' +
            // HTTPS Enforcement
            '<div style="border:1px solid var(--border);border-radius:8px;padding:14px">' +
              '<div style="font-size:14px;font-weight:600;margin-bottom:4px">HTTPS Enforcement</div>' +
              '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">Redirect HTTP to HTTPS and enforce secure connections.</div>' +
              '<div class="form-group" style="margin-bottom:8px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                '<input type="checkbox" id="fw-net-https-enabled"' + (httpsEnf.enabled ? ' checked' : '') + '>' +
                '<span style="font-size:13px">Enable HTTPS enforcement</span></label></div>' +
              '<div class="form-group"><label class="form-label" style="font-size:11px">Exclude Paths (comma-separated)</label>' +
                '<input class="input" id="fw-net-https-excludePaths" value="' + esc((httpsEnf.excludePaths || []).join(', ')) + '" placeholder="/health, /ready" style="font-family:monospace;font-size:12px"></div>' +
            '</div>' +
          '</div>' +

          // Security Headers
          '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">' +
            '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Security Headers</div>' +
            '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">HTTP response security headers applied to all responses.</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">' +
              '<div class="form-group" style="margin-bottom:8px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                '<input type="checkbox" id="fw-sh-hsts"' + (secHeaders.hsts !== false ? ' checked' : '') + '>' +
                '<span style="font-size:13px">Enable HSTS</span></label></div>' +
              '<div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">HSTS Max-Age (seconds)</label>' +
                '<input class="input" type="number" id="fw-sh-hstsMaxAge" value="' + esc(String(secHeaders.hstsMaxAge || 31536000)) + '" style="width:150px"></div>' +
              '<div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">X-Frame-Options</label>' +
                '<select class="input" id="fw-sh-xFrameOptions" style="width:250px">' +
                  '<option value="DENY"' + ((secHeaders.xFrameOptions || 'DENY') === 'DENY' ? ' selected' : '') + '>DENY</option>' +
                  '<option value="SAMEORIGIN"' + (secHeaders.xFrameOptions === 'SAMEORIGIN' ? ' selected' : '') + '>SAMEORIGIN</option>' +
                  '<option value=""' + (secHeaders.xFrameOptions === '' ? ' selected' : '') + '>Disabled</option>' +
                '</select></div>' +
              '<div class="form-group" style="margin-bottom:8px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
                '<input type="checkbox" id="fw-sh-xContentTypeOptions"' + (secHeaders.xContentTypeOptions !== false ? ' checked' : '') + '>' +
                '<span style="font-size:13px">X-Content-Type-Options: nosniff</span></label></div>' +
              '<div class="form-group" style="margin-bottom:8px"><label class="form-label" style="font-size:11px">Referrer-Policy</label>' +
                '<select class="input" id="fw-sh-referrerPolicy" style="width:250px">' +
                  '<option value="strict-origin-when-cross-origin"' + ((secHeaders.referrerPolicy || 'strict-origin-when-cross-origin') === 'strict-origin-when-cross-origin' ? ' selected' : '') + '>strict-origin-when-cross-origin</option>' +
                  '<option value="no-referrer"' + (secHeaders.referrerPolicy === 'no-referrer' ? ' selected' : '') + '>no-referrer</option>' +
                  '<option value="same-origin"' + (secHeaders.referrerPolicy === 'same-origin' ? ' selected' : '') + '>same-origin</option>' +
                  '<option value="origin"' + (secHeaders.referrerPolicy === 'origin' ? ' selected' : '') + '>origin</option>' +
                '</select></div>' +
              '<div class="form-group"><label class="form-label" style="font-size:11px">Permissions-Policy</label>' +
                '<input class="input" id="fw-sh-permissionsPolicy" value="' + esc(secHeaders.permissionsPolicy || '') + '" placeholder="camera=(), microphone=(), geolocation=()" style="font-family:monospace;font-size:12px"></div>' +
            '</div>' +
          '</div>' +

          '<button class="btn btn-primary" style="width:auto" id="btn-save-firewall">Save Network &amp; Firewall Settings</button>' +
        '</div>' +

        // Model Pricing
        '<div class="card" style="margin-top:16px">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
            '<div><div style="display:flex;align-items:center;gap:0"><div class="card-title" style="margin-bottom:4px">Model Pricing</div>' +
            '<button class="settings-help-btn" onclick="toggleSettingsHelp(\'model-pricing\')" title="Learn more">?</button></div>' +
            '<div style="font-size:13px;color:var(--text-dim)">Configure token costs per model for accurate budget tracking and cost reporting. Costs are in USD per 1 million tokens.</div></div>' +
          '</div>' +
          '<div id="help-model-pricing" class="settings-help-panel">' +
            '<p>Model Pricing controls how token costs are calculated for each AI model your agents use.</p>' +
            '<h4>Cost Fields</h4>' +
            '<ul>' +
              '<li><strong>Input Cost/1M</strong> \u2014 The cost in USD per 1 million input (prompt) tokens.</li>' +
              '<li><strong>Output Cost/1M</strong> \u2014 The cost in USD per 1 million output (completion) tokens.</li>' +
              '<li><strong>Context Window</strong> \u2014 The maximum number of tokens the model supports.</li>' +
            '</ul>' +
            '<p>These costs are used for budget tracking, cost alerts, and usage reports across all agents.</p>' +
          '</div>' +

          // Existing models table grouped by provider
          (Object.keys(mpProviders).length === 0
            ? '<div style="padding:32px;text-align:center;color:var(--text-dim)">' +
                '<p>No model pricing configured. Default pricing will be used for cost tracking.</p>' +
              '</div>'
            : Object.keys(mpProviders).sort().map(function(provider) {
                var label = providerLabels[provider] || provider;
                var rows = mpProviders[provider];
                return '<div style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:12px 0 10px">' + esc(label) + '</div>' +
                  '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:14px">' +
                    '<table style="width:100%;border-collapse:collapse">' +
                      '<thead><tr style="background:var(--bg-alt)">' +
                        '<th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600">Model</th>' +
                        '<th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600">Input $/1M</th>' +
                        '<th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600">Output $/1M</th>' +
                        '<th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600">Context</th>' +
                        '<th style="padding:8px 12px;width:60px"></th>' +
                      '</tr></thead>' +
                      '<tbody>' +
                        rows.map(function(m) {
                          var globalIdx = mpModels.indexOf(m);
                          var ctx = m.contextWindow ? (m.contextWindow >= 1000000 ? (m.contextWindow / 1000000) + 'M' : Math.round(m.contextWindow / 1000) + 'K') : '\u2014';
                          return '<tr style="border-top:1px solid var(--border)">' +
                            '<td style="padding:8px 12px"><strong>' + esc(m.displayName || m.modelId) + '</strong><br><span style="font-size:12px;color:var(--text-dim)">' + esc(m.modelId) + '</span></td>' +
                            '<td style="padding:8px 12px;text-align:right;font-family:monospace">$' + esc(String(m.inputCostPerMillion || 0)) + '</td>' +
                            '<td style="padding:8px 12px;text-align:right;font-family:monospace">$' + esc(String(m.outputCostPerMillion || 0)) + '</td>' +
                            '<td style="padding:8px 12px;text-align:right;font-size:13px;color:var(--text-dim)">' + ctx + '</td>' +
                            '<td style="padding:8px 12px;text-align:center"><button class="btn btn-danger mp-delete-btn" data-index="' + globalIdx + '" style="padding:2px 8px;font-size:12px" title="Remove model">&times;</button></td>' +
                          '</tr>';
                        }).join('') +
                      '</tbody>' +
                    '</table>' +
                  '</div>';
              }).join('')) +

          (mpModels.length > 0
            ? '<div style="font-size:13px;color:var(--text-dim);margin-bottom:16px">' + mpModels.length + ' model(s) configured across ' + Object.keys(mpProviders).length + ' provider(s)' + (mpCfg.updatedAt ? ' \u2014 Last updated: ' + new Date(mpCfg.updatedAt).toLocaleString() : '') + '</div>'
            : '') +

          // Add new model form
          '<div style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:12px 0 10px">Add New Model</div>' +
          '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">' +
              '<div class="form-group"><label class="form-label" style="font-size:11px">Provider</label>' +
                '<select class="input" id="mp-provider">' +
                  '<option value="anthropic">Anthropic</option>' +
                  '<option value="openai">OpenAI</option>' +
                  '<option value="google">Google</option>' +
                  '<option value="deepseek">DeepSeek</option>' +
                  '<option value="xai">xAI (Grok)</option>' +
                  '<option value="mistral">Mistral</option>' +
                  '<option value="groq">Groq</option>' +
                  '<option value="together">Together</option>' +
                  '<option value="fireworks">Fireworks</option>' +
                  '<option value="moonshot">Moonshot (Kimi)</option>' +
                  '<option value="cerebras">Cerebras</option>' +
                  '<option value="openrouter">OpenRouter</option>' +
                  '<option value="ollama">Ollama (Local)</option>' +
                  '<option value="vllm">vLLM (Local)</option>' +
                  '<option value="lmstudio">LM Studio (Local)</option>' +
                  '<option value="litellm">LiteLLM (Local)</option>' +
                  '<option value="azure">Azure</option>' +
                  '<option value="aws">AWS Bedrock</option>' +
                  '<option value="custom">Custom</option>' +
                '</select></div>' +
              '<div class="form-group"><label class="form-label" style="font-size:11px">Model ID</label>' +
                '<input class="input" id="mp-modelId" placeholder="e.g. claude-sonnet-4-5-20250929" style="font-family:monospace;font-size:12px"></div>' +
              '<div class="form-group"><label class="form-label" style="font-size:11px">Display Name</label>' +
                '<input class="input" id="mp-displayName" placeholder="e.g. Claude Sonnet 4.5"></div>' +
              '<div class="form-group"><label class="form-label" style="font-size:11px">Context Window</label>' +
                '<input class="input" type="number" id="mp-contextWindow" placeholder="200000"></div>' +
              '<div class="form-group"><label class="form-label" style="font-size:11px">Input Cost ($ per 1M tokens)</label>' +
                '<input class="input" type="number" step="0.01" id="mp-inputCost" placeholder="3.00"></div>' +
              '<div class="form-group"><label class="form-label" style="font-size:11px">Output Cost ($ per 1M tokens)</label>' +
                '<input class="input" type="number" step="0.01" id="mp-outputCost" placeholder="15.00"></div>' +
            '</div>' +
          '</div>' +

          '<button class="btn btn-primary" style="width:auto" id="btn-add-model">Add Model</button>' +
        '</div>';

      // Bind settings form
      var form = document.getElementById('settings-form');
      if (form) {
        form.onsubmit = function(e) {
          saveSettings(e);
        };
      }

      // Bind tool security save
      var tsBtn = document.getElementById('btn-save-tool-security');
      if (tsBtn) {
        tsBtn.onclick = function() {
          saveToolSecurity();
        };
      }

      // Bind firewall save
      var fwBtn = document.getElementById('btn-save-firewall');
      if (fwBtn) {
        fwBtn.onclick = function() {
          saveFirewall();
        };
      }

      // Bind model pricing add
      var addModelBtn = document.getElementById('btn-add-model');
      if (addModelBtn) {
        addModelBtn.onclick = function() {
          addModelPricing(mpModels, mpCfg);
        };
      }

      // Bind model pricing delete buttons
      var deleteBtns = document.querySelectorAll('.mp-delete-btn');
      deleteBtns.forEach(function(btn) {
        btn.onclick = function() {
          var idx = parseInt(btn.getAttribute('data-index'), 10);
          deleteModelPricing(idx, mpModels, mpCfg);
        };
      });
    });
}

window.toggleSettingsHelp = function(id) {
  var p = document.getElementById('help-' + id);
  if (p) p.classList.toggle('open');
};

function saveSettings(e) {
  e.preventDefault();
  api('/settings', {
    method: 'PATCH',
    body: {
      name: document.getElementById('set-name').value,
      domain: document.getElementById('set-domain').value,
      primaryColor: document.getElementById('set-color').value,
      logoUrl: document.getElementById('set-logo').value,
    },
  })
    .then(function() { toast('Settings saved!', 'success'); })
    .catch(function(err) { toast(err.message, 'error'); });
}

function splitComma(val) {
  if (!val || !val.trim()) return [];
  return val.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
}

function saveToolSecurity() {
  var payload = {
    security: {
      pathSandbox: {
        enabled: document.getElementById('ts-ps-enabled').checked,
        allowedDirs: splitComma(document.getElementById('ts-ps-allowedDirs').value),
        blockedPatterns: splitComma(document.getElementById('ts-ps-blockedPatterns').value),
      },
      ssrf: {
        enabled: document.getElementById('ts-ssrf-enabled').checked,
        allowedHosts: splitComma(document.getElementById('ts-ssrf-allowedHosts').value),
        blockedCidrs: splitComma(document.getElementById('ts-ssrf-blockedCidrs').value),
      },
      commandSanitizer: {
        enabled: document.getElementById('ts-cs-enabled').checked,
        mode: document.getElementById('ts-cs-mode').value || 'blocklist',
        allowedCommands: splitComma(document.getElementById('ts-cs-allowedCommands').value),
        blockedPatterns: splitComma(document.getElementById('ts-cs-blockedPatterns').value),
      },
    },
    middleware: {
      audit: {
        enabled: document.getElementById('ts-audit-enabled').checked,
        redactKeys: splitComma(document.getElementById('ts-audit-redactKeys').value),
      },
      rateLimit: {
        enabled: document.getElementById('ts-rl-enabled').checked,
        overrides: {},
      },
      circuitBreaker: {
        enabled: document.getElementById('ts-cb-enabled').checked,
      },
      telemetry: {
        enabled: document.getElementById('ts-tel-enabled').checked,
      },
    },
  };
  api('/settings/tool-security', { method: 'PUT', body: payload })
    .then(function() { toast('Tool security settings saved', 'success'); })
    .catch(function(err) { toast(err.message, 'error'); });
}

function splitCommaNumbers(val) {
  return splitComma(val).map(Number).filter(function(n) { return !isNaN(n); });
}

function saveFirewall() {
  var payload = {
    ipAccess: {
      enabled: document.getElementById('fw-ip-enabled').checked,
      mode: document.getElementById('fw-ip-mode').value || 'allowlist',
      allowlist: splitComma(document.getElementById('fw-ip-allowlist').value),
      blocklist: splitComma(document.getElementById('fw-ip-blocklist').value),
      bypassPaths: splitComma(document.getElementById('fw-ip-bypassPaths').value),
    },
    egress: {
      enabled: document.getElementById('fw-egress-enabled').checked,
      mode: document.getElementById('fw-egress-mode').value || 'blocklist',
      allowedHosts: splitComma(document.getElementById('fw-egress-allowedHosts').value),
      blockedHosts: splitComma(document.getElementById('fw-egress-blockedHosts').value),
      allowedPorts: splitCommaNumbers(document.getElementById('fw-egress-allowedPorts').value),
      blockedPorts: splitCommaNumbers(document.getElementById('fw-egress-blockedPorts').value),
    },
    proxy: {
      httpProxy: document.getElementById('fw-proxy-http').value || '',
      httpsProxy: document.getElementById('fw-proxy-https').value || '',
      noProxy: splitComma(document.getElementById('fw-proxy-noProxy').value),
    },
    trustedProxies: {
      enabled: document.getElementById('fw-tp-enabled').checked,
      ips: splitComma(document.getElementById('fw-tp-ips').value),
    },
    network: {
      corsOrigins: splitComma(document.getElementById('fw-net-corsOrigins').value),
      rateLimit: {
        enabled: document.getElementById('fw-net-rl-enabled').checked,
        requestsPerMinute: parseInt(document.getElementById('fw-net-rl-rpm').value, 10) || 120,
        skipPaths: splitComma(document.getElementById('fw-net-rl-skipPaths').value),
      },
      httpsEnforcement: {
        enabled: document.getElementById('fw-net-https-enabled').checked,
        excludePaths: splitComma(document.getElementById('fw-net-https-excludePaths').value),
      },
      securityHeaders: {
        hsts: document.getElementById('fw-sh-hsts').checked,
        hstsMaxAge: parseInt(document.getElementById('fw-sh-hstsMaxAge').value, 10) || 31536000,
        xFrameOptions: document.getElementById('fw-sh-xFrameOptions').value,
        xContentTypeOptions: document.getElementById('fw-sh-xContentTypeOptions').checked,
        referrerPolicy: document.getElementById('fw-sh-referrerPolicy').value || 'strict-origin-when-cross-origin',
        permissionsPolicy: document.getElementById('fw-sh-permissionsPolicy').value || '',
      },
    },
  };
  api('/settings/firewall', { method: 'PUT', body: payload })
    .then(function() { toast('Network & firewall settings saved', 'success'); })
    .catch(function(err) { toast(err.message, 'error'); });
}

function addModelPricing(existingModels, cfg) {
  var modelId = document.getElementById('mp-modelId').value.trim();
  if (!modelId) { toast('Model ID is required', 'error'); return; }

  var newModel = {
    provider: document.getElementById('mp-provider').value || 'custom',
    modelId: modelId,
    displayName: document.getElementById('mp-displayName').value.trim() || modelId,
    inputCostPerMillion: parseFloat(document.getElementById('mp-inputCost').value) || 0,
    outputCostPerMillion: parseFloat(document.getElementById('mp-outputCost').value) || 0,
    contextWindow: parseInt(document.getElementById('mp-contextWindow').value, 10) || 0,
  };

  var models = existingModels.slice();
  models.push(newModel);

  var payload = { models: models, currency: cfg.currency || 'USD' };
  api('/settings/model-pricing', { method: 'PUT', body: payload })
    .then(function() { toast('Model added to pricing config', 'success'); loadSettings(); })
    .catch(function(err) { toast(err.message, 'error'); });
}

function deleteModelPricing(idx, existingModels, cfg) {
  var models = existingModels.slice();
  if (idx >= 0 && idx < models.length) {
    models.splice(idx, 1);
  }

  var payload = { models: models, currency: cfg.currency || 'USD' };
  api('/settings/model-pricing', { method: 'PUT', body: payload })
    .then(function() { toast('Model removed from pricing config', 'success'); loadSettings(); })
    .catch(function(err) { toast(err.message, 'error'); });
}
