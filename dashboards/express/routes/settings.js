/**
 * AgenticMail Enterprise Dashboard — Settings Routes
 * GET /settings, POST /settings
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { apiGet, apiPatch, apiPut, API_URL } = require('../utils/api');
const { layout } = require('../views/layout');
const { esc } = require('../utils/helpers');

const router = Router();

router.get('/settings', requireAuth, async (req, res) => {
  const flash = req.session.flash;
  delete req.session.flash;

  const [result, tsResult, fwResult, mpResult] = await Promise.all([
    apiGet('/api/settings', req.session.token),
    apiGet('/api/settings/tool-security', req.session.token),
    apiGet('/api/settings/firewall', req.session.token),
    apiGet('/api/settings/model-pricing', req.session.token),
  ]);
  const s = result.status === 200 ? result.body : {};
  const tsCfg = tsResult.status === 200 ? (tsResult.body.toolSecurityConfig || {}) : {};
  const fw = fwResult.status === 200 ? (fwResult.body.firewallConfig || {}) : {};
  const mpCfg = mpResult.status === 200 ? (mpResult.body.modelPricingConfig || {}) : {};
  const mpModels = mpCfg.models || [];
  const mpProviders = {};
  mpModels.forEach(function(m) { if (!mpProviders[m.provider]) mpProviders[m.provider] = []; mpProviders[m.provider].push(m); });
  const providerLabels = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', deepseek: 'DeepSeek', xai: 'xAI (Grok)', mistral: 'Mistral', groq: 'Groq', together: 'Together', fireworks: 'Fireworks', moonshot: 'Moonshot (Kimi)', cerebras: 'Cerebras', openrouter: 'OpenRouter', ollama: 'Ollama (Local)', vllm: 'vLLM (Local)', lmstudio: 'LM Studio (Local)', litellm: 'LiteLLM (Local)', azure: 'Azure', aws: 'AWS Bedrock', custom: 'Custom' };
  const ipAccess = fw.ipAccess || {};
  const egress = fw.egress || {};
  const proxy = fw.proxy || {};
  const trustedProxies = fw.trustedProxies || {};
  const network = fw.network || {};
  const rateLimit = network.rateLimit || {};
  const httpsEnf = network.httpsEnforcement || {};
  const secHeaders = network.securityHeaders || {};
  const sec = tsCfg.security || {};
  const mw = tsCfg.middleware || {};
  const ps = sec.pathSandbox || {};
  const ssrf = sec.ssrf || {};
  const cs = sec.commandSanitizer || {};
  const audit = mw.audit || {};
  const rl = mw.rateLimit || {};
  const cb = mw.circuitBreaker || {};
  const tel = mw.telemetry || {};

  const content = `
    <div class="page-header">
      <h1>Settings</h1>
      <p>Configure your AgenticMail Enterprise instance</p>
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;gap:0">
        <h3>Organization Settings</h3>
        <button class="settings-help-btn" onclick="toggleSettingsHelp('org')" title="Learn more">?</button>
      </div>
      <div id="help-org" class="settings-help-panel">
        <p>The General section configures your organization&rsquo;s identity and email delivery.</p>
        <h4>Organization</h4>
        <ul>
          <li><strong>Company Name</strong> &mdash; Appears throughout the dashboard and in emails sent by agents.</li>
          <li><strong>Domain</strong> &mdash; Your company&rsquo;s primary domain, used for agent email addresses.</li>
          <li><strong>Subdomain</strong> &mdash; Your unique ID on the AgenticMail cloud (subdomain.agenticmail.io).</li>
          <li><strong>Logo URL</strong> &mdash; Link to your company logo, shown in dashboard and emails.</li>
          <li><strong>Primary Color</strong> &mdash; Customizes the dashboard accent color to match your brand.</li>
        </ul>
        <h4>SMTP Configuration</h4>
        <p>Controls outgoing email delivery. Leave blank to use the default AgenticMail relay. Configure custom SMTP to send from your own mail infrastructure.</p>
      </div>
      <form method="post" action="/settings">
        <div class="form-row">
          <div class="form-group">
            <label>Organization Name</label>
            <input type="text" name="org_name" value="${esc(s.org_name || s.name || '')}" placeholder="Your Org">
          </div>
          <div class="form-group">
            <label>Default Model</label>
            <input type="text" name="default_model" value="${esc(s.default_model || '')}" placeholder="gpt-4o">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Max Agents</label>
            <input type="number" name="max_agents" value="${esc(String(s.max_agents || ''))}" placeholder="50">
          </div>
          <div class="form-group">
            <label>Rate Limit (req/min)</label>
            <input type="number" name="rate_limit" value="${esc(String(s.rate_limit || ''))}" placeholder="1000">
          </div>
        </div>
        <div class="form-group">
          <label>Webhook URL</label>
          <input type="url" name="webhook_url" value="${esc(s.webhook_url || '')}" placeholder="https://hooks.example.com/events">
        </div>
        <button class="btn btn-primary" type="submit">Save Settings</button>
      </form>
    </div>

    <div class="card">
      <h3>Instance Information</h3>
      <div class="table-wrap">
        <table>
          <tbody>
            <tr><td style="font-weight:600;width:200px">API Endpoint</td><td><code>${esc(API_URL)}</code></td></tr>
            <tr><td style="font-weight:600">Version</td><td>${esc(s.version || s.app_version || '-')}</td></tr>
            <tr><td style="font-weight:600">Plan</td><td>${esc(s.plan || s.tier || 'Enterprise')}</td></tr>
            <tr><td style="font-weight:600">Region</td><td>${esc(s.region || '-')}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div>
          <div style="display:flex;align-items:center;gap:0">
            <h3 style="margin:0">Tool Security</h3>
            <button class="settings-help-btn" onclick="toggleSettingsHelp('tool-security')" title="Learn more">?</button>
          </div>
          <p style="margin:4px 0 0;font-size:13px;color:var(--text-muted)">Organization-wide defaults for all agent tools. Individual agents can override these settings.</p>
        </div>
      </div>
      <div id="help-tool-security" class="settings-help-panel">
        <p>Tool Security controls what AI agents are allowed to do at the system level &mdash; safety guardrails that prevent agents from accessing sensitive resources.</p>
        <h4>Security Sandboxes</h4>
        <ul>
          <li><strong>Path Sandbox</strong> &mdash; Restricts which folders agents can read/write. Prevents access to sensitive files.</li>
          <li><strong>SSRF Protection</strong> &mdash; Blocks agents from reaching internal networks, cloud metadata, or private IPs.</li>
          <li><strong>Command Sanitizer</strong> &mdash; Controls which shell commands agents can execute. Blocklist blocks dangerous patterns; Allowlist only permits specified commands.</li>
        </ul>
        <h4>Middleware &amp; Observability</h4>
        <ul>
          <li><strong>Audit Logging</strong> &mdash; Records every tool action: what, when, success/failure, duration. Sensitive fields are auto-redacted.</li>
          <li><strong>Rate Limiting</strong> &mdash; Limits tool calls per minute per agent. Prevents system overload.</li>
          <li><strong>Circuit Breaker</strong> &mdash; Auto-pauses tools that keep failing (5 consecutive errors). Waits 30s before retry.</li>
          <li><strong>Telemetry</strong> &mdash; Collects performance metrics: call duration, success rates, output sizes.</li>
        </ul>
      </div>
      <form method="post" action="/settings/tool-security">

        <!-- Security Sandboxes -->
        <h4 style="font-size:14px;font-weight:600;color:var(--text-muted);margin:16px 0 12px;text-transform:uppercase;letter-spacing:0.05em">Security Sandboxes</h4>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          <!-- Path Sandbox -->
          <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
            <div style="font-size:15px;font-weight:600;margin-bottom:4px">Path Sandbox</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Controls which directories agents can read/write.</div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="ps_enabled" ${ps.enabled !== false ? 'checked' : ''}>
                <span style="font-size:13px">Enable path sandboxing</span>
              </label>
            </div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Allowed Directories (comma-separated)</label>
              <input type="text" name="ps_allowedDirs" value="${esc((ps.allowedDirs || []).join(', '))}" placeholder="/path/to/allow" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Blocked Patterns (comma-separated regex)</label>
              <input type="text" name="ps_blockedPatterns" value="${esc((ps.blockedPatterns || []).join(', '))}" placeholder="\\.env$" style="font-family:monospace;font-size:12px">
            </div>
          </div>

          <!-- SSRF Protection -->
          <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
            <div style="font-size:15px;font-weight:600;margin-bottom:4px">SSRF Protection</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Blocks agents from accessing internal networks and private IPs.</div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="ssrf_enabled" ${ssrf.enabled !== false ? 'checked' : ''}>
                <span style="font-size:13px">Enable SSRF protection</span>
              </label>
            </div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Allowed Hosts (comma-separated)</label>
              <input type="text" name="ssrf_allowedHosts" value="${esc((ssrf.allowedHosts || []).join(', '))}" placeholder="api.example.com" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Blocked CIDRs (comma-separated)</label>
              <input type="text" name="ssrf_blockedCidrs" value="${esc((ssrf.blockedCidrs || []).join(', '))}" placeholder="10.0.0.0/8" style="font-family:monospace;font-size:12px">
            </div>
          </div>
        </div>

        <!-- Command Sanitizer (full width) -->
        <div style="border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px">
          <div style="font-size:15px;font-weight:600;margin-bottom:4px">Command Sanitizer</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Controls which shell commands agents can execute. Blocks dangerous patterns.</div>
          <div class="form-group" style="margin-bottom:8px">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" name="cs_enabled" ${cs.enabled !== false ? 'checked' : ''}>
              <span style="font-size:13px">Enable command validation</span>
            </label>
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Mode</label>
            <select name="cs_mode" style="width:250px">
              <option value="blocklist" ${(cs.mode || 'blocklist') === 'blocklist' ? 'selected' : ''}>Blocklist (block specific patterns)</option>
              <option value="allowlist" ${cs.mode === 'allowlist' ? 'selected' : ''}>Allowlist (only allow specific commands)</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Allowed Commands (comma-separated)</label>
              <input type="text" name="cs_allowedCommands" value="${esc((cs.allowedCommands || []).join(', '))}" placeholder="git, npm, node" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Blocked Patterns (comma-separated)</label>
              <input type="text" name="cs_blockedPatterns" value="${esc((cs.blockedPatterns || []).join(', '))}" placeholder="curl.*\\|.*sh" style="font-family:monospace;font-size:12px">
            </div>
          </div>
        </div>

        <!-- Middleware & Observability -->
        <h4 style="font-size:14px;font-weight:600;color:var(--text-muted);margin:16px 0 12px;text-transform:uppercase;letter-spacing:0.05em">Middleware &amp; Observability</h4>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          <!-- Audit Logging -->
          <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
            <div style="font-size:15px;font-weight:600;margin-bottom:4px">Audit Logging</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Logs every tool invocation with agent ID, parameters, timing, and status.</div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="audit_enabled" ${audit.enabled !== false ? 'checked' : ''}>
                <span style="font-size:13px">Enable audit logging</span>
              </label>
            </div>
            <div class="form-group">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Keys to Redact (comma-separated)</label>
              <input type="text" name="audit_redactKeys" value="${esc((audit.redactKeys || []).join(', '))}" placeholder="custom_secret" style="font-family:monospace;font-size:12px">
            </div>
          </div>

          <!-- Rate Limiting -->
          <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
            <div style="font-size:15px;font-weight:600;margin-bottom:4px">Rate Limiting</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Per-agent, per-tool rate limits using token bucket algorithm.</div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="rl_enabled" ${rl.enabled !== false ? 'checked' : ''}>
                <span style="font-size:13px">Enable rate limiting</span>
              </label>
            </div>
          </div>

          <!-- Circuit Breaker -->
          <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
            <div style="font-size:15px;font-weight:600;margin-bottom:4px">Circuit Breaker</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Stops calling failing tools after consecutive failures.</div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="cb_enabled" ${cb.enabled !== false ? 'checked' : ''}>
                <span style="font-size:13px">Enable circuit breaker</span>
              </label>
            </div>
          </div>

          <!-- Telemetry -->
          <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
            <div style="font-size:15px;font-weight:600;margin-bottom:4px">Telemetry</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Collects execution timing, counters, and output size metrics.</div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="tel_enabled" ${tel.enabled !== false ? 'checked' : ''}>
                <span style="font-size:13px">Enable telemetry collection</span>
              </label>
            </div>
          </div>
        </div>

        <button class="btn btn-primary" type="submit">Save Tool Security Settings</button>
      </form>
    </div>

    <div class="card" style="margin-top:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div>
          <div style="display:flex;align-items:center;gap:0">
            <h3 style="margin:0">Network &amp; Firewall</h3>
            <button class="settings-help-btn" onclick="toggleSettingsHelp('network')" title="Learn more">?</button>
          </div>
          <p style="margin:4px 0 0;font-size:13px;color:var(--text-muted)">IP access control, egress filtering, proxy settings, and network security policies.</p>
        </div>
      </div>
      <div id="help-network" class="settings-help-panel">
        <p>Controls who can access your AgenticMail instance and what agents can reach on the internet.</p>
        <h4>IP Access Control</h4>
        <p>Restricts which IPs can reach the dashboard and APIs. Allowlist = only listed IPs connect. Blocklist = all except blocked IPs.</p>
        <h4>Outbound Egress</h4>
        <p>Controls which external hosts/ports agents can reach. Allowlist = only approved hosts. Blocklist = everything except blocked hosts.</p>
        <h4>Proxy &amp; Trusted Proxies</h4>
        <ul>
          <li><strong>Proxy Config</strong> &mdash; HTTP/HTTPS proxy URLs for outbound access. &ldquo;No-Proxy&rdquo; bypasses the proxy.</li>
          <li><strong>Trusted Proxies</strong> &mdash; IPs of your load balancers/reverse proxies, so IP access control sees real client IPs.</li>
        </ul>
        <h4>Network Settings</h4>
        <ul>
          <li><strong>CORS Origins</strong> &mdash; Which websites can make API calls to AgenticMail. Empty = allow all.</li>
          <li><strong>Rate Limiting</strong> &mdash; Limits API requests per IP per minute. Protects against abuse.</li>
          <li><strong>HTTPS Enforcement</strong> &mdash; Forces encrypted connections. Recommended for production.</li>
          <li><strong>Security Headers</strong> &mdash; Browser security: HSTS, X-Frame-Options, Content-Type-Options.</li>
        </ul>
      </div>
      <form method="post" action="/settings/firewall">

        <!-- IP Access Control -->
        <h4 style="font-size:14px;font-weight:600;color:var(--text-muted);margin:16px 0 12px;text-transform:uppercase;letter-spacing:0.05em">IP Access Control</h4>
        <div style="border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px">
          <div class="form-group" style="margin-bottom:8px">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" name="ip_enabled" ${ipAccess.enabled ? 'checked' : ''}>
              <span style="font-size:13px">Enable IP access control</span>
            </label>
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Mode</label>
            <select name="ip_mode" style="width:250px">
              <option value="allowlist" ${(ipAccess.mode || 'allowlist') === 'allowlist' ? 'selected' : ''}>Allowlist (only allow listed IPs)</option>
              <option value="blocklist" ${ipAccess.mode === 'blocklist' ? 'selected' : ''}>Blocklist (block listed IPs)</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group" style="margin-bottom:8px">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Allowlist IPs/CIDRs (comma-separated)</label>
              <input type="text" name="ip_allowlist" value="${esc((ipAccess.allowlist || []).join(', '))}" placeholder="10.0.0.0/8, 192.168.1.0/24" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Blocklist IPs/CIDRs (comma-separated)</label>
              <input type="text" name="ip_blocklist" value="${esc((ipAccess.blocklist || []).join(', '))}" placeholder="203.0.113.0/24" style="font-family:monospace;font-size:12px">
            </div>
          </div>
          <div class="form-group">
            <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Bypass Paths (comma-separated)</label>
            <input type="text" name="ip_bypassPaths" value="${esc((ipAccess.bypassPaths || []).join(', '))}" placeholder="/health, /ready" style="font-family:monospace;font-size:12px">
          </div>
        </div>

        <!-- Outbound Egress -->
        <h4 style="font-size:14px;font-weight:600;color:var(--text-muted);margin:16px 0 12px;text-transform:uppercase;letter-spacing:0.05em">Outbound Egress</h4>
        <div style="border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px">
          <div class="form-group" style="margin-bottom:8px">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" name="egress_enabled" ${egress.enabled ? 'checked' : ''}>
              <span style="font-size:13px">Enable egress filtering</span>
            </label>
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Mode</label>
            <select name="egress_mode" style="width:250px">
              <option value="blocklist" ${(egress.mode || 'blocklist') === 'blocklist' ? 'selected' : ''}>Blocklist (block listed hosts)</option>
              <option value="allowlist" ${egress.mode === 'allowlist' ? 'selected' : ''}>Allowlist (only allow listed hosts)</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group" style="margin-bottom:8px">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Allowed Hosts (comma-separated)</label>
              <input type="text" name="egress_allowedHosts" value="${esc((egress.allowedHosts || []).join(', '))}" placeholder="api.example.com" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Blocked Hosts (comma-separated)</label>
              <input type="text" name="egress_blockedHosts" value="${esc((egress.blockedHosts || []).join(', '))}" placeholder="evil.com" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Allowed Ports (comma-separated)</label>
              <input type="text" name="egress_allowedPorts" value="${esc((egress.allowedPorts || []).join(', '))}" placeholder="80, 443" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Blocked Ports (comma-separated)</label>
              <input type="text" name="egress_blockedPorts" value="${esc((egress.blockedPorts || []).join(', '))}" placeholder="25, 445" style="font-family:monospace;font-size:12px">
            </div>
          </div>
        </div>

        <!-- Proxy & Trusted Proxies -->
        <h4 style="font-size:14px;font-weight:600;color:var(--text-muted);margin:16px 0 12px;text-transform:uppercase;letter-spacing:0.05em">Proxy &amp; Trusted Proxies</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          <!-- Proxy Settings -->
          <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
            <div style="font-size:15px;font-weight:600;margin-bottom:4px">Proxy Settings</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Configure outbound proxy for agent HTTP requests.</div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">HTTP Proxy</label>
              <input type="text" name="proxy_http" value="${esc(proxy.httpProxy || '')}" placeholder="http://proxy:8080" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">HTTPS Proxy</label>
              <input type="text" name="proxy_https" value="${esc(proxy.httpsProxy || '')}" placeholder="http://proxy:8443" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">No-Proxy Hosts (comma-separated)</label>
              <input type="text" name="proxy_noProxy" value="${esc((proxy.noProxy || []).join(', '))}" placeholder="localhost, 127.0.0.1" style="font-family:monospace;font-size:12px">
            </div>
          </div>

          <!-- Trusted Proxies -->
          <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
            <div style="font-size:15px;font-weight:600;margin-bottom:4px">Trusted Proxies</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Trust X-Forwarded-For headers from specific reverse proxies.</div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="tp_enabled" ${trustedProxies.enabled ? 'checked' : ''}>
                <span style="font-size:13px">Enable trusted proxies</span>
              </label>
            </div>
            <div class="form-group">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Trusted Proxy IPs/CIDRs (comma-separated)</label>
              <input type="text" name="tp_ips" value="${esc((trustedProxies.ips || []).join(', '))}" placeholder="10.0.0.1, 172.16.0.0/12" style="font-family:monospace;font-size:12px">
            </div>
          </div>
        </div>

        <!-- Network Settings -->
        <h4 style="font-size:14px;font-weight:600;color:var(--text-muted);margin:16px 0 12px;text-transform:uppercase;letter-spacing:0.05em">Network Settings</h4>

        <!-- CORS -->
        <div style="border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px">
          <div style="font-size:15px;font-weight:600;margin-bottom:4px">CORS Origins</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Allowed origins for Cross-Origin Resource Sharing.</div>
          <div class="form-group">
            <input type="text" name="net_corsOrigins" value="${esc((network.corsOrigins || []).join(', '))}" placeholder="https://app.example.com, https://admin.example.com" style="font-family:monospace;font-size:12px">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          <!-- Rate Limiting -->
          <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
            <div style="font-size:15px;font-weight:600;margin-bottom:4px">Rate Limiting</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Limit incoming requests per minute.</div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="net_rl_enabled" ${rateLimit.enabled !== false ? 'checked' : ''}>
                <span style="font-size:13px">Enable rate limiting</span>
              </label>
            </div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Requests Per Minute</label>
              <input type="number" name="net_rl_rpm" value="${esc(String(rateLimit.requestsPerMinute || 120))}" style="width:150px">
            </div>
            <div class="form-group">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Skip Paths (comma-separated)</label>
              <input type="text" name="net_rl_skipPaths" value="${esc((rateLimit.skipPaths || []).join(', '))}" placeholder="/health, /ready" style="font-family:monospace;font-size:12px">
            </div>
          </div>

          <!-- HTTPS Enforcement -->
          <div style="border:1px solid var(--border);border-radius:8px;padding:16px">
            <div style="font-size:15px;font-weight:600;margin-bottom:4px">HTTPS Enforcement</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Redirect HTTP to HTTPS and enforce secure connections.</div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="net_https_enabled" ${httpsEnf.enabled ? 'checked' : ''}>
                <span style="font-size:13px">Enable HTTPS enforcement</span>
              </label>
            </div>
            <div class="form-group">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Exclude Paths (comma-separated)</label>
              <input type="text" name="net_https_excludePaths" value="${esc((httpsEnf.excludePaths || []).join(', '))}" placeholder="/health, /ready" style="font-family:monospace;font-size:12px">
            </div>
          </div>
        </div>

        <!-- Security Headers -->
        <div style="border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px">
          <div style="font-size:15px;font-weight:600;margin-bottom:4px">Security Headers</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">HTTP response security headers applied to all responses.</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group" style="margin-bottom:8px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="sh_hsts" ${secHeaders.hsts !== false ? 'checked' : ''}>
                <span style="font-size:13px">Enable HSTS</span>
              </label>
            </div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">HSTS Max-Age (seconds)</label>
              <input type="number" name="sh_hstsMaxAge" value="${esc(String(secHeaders.hstsMaxAge || 31536000))}" style="width:150px">
            </div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">X-Frame-Options</label>
              <select name="sh_xFrameOptions" style="width:250px">
                <option value="DENY" ${(secHeaders.xFrameOptions || 'DENY') === 'DENY' ? 'selected' : ''}>DENY</option>
                <option value="SAMEORIGIN" ${secHeaders.xFrameOptions === 'SAMEORIGIN' ? 'selected' : ''}>SAMEORIGIN</option>
                <option value="" ${secHeaders.xFrameOptions === '' ? 'selected' : ''}>Disabled</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="sh_xContentTypeOptions" ${secHeaders.xContentTypeOptions !== false ? 'checked' : ''}>
                <span style="font-size:13px">X-Content-Type-Options: nosniff</span>
              </label>
            </div>
            <div class="form-group" style="margin-bottom:8px">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Referrer-Policy</label>
              <select name="sh_referrerPolicy" style="width:250px">
                <option value="strict-origin-when-cross-origin" ${(secHeaders.referrerPolicy || 'strict-origin-when-cross-origin') === 'strict-origin-when-cross-origin' ? 'selected' : ''}>strict-origin-when-cross-origin</option>
                <option value="no-referrer" ${secHeaders.referrerPolicy === 'no-referrer' ? 'selected' : ''}>no-referrer</option>
                <option value="same-origin" ${secHeaders.referrerPolicy === 'same-origin' ? 'selected' : ''}>same-origin</option>
                <option value="origin" ${secHeaders.referrerPolicy === 'origin' ? 'selected' : ''}>origin</option>
              </select>
            </div>
            <div class="form-group">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Permissions-Policy</label>
              <input type="text" name="sh_permissionsPolicy" value="${esc(secHeaders.permissionsPolicy || '')}" placeholder="camera=(), microphone=(), geolocation=()" style="font-family:monospace;font-size:12px">
            </div>
          </div>
        </div>

        <button class="btn btn-primary" type="submit">Save Network &amp; Firewall Settings</button>
      </form>
    </div>
    <div class="card" style="margin-top:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div>
          <div style="display:flex;align-items:center;gap:0">
            <h3 style="margin:0">Model Pricing</h3>
            <button class="settings-help-btn" onclick="toggleSettingsHelp('model-pricing')" title="Learn more">?</button>
          </div>
          <p style="margin:4px 0 0;font-size:13px;color:var(--text-muted)">Configure token costs per model for accurate budget tracking and cost reporting. Costs are in USD per 1 million tokens.</p>
        </div>
      </div>
      <div id="help-model-pricing" class="settings-help-panel">
        <p>Model Pricing controls how token costs are calculated for each AI model your agents use.</p>
        <h4>Cost Fields</h4>
        <ul>
          <li><strong>Input Cost/1M</strong> &mdash; The cost in USD per 1 million input (prompt) tokens.</li>
          <li><strong>Output Cost/1M</strong> &mdash; The cost in USD per 1 million output (completion) tokens.</li>
          <li><strong>Context Window</strong> &mdash; The maximum number of tokens the model supports.</li>
        </ul>
        <p>These costs are used for budget tracking, cost alerts, and usage reports across all agents.</p>
      </div>

      ${Object.keys(mpProviders).length === 0 ? `
        <div style="padding:32px;text-align:center;color:var(--text-muted)">
          <p>No model pricing configured. Default pricing will be used for cost tracking.</p>
        </div>
      ` : Object.keys(mpProviders).sort().map(function(provider) {
        var label = providerLabels[provider] || provider;
        var rows = mpProviders[provider];
        return `
          <h4 style="font-size:14px;font-weight:600;color:var(--text-muted);margin:16px 0 12px;text-transform:uppercase;letter-spacing:0.05em">${esc(label)}</h4>
          <div class="table-wrap" style="margin-bottom:16px">
            <table>
              <thead>
                <tr>
                  <th style="padding:8px 12px">Model</th>
                  <th style="padding:8px 12px;text-align:right">Input $/1M</th>
                  <th style="padding:8px 12px;text-align:right">Output $/1M</th>
                  <th style="padding:8px 12px;text-align:right">Context</th>
                  <th style="padding:8px 12px;width:60px"></th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(function(m, i) {
                  var globalIdx = mpModels.indexOf(m);
                  var ctx = m.contextWindow ? (m.contextWindow >= 1000000 ? (m.contextWindow / 1000000) + 'M' : Math.round(m.contextWindow / 1000) + 'K') : '\u2014';
                  return `<tr>
                    <td style="padding:8px 12px"><strong>${esc(m.displayName || m.modelId)}</strong><br><span style="font-size:12px;color:var(--text-muted)">${esc(m.modelId)}</span></td>
                    <td style="padding:8px 12px;text-align:right;font-family:monospace">$${esc(String(m.inputCostPerMillion || 0))}</td>
                    <td style="padding:8px 12px;text-align:right;font-family:monospace">$${esc(String(m.outputCostPerMillion || 0))}</td>
                    <td style="padding:8px 12px;text-align:right;font-size:13px;color:var(--text-muted)">${ctx}</td>
                    <td style="padding:8px 12px;text-align:center">
                      <form method="post" action="/settings/model-pricing/delete" style="display:inline">
                        <input type="hidden" name="model_index" value="${globalIdx}">
                        <button type="submit" class="btn btn-danger" style="padding:2px 8px;font-size:12px" title="Remove model">&times;</button>
                      </form>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }).join('')}

      ${mpModels.length > 0 ? `<div style="font-size:13px;color:var(--text-muted);margin-bottom:16px">${mpModels.length} model(s) configured across ${Object.keys(mpProviders).length} provider(s)${mpCfg.updatedAt ? ' &mdash; Last updated: ' + new Date(mpCfg.updatedAt).toLocaleString() : ''}</div>` : ''}

      <h4 style="font-size:14px;font-weight:600;color:var(--text-muted);margin:16px 0 12px;text-transform:uppercase;letter-spacing:0.05em">Add New Model</h4>
      <form method="post" action="/settings/model-pricing">
        <div style="border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Provider</label>
              <select name="mp_provider" style="width:100%">
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google">Google</option>
                <option value="deepseek">DeepSeek</option>
                <option value="xai">xAI (Grok)</option>
                <option value="mistral">Mistral</option>
                <option value="groq">Groq</option>
                <option value="together">Together</option>
                <option value="fireworks">Fireworks</option>
                <option value="moonshot">Moonshot (Kimi)</option>
                <option value="cerebras">Cerebras</option>
                <option value="openrouter">OpenRouter</option>
                <option value="ollama">Ollama (Local)</option>
                <option value="vllm">vLLM (Local)</option>
                <option value="lmstudio">LM Studio (Local)</option>
                <option value="litellm">LiteLLM (Local)</option>
                <option value="azure">Azure</option>
                <option value="aws">AWS Bedrock</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div class="form-group">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Model ID</label>
              <input type="text" name="mp_modelId" placeholder="e.g. claude-sonnet-4-5-20250929" required style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Display Name</label>
              <input type="text" name="mp_displayName" placeholder="e.g. Claude Sonnet 4.5">
            </div>
            <div class="form-group">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Context Window</label>
              <input type="number" name="mp_contextWindow" placeholder="200000">
            </div>
            <div class="form-group">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Input Cost ($ per 1M tokens)</label>
              <input type="number" name="mp_inputCost" step="0.01" placeholder="3.00" required>
            </div>
            <div class="form-group">
              <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Output Cost ($ per 1M tokens)</label>
              <input type="number" name="mp_outputCost" step="0.01" placeholder="15.00" required>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" type="submit">Add Model</button>
      </form>
    </div>
    <script>
      function toggleSettingsHelp(id) {
        var p = document.getElementById('help-' + id);
        if (p) p.classList.toggle('open');
      }
    </script>`;

  res.send(layout('settings', req.session.user, content, flash));
});

router.post('/settings', requireAuth, async (req, res) => {
  const payload = {};
  const fields = ['org_name', 'default_model', 'max_agents', 'rate_limit', 'webhook_url'];
  for (const key of fields) {
    if (req.body[key] !== undefined && req.body[key] !== '') {
      payload[key] = req.body[key];
    }
  }

  const result = await apiPatch('/api/settings', req.session.token, payload);

  if (result.status < 300) {
    req.session.flash = { message: 'Settings updated', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to update settings', type: 'danger' };
  }
  res.redirect('/settings');
});

// ─── Network & Firewall Save ─────────────────────────────────

router.post('/settings/firewall', requireAuth, async (req, res) => {
  const payload = {
    ipAccess: {
      enabled: req.body.ip_enabled === 'on',
      mode: req.body.ip_mode || 'allowlist',
      allowlist: splitComma(req.body.ip_allowlist),
      blocklist: splitComma(req.body.ip_blocklist),
      bypassPaths: splitComma(req.body.ip_bypassPaths),
    },
    egress: {
      enabled: req.body.egress_enabled === 'on',
      mode: req.body.egress_mode || 'blocklist',
      allowedHosts: splitComma(req.body.egress_allowedHosts),
      blockedHosts: splitComma(req.body.egress_blockedHosts),
      allowedPorts: splitComma(req.body.egress_allowedPorts).map(Number).filter(n => !isNaN(n)),
      blockedPorts: splitComma(req.body.egress_blockedPorts).map(Number).filter(n => !isNaN(n)),
    },
    proxy: {
      httpProxy: req.body.proxy_http || '',
      httpsProxy: req.body.proxy_https || '',
      noProxy: splitComma(req.body.proxy_noProxy),
    },
    trustedProxies: {
      enabled: req.body.tp_enabled === 'on',
      ips: splitComma(req.body.tp_ips),
    },
    network: {
      corsOrigins: splitComma(req.body.net_corsOrigins),
      rateLimit: {
        enabled: req.body.net_rl_enabled === 'on',
        requestsPerMinute: parseInt(req.body.net_rl_rpm, 10) || 120,
        skipPaths: splitComma(req.body.net_rl_skipPaths),
      },
      httpsEnforcement: {
        enabled: req.body.net_https_enabled === 'on',
        excludePaths: splitComma(req.body.net_https_excludePaths),
      },
      securityHeaders: {
        hsts: req.body.sh_hsts === 'on',
        hstsMaxAge: parseInt(req.body.sh_hstsMaxAge, 10) || 31536000,
        xFrameOptions: req.body.sh_xFrameOptions || 'DENY',
        xContentTypeOptions: req.body.sh_xContentTypeOptions === 'on',
        referrerPolicy: req.body.sh_referrerPolicy || 'strict-origin-when-cross-origin',
        permissionsPolicy: req.body.sh_permissionsPolicy || '',
      },
    },
  };

  const result = await apiPut('/api/settings/firewall', req.session.token, payload);

  if (result.status < 300) {
    req.session.flash = { message: 'Network & firewall settings saved', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to save network & firewall settings', type: 'danger' };
  }
  res.redirect('/settings');
});

// ─── Model Pricing Save ─────────────────────────────────────

router.post('/settings/model-pricing', requireAuth, async (req, res) => {
  // Fetch existing pricing first
  const existing = await apiGet('/api/settings/model-pricing', req.session.token);
  const cfg = existing.status === 200 ? (existing.body.modelPricingConfig || {}) : {};
  const models = cfg.models || [];

  // Add the new model
  models.push({
    provider: req.body.mp_provider || 'custom',
    modelId: req.body.mp_modelId || '',
    displayName: req.body.mp_displayName || req.body.mp_modelId || '',
    inputCostPerMillion: parseFloat(req.body.mp_inputCost) || 0,
    outputCostPerMillion: parseFloat(req.body.mp_outputCost) || 0,
    contextWindow: parseInt(req.body.mp_contextWindow, 10) || 0,
  });

  const payload = { models: models, currency: cfg.currency || 'USD' };
  const result = await apiPut('/api/settings/model-pricing', req.session.token, payload);

  if (result.status < 300) {
    req.session.flash = { message: 'Model added to pricing config', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to add model', type: 'danger' };
  }
  res.redirect('/settings');
});

router.post('/settings/model-pricing/delete', requireAuth, async (req, res) => {
  const idx = parseInt(req.body.model_index, 10);

  // Fetch existing pricing
  const existing = await apiGet('/api/settings/model-pricing', req.session.token);
  const cfg = existing.status === 200 ? (existing.body.modelPricingConfig || {}) : {};
  const models = cfg.models || [];

  if (!isNaN(idx) && idx >= 0 && idx < models.length) {
    models.splice(idx, 1);
  }

  const payload = { models: models, currency: cfg.currency || 'USD' };
  const result = await apiPut('/api/settings/model-pricing', req.session.token, payload);

  if (result.status < 300) {
    req.session.flash = { message: 'Model removed from pricing config', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to remove model', type: 'danger' };
  }
  res.redirect('/settings');
});

// ─── Tool Security Save ──────────────────────────────────────

function splitComma(val) {
  if (!val || !val.trim()) return [];
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

router.post('/settings/tool-security', requireAuth, async (req, res) => {
  const payload = {
    security: {
      pathSandbox: {
        enabled: req.body.ps_enabled === 'on',
        allowedDirs: splitComma(req.body.ps_allowedDirs),
        blockedPatterns: splitComma(req.body.ps_blockedPatterns),
      },
      ssrf: {
        enabled: req.body.ssrf_enabled === 'on',
        allowedHosts: splitComma(req.body.ssrf_allowedHosts),
        blockedCidrs: splitComma(req.body.ssrf_blockedCidrs),
      },
      commandSanitizer: {
        enabled: req.body.cs_enabled === 'on',
        mode: req.body.cs_mode || 'blocklist',
        allowedCommands: splitComma(req.body.cs_allowedCommands),
        blockedPatterns: splitComma(req.body.cs_blockedPatterns),
      },
    },
    middleware: {
      audit: {
        enabled: req.body.audit_enabled === 'on',
        redactKeys: splitComma(req.body.audit_redactKeys),
      },
      rateLimit: {
        enabled: req.body.rl_enabled === 'on',
        overrides: {},
      },
      circuitBreaker: {
        enabled: req.body.cb_enabled === 'on',
      },
      telemetry: {
        enabled: req.body.tel_enabled === 'on',
      },
    },
  };

  const result = await apiPut('/api/settings/tool-security', req.session.token, payload);

  if (result.status < 300) {
    req.session.flash = { message: 'Tool security settings saved', type: 'success' };
  } else {
    req.session.flash = { message: (result.body && result.body.error) || 'Failed to save tool security settings', type: 'danger' };
  }
  res.redirect('/settings');
});

module.exports = router;
