<?php
/**
 * Settings Page — Form + instance info + tool security
 */
$settings = am_api('/api/settings');
$retention = am_api('/api/retention');

// Load tool security config
$toolSecRes = am_api('/api/settings/tool-security');
$toolSecConfig = $toolSecRes['toolSecurityConfig'] ?? [];
$sec = $toolSecConfig['security'] ?? ['pathSandbox' => ['enabled' => true, 'allowedDirs' => [], 'blockedPatterns' => []], 'ssrf' => ['enabled' => true, 'allowedHosts' => [], 'blockedCidrs' => []], 'commandSanitizer' => ['enabled' => true, 'mode' => 'blocklist', 'allowedCommands' => [], 'blockedPatterns' => []]];
$mw = $toolSecConfig['middleware'] ?? ['audit' => ['enabled' => true, 'redactKeys' => []], 'rateLimit' => ['enabled' => true, 'overrides' => []], 'circuitBreaker' => ['enabled' => true], 'telemetry' => ['enabled' => true]];

// Load firewall config
$fwRes = am_api('/api/settings/firewall');
$fwConfig = $fwRes['firewallConfig'] ?? $fwRes ?? [];
$fwIp = $fwConfig['ipAccess'] ?? ['enabled' => false, 'mode' => 'allowlist', 'allowlist' => [], 'blocklist' => [], 'bypassPaths' => ['/health', '/ready']];
$fwEgress = $fwConfig['egress'] ?? ['enabled' => false, 'mode' => 'blocklist', 'allowedHosts' => [], 'blockedHosts' => [], 'allowedPorts' => [], 'blockedPorts' => []];
$fwProxy = $fwConfig['proxy'] ?? ['httpProxy' => '', 'httpsProxy' => '', 'noProxy' => ['localhost', '127.0.0.1']];
$fwTp = $fwConfig['trustedProxies'] ?? ['enabled' => false, 'ips' => []];
$fwNet = $fwConfig['network'] ?? [];
$fwRl = $fwNet['rateLimit'] ?? ['enabled' => true, 'requestsPerMinute' => 120, 'skipPaths' => ['/health', '/ready']];
$fwHttps = $fwNet['httpsEnforcement'] ?? ['enabled' => false, 'excludePaths' => []];
$fwSh = $fwNet['securityHeaders'] ?? ['hsts' => true, 'hstsMaxAge' => 31536000, 'xFrameOptions' => 'DENY', 'xContentTypeOptions' => true, 'referrerPolicy' => 'strict-origin-when-cross-origin', 'permissionsPolicy' => 'camera=(), microphone=(), geolocation=()'];

// Load model pricing config
$mpRes = am_api('/api/settings/model-pricing');
$mpConfig = $mpRes['modelPricingConfig'] ?? [];
$mpModels = $mpConfig['models'] ?? [];
$mpCurrency = $mpConfig['currency'] ?? 'USD';

$settingsTab = $_GET['tab'] ?? 'general';

layout_start('Settings', 'settings');

if ($settings):
?>
  <h2 class="title">Settings</h2>
  <p class="desc">Configure your organization</p>

  <!-- Settings Tabs -->
  <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:20px">
    <a href="?page=settings&tab=general" style="padding:8px 16px;font-size:13px;font-weight:600;text-decoration:none;border-bottom:2px solid <?= $settingsTab === 'general' ? 'var(--primary)' : 'transparent' ?>;color:<?= $settingsTab === 'general' ? 'var(--primary)' : 'var(--muted)' ?>">General</a>
    <a href="?page=settings&tab=security" style="padding:8px 16px;font-size:13px;font-weight:600;text-decoration:none;border-bottom:2px solid <?= $settingsTab === 'security' ? 'var(--primary)' : 'transparent' ?>;color:<?= $settingsTab === 'security' ? 'var(--primary)' : 'var(--muted)' ?>">Tool Security</a>
    <a href="?page=settings&tab=firewall" style="padding:8px 16px;font-size:13px;font-weight:600;text-decoration:none;border-bottom:2px solid <?= $settingsTab === 'firewall' ? 'var(--primary)' : 'transparent' ?>;color:<?= $settingsTab === 'firewall' ? 'var(--primary)' : 'var(--muted)' ?>">Network &amp; Firewall</a>
    <a href="?page=settings&tab=pricing" style="padding:8px 16px;font-size:13px;font-weight:600;text-decoration:none;border-bottom:2px solid <?= $settingsTab === 'pricing' ? 'var(--primary)' : 'transparent' ?>;color:<?= $settingsTab === 'pricing' ? 'var(--primary)' : 'var(--muted)' ?>">Model Pricing</a>
  </div>

  <style>
  .settings-help-btn{background:none;border:1px solid var(--border);border-radius:50%;width:22px;height:22px;font-size:12px;font-weight:700;color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;margin-left:8px;flex-shrink:0}
  .settings-help-btn:hover{background:var(--primary);color:#fff;border-color:var(--primary)}
  .settings-help-panel{display:none;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px 20px;margin-bottom:16px;font-size:13px;line-height:1.6;color:var(--dim)}
  .settings-help-panel.open{display:block}
  .settings-help-panel h4{margin:12px 0 4px;font-size:13px;font-weight:600;color:var(--text,#333)}
  .settings-help-panel ul{margin:4px 0 8px 18px;padding:0}
  .settings-help-panel li{margin-bottom:4px}
  </style>
  <script>
  function toggleSettingsHelp(id){var p=document.getElementById('help-'+id);if(p)p.classList.toggle('open')}
  </script>

  <?php if ($settingsTab === 'general'): ?>
  <div class="card">
    <div style="display:flex;align-items:center;gap:0">
      <div class="card-t">General</div>
      <button class="settings-help-btn" onclick="toggleSettingsHelp('general')" title="Learn more">?</button>
    </div>
    <div id="help-general" class="settings-help-panel">
      <p>The General section configures your organization's identity and email delivery.</p>
      <h4>Organization</h4>
      <ul>
        <li><strong>Company Name</strong> — Appears throughout the dashboard and in emails sent by agents.</li>
        <li><strong>Domain</strong> — Your company's primary domain, used for agent email addresses.</li>
        <li><strong>Subdomain</strong> — Your unique ID on the AgenticMail cloud (subdomain.agenticmail.io).</li>
        <li><strong>Logo URL</strong> — Link to your company logo, shown in dashboard and emails.</li>
        <li><strong>Primary Color</strong> — Customizes the dashboard accent color to match your brand.</li>
      </ul>
      <h4>SMTP Configuration</h4>
      <p>Controls outgoing email delivery. Leave blank to use the default AgenticMail relay. Configure custom SMTP to send from your own mail infrastructure.</p>
    </div>
    <form method="POST" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <input type="hidden" name="action" value="save_settings">
      <div class="fg"><label class="fl">Organization Name</label><input class="input" name="name" value="<?= e($settings['name'] ?? '') ?>"></div>
      <div class="fg"><label class="fl">Domain</label><input class="input" name="domain" value="<?= e($settings['domain'] ?? '') ?>" placeholder="agents.agenticmail.io"></div>
      <div class="fg"><label class="fl">Primary Color</label><input class="input" type="color" name="primaryColor" value="<?= e($settings['primaryColor'] ?? '#e84393') ?>" style="height:38px;padding:4px"></div>
      <div></div>
      <div><button class="btn btn-p" type="submit">Save Settings</button></div>
    </form>
  </div>
  <div class="card">
    <div class="card-t">Plan</div>
    <?= badge(strtoupper($settings['plan'] ?? 'free')) ?>
    <span style="font-size:13px;color:var(--dim);margin-left:12px">Subdomain: <?= e($settings['subdomain'] ?? 'not set') ?>.agenticmail.io</span>
  </div>
  <?php if ($retention): ?>
  <div class="card">
    <div class="card-t">Data Retention</div>
    <div style="font-size:13px">
      Status: <span style="color:<?= ($retention['enabled'] ?? false) ? 'var(--success)' : 'var(--muted)' ?>"><?= ($retention['enabled'] ?? false) ? 'Enabled' : 'Disabled' ?></span><br>
      <span style="color:var(--dim)">Retain emails for <?= (int)($retention['retainDays'] ?? 365) ?> days<?= ($retention['archiveFirst'] ?? true) ? ' (archive before delete)' : '' ?></span>
    </div>
  </div>
  <?php endif; ?>

  <?php elseif ($settingsTab === 'security'): ?>
  <!-- Tool Security Settings -->
  <form method="POST" id="tool-security-form">
    <input type="hidden" name="action" value="save_tool_security">

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:0">
        <div>
          <h3 style="margin:0;font-size:18px;font-weight:600">Agent Tool Security</h3>
          <p style="margin:4px 0 0;font-size:13px;color:var(--dim)">Organization-wide defaults for all agent tools. Individual agents can override these settings.</p>
        </div>
        <button class="settings-help-btn" onclick="toggleSettingsHelp('tool-security')" title="Learn more">?</button>
      </div>
      <button class="btn btn-p" type="submit">Save Settings</button>
    </div>
    <div id="help-tool-security" class="settings-help-panel">
      <p>Tool Security controls what AI agents are allowed to do at the system level — safety guardrails that prevent agents from accessing sensitive resources.</p>
      <h4>Security Sandboxes</h4>
      <ul>
        <li><strong>Path Sandbox</strong> — Restricts which folders agents can read/write. Prevents access to sensitive files.</li>
        <li><strong>SSRF Protection</strong> — Blocks agents from reaching internal networks, cloud metadata, or private IPs.</li>
        <li><strong>Command Sanitizer</strong> — Controls which shell commands agents can execute. Blocklist blocks dangerous patterns; Allowlist only permits specified commands.</li>
      </ul>
      <h4>Middleware &amp; Observability</h4>
      <ul>
        <li><strong>Audit Logging</strong> — Records every tool action: what, when, success/failure, duration. Sensitive fields are auto-redacted.</li>
        <li><strong>Rate Limiting</strong> — Limits tool calls per minute per agent. Prevents system overload.</li>
        <li><strong>Circuit Breaker</strong> — Auto-pauses tools that keep failing (5 consecutive errors). Waits 30s before retry.</li>
        <li><strong>Telemetry</strong> — Collects performance metrics: call duration, success rates, output sizes.</li>
      </ul>
    </div>

    <!-- Security Sandboxes -->
    <div style="font-size:14px;font-weight:600;color:var(--muted);margin-bottom:12px;margin-top:8px">Security Sandboxes</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

      <!-- Path Sandbox -->
      <div class="card">
        <div class="card-t">Path Sandbox</div>
        <p style="font-size:12px;color:var(--dim);margin-bottom:16px">Controls which directories agents can read/write. Blocks path traversal and sensitive files.</p>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span style="font-size:13px;font-weight:500">Enable path sandboxing</span>
          <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
            <input type="checkbox" name="ps_enabled" <?= ($sec['pathSandbox']['enabled'] ?? true) ? 'checked' : '' ?> style="opacity:0;width:0;height:0">
            <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:<?= ($sec['pathSandbox']['enabled'] ?? true) ? 'var(--primary)' : '#ccc' ?>;border-radius:11px;transition:background 0.2s"><span style="position:absolute;top:2px;left:<?= ($sec['pathSandbox']['enabled'] ?? true) ? '20px' : '2px' ?>;width:18px;height:18px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span></span>
          </label>
        </div>
        <div class="fg" style="margin-bottom:10px">
          <label class="fl">Allowed Directories (comma-separated)</label>
          <input class="input" name="ps_allowedDirs" value="<?= e(implode(', ', $sec['pathSandbox']['allowedDirs'] ?? [])) ?>" placeholder="/path/to/allow" style="font-family:monospace;font-size:12px">
        </div>
        <div class="fg">
          <label class="fl">Blocked Patterns (comma-separated, regex)</label>
          <input class="input" name="ps_blockedPatterns" value="<?= e(implode(', ', $sec['pathSandbox']['blockedPatterns'] ?? [])) ?>" placeholder="\.env$" style="font-family:monospace;font-size:12px">
        </div>
      </div>

      <!-- SSRF Protection -->
      <div class="card">
        <div class="card-t">SSRF Protection</div>
        <p style="font-size:12px;color:var(--dim);margin-bottom:16px">Blocks agents from accessing internal networks, cloud metadata endpoints, and private IPs.</p>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span style="font-size:13px;font-weight:500">Enable SSRF protection</span>
          <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
            <input type="checkbox" name="ssrf_enabled" <?= ($sec['ssrf']['enabled'] ?? true) ? 'checked' : '' ?> style="opacity:0;width:0;height:0">
            <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:<?= ($sec['ssrf']['enabled'] ?? true) ? 'var(--primary)' : '#ccc' ?>;border-radius:11px;transition:background 0.2s"><span style="position:absolute;top:2px;left:<?= ($sec['ssrf']['enabled'] ?? true) ? '20px' : '2px' ?>;width:18px;height:18px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span></span>
          </label>
        </div>
        <div class="fg" style="margin-bottom:10px">
          <label class="fl">Allowed Hosts (comma-separated)</label>
          <input class="input" name="ssrf_allowedHosts" value="<?= e(implode(', ', $sec['ssrf']['allowedHosts'] ?? [])) ?>" placeholder="api.example.com" style="font-family:monospace;font-size:12px">
        </div>
        <div class="fg">
          <label class="fl">Blocked CIDRs (comma-separated)</label>
          <input class="input" name="ssrf_blockedCidrs" value="<?= e(implode(', ', $sec['ssrf']['blockedCidrs'] ?? [])) ?>" placeholder="10.0.0.0/8" style="font-family:monospace;font-size:12px">
        </div>
      </div>
    </div>

    <!-- Command Sanitizer (full width) -->
    <div class="card">
      <div class="card-t">Command Sanitizer</div>
      <p style="font-size:12px;color:var(--dim);margin-bottom:16px">Controls which shell commands agents can execute. Blocks dangerous patterns like rm -rf /, fork bombs, and shell injection.</p>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <span style="font-size:13px;font-weight:500">Enable command validation</span>
        <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
          <input type="checkbox" name="cs_enabled" <?= ($sec['commandSanitizer']['enabled'] ?? true) ? 'checked' : '' ?> style="opacity:0;width:0;height:0">
          <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:<?= ($sec['commandSanitizer']['enabled'] ?? true) ? 'var(--primary)' : '#ccc' ?>;border-radius:11px;transition:background 0.2s"><span style="position:absolute;top:2px;left:<?= ($sec['commandSanitizer']['enabled'] ?? true) ? '20px' : '2px' ?>;width:18px;height:18px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span></span>
        </label>
      </div>
      <div class="fg" style="margin-bottom:10px">
        <label class="fl">Mode</label>
        <select class="input" name="cs_mode" style="width:250px">
          <option value="blocklist" <?= ($sec['commandSanitizer']['mode'] ?? 'blocklist') === 'blocklist' ? 'selected' : '' ?>>Blocklist (block specific patterns)</option>
          <option value="allowlist" <?= ($sec['commandSanitizer']['mode'] ?? 'blocklist') === 'allowlist' ? 'selected' : '' ?>>Allowlist (only allow specific commands)</option>
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="fg">
          <label class="fl">Allowed Commands (comma-separated)</label>
          <input class="input" name="cs_allowedCommands" value="<?= e(implode(', ', $sec['commandSanitizer']['allowedCommands'] ?? [])) ?>" placeholder="git, npm, node" style="font-family:monospace;font-size:12px">
        </div>
        <div class="fg">
          <label class="fl">Blocked Patterns (comma-separated)</label>
          <input class="input" name="cs_blockedPatterns" value="<?= e(implode(', ', $sec['commandSanitizer']['blockedPatterns'] ?? [])) ?>" placeholder="curl.*\|.*sh" style="font-family:monospace;font-size:12px">
        </div>
      </div>
    </div>

    <!-- Middleware & Observability -->
    <div style="font-size:14px;font-weight:600;color:var(--muted);margin-bottom:12px;margin-top:8px">Middleware &amp; Observability</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

      <!-- Audit Logging -->
      <div class="card">
        <div class="card-t">Audit Logging</div>
        <p style="font-size:12px;color:var(--dim);margin-bottom:16px">Logs every tool invocation with agent ID, parameters (redacted), timing, and success/failure status.</p>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span style="font-size:13px;font-weight:500">Enable audit logging</span>
          <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
            <input type="checkbox" name="audit_enabled" <?= ($mw['audit']['enabled'] ?? true) ? 'checked' : '' ?> style="opacity:0;width:0;height:0">
            <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:<?= ($mw['audit']['enabled'] ?? true) ? 'var(--primary)' : '#ccc' ?>;border-radius:11px;transition:background 0.2s"><span style="position:absolute;top:2px;left:<?= ($mw['audit']['enabled'] ?? true) ? '20px' : '2px' ?>;width:18px;height:18px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span></span>
          </label>
        </div>
        <div class="fg">
          <label class="fl">Keys to Redact (comma-separated)</label>
          <input class="input" name="audit_redactKeys" value="<?= e(implode(', ', $mw['audit']['redactKeys'] ?? [])) ?>" placeholder="custom_secret" style="font-family:monospace;font-size:12px">
        </div>
      </div>

      <!-- Rate Limiting -->
      <div class="card">
        <div class="card-t">Rate Limiting</div>
        <p style="font-size:12px;color:var(--dim);margin-bottom:16px">Per-agent, per-tool rate limits using token bucket algorithm. Prevents runaway agents from overwhelming resources.</p>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span style="font-size:13px;font-weight:500">Enable rate limiting</span>
          <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
            <input type="checkbox" name="rl_enabled" <?= ($mw['rateLimit']['enabled'] ?? true) ? 'checked' : '' ?> style="opacity:0;width:0;height:0">
            <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:<?= ($mw['rateLimit']['enabled'] ?? true) ? 'var(--primary)' : '#ccc' ?>;border-radius:11px;transition:background 0.2s"><span style="position:absolute;top:2px;left:<?= ($mw['rateLimit']['enabled'] ?? true) ? '20px' : '2px' ?>;width:18px;height:18px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span></span>
          </label>
        </div>
      </div>

      <!-- Circuit Breaker -->
      <div class="card">
        <div class="card-t">Circuit Breaker</div>
        <p style="font-size:12px;color:var(--dim);margin-bottom:16px">Auto-stops calling failing tools after consecutive failures. Opens for 30 seconds then retries.</p>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span style="font-size:13px;font-weight:500">Enable circuit breaker</span>
          <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
            <input type="checkbox" name="cb_enabled" <?= ($mw['circuitBreaker']['enabled'] ?? true) ? 'checked' : '' ?> style="opacity:0;width:0;height:0">
            <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:<?= ($mw['circuitBreaker']['enabled'] ?? true) ? 'var(--primary)' : '#ccc' ?>;border-radius:11px;transition:background 0.2s"><span style="position:absolute;top:2px;left:<?= ($mw['circuitBreaker']['enabled'] ?? true) ? '20px' : '2px' ?>;width:18px;height:18px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span></span>
          </label>
        </div>
      </div>

      <!-- Telemetry -->
      <div class="card">
        <div class="card-t">Telemetry</div>
        <p style="font-size:12px;color:var(--dim);margin-bottom:16px">Collects execution timing, success/failure counters, and output size metrics for all tool invocations.</p>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span style="font-size:13px;font-weight:500">Enable telemetry collection</span>
          <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
            <input type="checkbox" name="tel_enabled" <?= ($mw['telemetry']['enabled'] ?? true) ? 'checked' : '' ?> style="opacity:0;width:0;height:0">
            <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:<?= ($mw['telemetry']['enabled'] ?? true) ? 'var(--primary)' : '#ccc' ?>;border-radius:11px;transition:background 0.2s"><span style="position:absolute;top:2px;left:<?= ($mw['telemetry']['enabled'] ?? true) ? '20px' : '2px' ?>;width:18px;height:18px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span></span>
          </label>
        </div>
      </div>
    </div>

    <div style="margin-top:16px;display:flex;justify-content:flex-end">
      <button class="btn btn-p" type="submit">Save Tool Security Settings</button>
    </div>
  </form>

  <script>
  (function() {
    // Toggle switch visual update on change
    document.querySelectorAll('#tool-security-form input[type="checkbox"]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var track = this.parentElement.querySelector('span');
        var knob = track.querySelector('span');
        track.style.background = this.checked ? 'var(--primary)' : '#ccc';
        knob.style.left = this.checked ? '20px' : '2px';
      });
    });
  })();
  </script>

  <?php elseif ($settingsTab === 'firewall'): ?>
  <!-- Network & Firewall Settings -->
  <form method="POST" id="firewall-form">
    <input type="hidden" name="action" value="save_firewall">

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:0">
        <div>
          <h3 style="margin:0;font-size:18px;font-weight:600">Network &amp; Firewall</h3>
          <p style="margin:4px 0 0;font-size:13px;color:var(--dim)">IP access control, egress filtering, proxy configuration, and network security settings.</p>
        </div>
        <button class="settings-help-btn" onclick="toggleSettingsHelp('network-firewall')" title="Learn more">?</button>
      </div>
      <button class="btn btn-p" type="submit">Save Settings</button>
    </div>
    <div id="help-network-firewall" class="settings-help-panel">
      <p>Controls who can access your AgenticMail instance and what agents can reach on the internet.</p>
      <h4>IP Access Control</h4>
      <p>Restricts which IPs can reach the dashboard and APIs. Allowlist = only listed IPs connect. Blocklist = all except blocked IPs.</p>
      <h4>Outbound Egress</h4>
      <p>Controls which external hosts/ports agents can reach. Allowlist = only approved hosts. Blocklist = everything except blocked hosts.</p>
      <h4>Proxy &amp; Trusted Proxies</h4>
      <ul>
        <li><strong>Proxy Config</strong> — HTTP/HTTPS proxy URLs for outbound access. "No-Proxy" bypasses the proxy.</li>
        <li><strong>Trusted Proxies</strong> — IPs of your load balancers/reverse proxies, so IP access control sees real client IPs.</li>
      </ul>
      <h4>Network Settings</h4>
      <ul>
        <li><strong>CORS Origins</strong> — Which websites can make API calls to AgenticMail. Empty = allow all.</li>
        <li><strong>Rate Limiting</strong> — Limits API requests per IP per minute. Protects against abuse.</li>
        <li><strong>HTTPS Enforcement</strong> — Forces encrypted connections. Recommended for production.</li>
        <li><strong>Security Headers</strong> — Browser security: HSTS, X-Frame-Options, Content-Type-Options.</li>
      </ul>
    </div>

    <!-- IP Access Control -->
    <div style="font-size:14px;font-weight:600;color:var(--muted);margin-bottom:12px;margin-top:8px">IP Access Control</div>
    <div class="card">
      <div class="card-t">IP Access Control</div>
      <p style="font-size:12px;color:var(--dim);margin-bottom:16px">Control which IP addresses can access your instance. Use CIDRs for network ranges.</p>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <span style="font-size:13px;font-weight:500">Enable IP access control</span>
        <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
          <input type="checkbox" name="fw_ip_enabled" <?= ($fwIp['enabled'] ?? false) ? 'checked' : '' ?> style="opacity:0;width:0;height:0">
          <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:<?= ($fwIp['enabled'] ?? false) ? 'var(--primary)' : '#ccc' ?>;border-radius:11px;transition:background 0.2s"><span style="position:absolute;top:2px;left:<?= ($fwIp['enabled'] ?? false) ? '20px' : '2px' ?>;width:18px;height:18px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span></span>
        </label>
      </div>
      <div class="fg" style="margin-bottom:10px">
        <label class="fl">Mode</label>
        <select class="input" name="fw_ip_mode" style="width:250px">
          <option value="allowlist" <?= ($fwIp['mode'] ?? 'allowlist') === 'allowlist' ? 'selected' : '' ?>>Allowlist</option>
          <option value="blocklist" <?= ($fwIp['mode'] ?? 'allowlist') === 'blocklist' ? 'selected' : '' ?>>Blocklist</option>
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="fg">
          <label class="fl">Allowlist CIDRs (comma-separated)</label>
          <input class="input" name="fw_ip_allowlist" value="<?= e(implode(', ', $fwIp['allowlist'] ?? [])) ?>" placeholder="10.0.0.0/8, 192.168.1.0/24" style="font-family:monospace;font-size:12px">
        </div>
        <div class="fg">
          <label class="fl">Blocklist CIDRs (comma-separated)</label>
          <input class="input" name="fw_ip_blocklist" value="<?= e(implode(', ', $fwIp['blocklist'] ?? [])) ?>" placeholder="0.0.0.0/0" style="font-family:monospace;font-size:12px">
        </div>
      </div>
      <div class="fg" style="margin-top:10px">
        <label class="fl">Bypass Paths (comma-separated)</label>
        <input class="input" name="fw_ip_bypass_paths" value="<?= e(implode(', ', $fwIp['bypassPaths'] ?? [])) ?>" placeholder="/health, /ready" style="font-family:monospace;font-size:12px">
      </div>
    </div>

    <!-- Outbound Egress -->
    <div style="font-size:14px;font-weight:600;color:var(--muted);margin-bottom:12px;margin-top:8px">Outbound Egress</div>
    <div class="card">
      <div class="card-t">Egress Filtering</div>
      <p style="font-size:12px;color:var(--dim);margin-bottom:16px">Control outbound network connections from your instance. Restrict which hosts and ports agents can reach.</p>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <span style="font-size:13px;font-weight:500">Enable egress filtering</span>
        <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
          <input type="checkbox" name="fw_egress_enabled" <?= ($fwEgress['enabled'] ?? false) ? 'checked' : '' ?> style="opacity:0;width:0;height:0">
          <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:<?= ($fwEgress['enabled'] ?? false) ? 'var(--primary)' : '#ccc' ?>;border-radius:11px;transition:background 0.2s"><span style="position:absolute;top:2px;left:<?= ($fwEgress['enabled'] ?? false) ? '20px' : '2px' ?>;width:18px;height:18px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span></span>
        </label>
      </div>
      <div class="fg" style="margin-bottom:10px">
        <label class="fl">Mode</label>
        <select class="input" name="fw_egress_mode" style="width:250px">
          <option value="blocklist" <?= ($fwEgress['mode'] ?? 'blocklist') === 'blocklist' ? 'selected' : '' ?>>Blocklist</option>
          <option value="allowlist" <?= ($fwEgress['mode'] ?? 'blocklist') === 'allowlist' ? 'selected' : '' ?>>Allowlist</option>
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="fg">
          <label class="fl">Allowed Hosts (comma-separated)</label>
          <input class="input" name="fw_egress_allowed_hosts" value="<?= e(implode(', ', $fwEgress['allowedHosts'] ?? [])) ?>" placeholder="api.example.com" style="font-family:monospace;font-size:12px">
        </div>
        <div class="fg">
          <label class="fl">Blocked Hosts (comma-separated)</label>
          <input class="input" name="fw_egress_blocked_hosts" value="<?= e(implode(', ', $fwEgress['blockedHosts'] ?? [])) ?>" placeholder="evil.com" style="font-family:monospace;font-size:12px">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:10px">
        <div class="fg">
          <label class="fl">Allowed Ports (comma-separated)</label>
          <input class="input" name="fw_egress_allowed_ports" value="<?= e(implode(', ', $fwEgress['allowedPorts'] ?? [])) ?>" placeholder="80, 443" style="font-family:monospace;font-size:12px">
        </div>
        <div class="fg">
          <label class="fl">Blocked Ports (comma-separated)</label>
          <input class="input" name="fw_egress_blocked_ports" value="<?= e(implode(', ', $fwEgress['blockedPorts'] ?? [])) ?>" placeholder="25, 587" style="font-family:monospace;font-size:12px">
        </div>
      </div>
    </div>

    <!-- Proxy -->
    <div style="font-size:14px;font-weight:600;color:var(--muted);margin-bottom:12px;margin-top:8px">Proxy</div>
    <div class="card">
      <div class="card-t">Proxy Configuration</div>
      <p style="font-size:12px;color:var(--dim);margin-bottom:16px">Configure HTTP/HTTPS proxy settings for outbound requests.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="fg">
          <label class="fl">HTTP Proxy</label>
          <input class="input" name="fw_proxy_http" value="<?= e($fwProxy['httpProxy'] ?? '') ?>" placeholder="http://proxy.example.com:8080" style="font-family:monospace;font-size:12px">
        </div>
        <div class="fg">
          <label class="fl">HTTPS Proxy</label>
          <input class="input" name="fw_proxy_https" value="<?= e($fwProxy['httpsProxy'] ?? '') ?>" placeholder="https://proxy.example.com:8443" style="font-family:monospace;font-size:12px">
        </div>
      </div>
      <div class="fg" style="margin-top:10px">
        <label class="fl">No-Proxy Hosts (comma-separated)</label>
        <input class="input" name="fw_proxy_no_proxy" value="<?= e(implode(', ', $fwProxy['noProxy'] ?? [])) ?>" placeholder="localhost, 127.0.0.1" style="font-family:monospace;font-size:12px">
      </div>
    </div>

    <!-- Trusted Proxies -->
    <div style="font-size:14px;font-weight:600;color:var(--muted);margin-bottom:12px;margin-top:8px">Trusted Proxies</div>
    <div class="card">
      <div class="card-t">Trusted Proxies</div>
      <p style="font-size:12px;color:var(--dim);margin-bottom:16px">Specify trusted reverse proxy IPs/CIDRs to correctly resolve client addresses.</p>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <span style="font-size:13px;font-weight:500">Enable trusted proxies</span>
        <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
          <input type="checkbox" name="fw_tp_enabled" <?= ($fwTp['enabled'] ?? false) ? 'checked' : '' ?> style="opacity:0;width:0;height:0">
          <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:<?= ($fwTp['enabled'] ?? false) ? 'var(--primary)' : '#ccc' ?>;border-radius:11px;transition:background 0.2s"><span style="position:absolute;top:2px;left:<?= ($fwTp['enabled'] ?? false) ? '20px' : '2px' ?>;width:18px;height:18px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span></span>
        </label>
      </div>
      <div class="fg">
        <label class="fl">Proxy IPs / CIDRs (comma-separated)</label>
        <input class="input" name="fw_tp_ips" value="<?= e(implode(', ', $fwTp['ips'] ?? [])) ?>" placeholder="10.0.0.1, 172.16.0.0/12" style="font-family:monospace;font-size:12px">
      </div>
    </div>

    <!-- Network Settings -->
    <div style="font-size:14px;font-weight:600;color:var(--muted);margin-bottom:12px;margin-top:8px">Network Settings</div>
    <div class="card">
      <div class="card-t">CORS &amp; Rate Limiting</div>
      <div class="fg" style="margin-bottom:10px">
        <label class="fl">CORS Origins (comma-separated)</label>
        <input class="input" name="fw_cors_origins" value="<?= e(implode(', ', $fwNet['corsOrigins'] ?? [])) ?>" placeholder="https://app.example.com" style="font-family:monospace;font-size:12px">
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <span style="font-size:13px;font-weight:500">Enable rate limiting</span>
        <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
          <input type="checkbox" name="fw_rl_enabled" <?= ($fwRl['enabled'] ?? true) ? 'checked' : '' ?> style="opacity:0;width:0;height:0">
          <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:<?= ($fwRl['enabled'] ?? true) ? 'var(--primary)' : '#ccc' ?>;border-radius:11px;transition:background 0.2s"><span style="position:absolute;top:2px;left:<?= ($fwRl['enabled'] ?? true) ? '20px' : '2px' ?>;width:18px;height:18px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span></span>
        </label>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="fg">
          <label class="fl">Requests per Minute</label>
          <input class="input" type="number" name="fw_rl_rpm" value="<?= (int)($fwRl['requestsPerMinute'] ?? 120) ?>" placeholder="120">
        </div>
        <div class="fg">
          <label class="fl">Skip Paths (comma-separated)</label>
          <input class="input" name="fw_rl_skip_paths" value="<?= e(implode(', ', $fwRl['skipPaths'] ?? [])) ?>" placeholder="/health, /ready" style="font-family:monospace;font-size:12px">
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-t">HTTPS Enforcement</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <span style="font-size:13px;font-weight:500">Enforce HTTPS</span>
        <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
          <input type="checkbox" name="fw_https_enabled" <?= ($fwHttps['enabled'] ?? false) ? 'checked' : '' ?> style="opacity:0;width:0;height:0">
          <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:<?= ($fwHttps['enabled'] ?? false) ? 'var(--primary)' : '#ccc' ?>;border-radius:11px;transition:background 0.2s"><span style="position:absolute;top:2px;left:<?= ($fwHttps['enabled'] ?? false) ? '20px' : '2px' ?>;width:18px;height:18px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span></span>
        </label>
      </div>
      <div class="fg">
        <label class="fl">Exclude Paths (comma-separated)</label>
        <input class="input" name="fw_https_exclude_paths" value="<?= e(implode(', ', $fwHttps['excludePaths'] ?? [])) ?>" placeholder="/health, /ready" style="font-family:monospace;font-size:12px">
      </div>
    </div>

    <div class="card">
      <div class="card-t">Security Headers</div>
      <p style="font-size:12px;color:var(--dim);margin-bottom:16px">HTTP security headers applied to all responses.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:13px;font-weight:500">HSTS</span>
          <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
            <input type="checkbox" name="fw_hsts_enabled" <?= ($fwSh['hsts'] ?? true) ? 'checked' : '' ?> style="opacity:0;width:0;height:0">
            <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:<?= ($fwSh['hsts'] ?? true) ? 'var(--primary)' : '#ccc' ?>;border-radius:11px;transition:background 0.2s"><span style="position:absolute;top:2px;left:<?= ($fwSh['hsts'] ?? true) ? '20px' : '2px' ?>;width:18px;height:18px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span></span>
          </label>
        </div>
        <div class="fg">
          <label class="fl">HSTS Max-Age (seconds)</label>
          <input class="input" type="number" name="fw_hsts_max_age" value="<?= (int)($fwSh['hstsMaxAge'] ?? 31536000) ?>" placeholder="31536000">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px">
        <div class="fg">
          <label class="fl">X-Frame-Options</label>
          <select class="input" name="fw_x_frame_options">
            <option value="DENY" <?= ($fwSh['xFrameOptions'] ?? 'DENY') === 'DENY' ? 'selected' : '' ?>>DENY</option>
            <option value="SAMEORIGIN" <?= ($fwSh['xFrameOptions'] ?? 'DENY') === 'SAMEORIGIN' ? 'selected' : '' ?>>SAMEORIGIN</option>
          </select>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:13px;font-weight:500">X-Content-Type-Options: nosniff</span>
          <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
            <input type="checkbox" name="fw_xcto_enabled" <?= ($fwSh['xContentTypeOptions'] ?? true) ? 'checked' : '' ?> style="opacity:0;width:0;height:0">
            <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:<?= ($fwSh['xContentTypeOptions'] ?? true) ? 'var(--primary)' : '#ccc' ?>;border-radius:11px;transition:background 0.2s"><span style="position:absolute;top:2px;left:<?= ($fwSh['xContentTypeOptions'] ?? true) ? '20px' : '2px' ?>;width:18px;height:18px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span></span>
          </label>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="fg">
          <label class="fl">Referrer-Policy</label>
          <input class="input" name="fw_referrer_policy" value="<?= e($fwSh['referrerPolicy'] ?? 'strict-origin-when-cross-origin') ?>" placeholder="strict-origin-when-cross-origin" style="font-family:monospace;font-size:12px">
        </div>
        <div class="fg">
          <label class="fl">Permissions-Policy</label>
          <input class="input" name="fw_permissions_policy" value="<?= e($fwSh['permissionsPolicy'] ?? 'camera=(), microphone=(), geolocation=()') ?>" placeholder="camera=(), microphone=(), geolocation=()" style="font-family:monospace;font-size:12px">
        </div>
      </div>
    </div>

    <div style="margin-top:16px;display:flex;justify-content:flex-end">
      <button class="btn btn-p" type="submit">Save Network &amp; Firewall Settings</button>
    </div>
  </form>

  <script>
  (function() {
    document.querySelectorAll('#firewall-form input[type="checkbox"]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var track = this.parentElement.querySelector('span');
        var knob = track.querySelector('span');
        track.style.background = this.checked ? 'var(--primary)' : '#ccc';
        knob.style.left = this.checked ? '20px' : '2px';
      });
    });
  })();
  </script>

  <?php elseif ($settingsTab === 'pricing'): ?>
  <!-- Model Pricing Settings -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <div style="display:flex;align-items:center;gap:0">
      <div>
        <h3 style="margin:0;font-size:18px;font-weight:600">Model Pricing</h3>
        <p style="margin:4px 0 0;font-size:13px;color:var(--dim)">Configure per-model token costs for budget tracking and cost estimation. Currency: <?= e($mpCurrency) ?></p>
      </div>
      <button class="settings-help-btn" onclick="toggleSettingsHelp('model-pricing')" title="Learn more">?</button>
    </div>
  </div>
  <div id="help-model-pricing" class="settings-help-panel">
    <p>Model Pricing lets you define input/output token costs per model so AgenticMail can estimate spend per agent, per conversation, and across your organization.</p>
    <h4>How it works</h4>
    <ul>
      <li><strong>Input Cost</strong> — Cost per 1 million input tokens sent to the model.</li>
      <li><strong>Output Cost</strong> — Cost per 1 million output tokens generated by the model.</li>
      <li><strong>Context Window</strong> — Maximum token capacity of the model (used for budget guardrails).</li>
    </ul>
    <p>Costs are used by the budget system to estimate and enforce per-agent spending limits.</p>
  </div>

  <!-- Existing Models Table -->
  <?php
  // Group models by provider
  $byProvider = [];
  foreach ($mpModels as $m) {
      $prov = $m['provider'] ?? 'unknown';
      $byProvider[$prov][] = $m;
  }
  ksort($byProvider);
  ?>

  <?php if (empty($mpModels)): ?>
  <div class="card">
    <p style="color:var(--dim);font-size:13px;text-align:center;padding:24px 0">No model pricing configured yet. Add your first model below.</p>
  </div>
  <?php else: ?>
  <?php foreach ($byProvider as $provName => $provModels): ?>
  <div class="card">
    <div class="card-t" style="text-transform:capitalize"><?= e($provName) ?></div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="border-bottom:1px solid var(--border);text-align:left">
            <th style="padding:8px 12px;font-weight:600;color:var(--dim)">Model</th>
            <th style="padding:8px 12px;font-weight:600;color:var(--dim)">Display Name</th>
            <th style="padding:8px 12px;font-weight:600;color:var(--dim);text-align:right">Input $/1M</th>
            <th style="padding:8px 12px;font-weight:600;color:var(--dim);text-align:right">Output $/1M</th>
            <th style="padding:8px 12px;font-weight:600;color:var(--dim);text-align:right">Context Window</th>
            <th style="padding:8px 12px;font-weight:600;color:var(--dim);text-align:center">Actions</th>
          </tr>
        </thead>
        <tbody>
        <?php foreach ($provModels as $idx => $model): ?>
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 12px;font-family:monospace;font-size:12px"><?= e($model['modelId'] ?? '') ?></td>
            <td style="padding:8px 12px"><?= e($model['displayName'] ?? '') ?></td>
            <td style="padding:8px 12px;text-align:right;font-family:monospace"><?= number_format((float)($model['inputCostPerMillion'] ?? 0), 2) ?></td>
            <td style="padding:8px 12px;text-align:right;font-family:monospace"><?= number_format((float)($model['outputCostPerMillion'] ?? 0), 2) ?></td>
            <td style="padding:8px 12px;text-align:right;font-family:monospace"><?= number_format((int)($model['contextWindow'] ?? 0)) ?></td>
            <td style="padding:8px 12px;text-align:center">
              <form method="POST" style="display:inline" onsubmit="return confirm('Remove this model from pricing?')">
                <input type="hidden" name="action" value="delete_model_pricing">
                <input type="hidden" name="mp_delete_provider" value="<?= e($model['provider'] ?? '') ?>">
                <input type="hidden" name="mp_delete_model_id" value="<?= e($model['modelId'] ?? '') ?>">
                <button type="submit" style="background:none;border:none;color:var(--danger,#e74c3c);cursor:pointer;font-size:13px;padding:4px 8px" title="Remove model">&#10005;</button>
              </form>
            </td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  </div>
  <?php endforeach; ?>
  <?php endif; ?>

  <!-- Add Model Form -->
  <div class="card">
    <div class="card-t">Add Model</div>
    <form method="POST">
      <input type="hidden" name="action" value="save_model_pricing">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">
        <div class="fg">
          <label class="fl">Provider</label>
          <select class="input" name="mp_provider" required>
            <option value="">Select provider...</option>
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
          </select>
        </div>
        <div class="fg">
          <label class="fl">Model ID</label>
          <input class="input" name="mp_model_id" placeholder="claude-sonnet-4-20250514" required style="font-family:monospace;font-size:12px">
        </div>
        <div class="fg">
          <label class="fl">Display Name</label>
          <input class="input" name="mp_display_name" placeholder="Claude Sonnet 4">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:14px">
        <div class="fg">
          <label class="fl">Input Cost per 1M Tokens ($)</label>
          <input class="input" type="number" step="0.01" min="0" name="mp_input_cost" placeholder="3.00" required>
        </div>
        <div class="fg">
          <label class="fl">Output Cost per 1M Tokens ($)</label>
          <input class="input" type="number" step="0.01" min="0" name="mp_output_cost" placeholder="15.00" required>
        </div>
        <div class="fg">
          <label class="fl">Context Window (tokens)</label>
          <input class="input" type="number" min="0" name="mp_context_window" placeholder="200000">
        </div>
      </div>
      <div style="margin-top:16px">
        <button class="btn btn-p" type="submit">Add Model</button>
      </div>
    </form>
  </div>

  <?php endif; ?>
<?php
endif;

layout_end();
