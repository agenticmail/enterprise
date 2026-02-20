<?php
/**
 * Settings page — form to read and update settings + tool security + instance info.
 * Expects: $settings (array from API), $tab (string), $toolSecConfig (array)
 */
$skip = ['_status', '_error'];
$fields = [];
foreach ($settings as $key => $val) {
    if (in_array($key, $skip, true) || !is_scalar($val)) continue;
    $fields[] = ['key' => $key, 'value' => $val];
}

$sec = $toolSecConfig['security'] ?? ['pathSandbox' => ['enabled' => true, 'allowedDirs' => [], 'blockedPatterns' => []], 'ssrf' => ['enabled' => true, 'allowedHosts' => [], 'blockedCidrs' => []], 'commandSanitizer' => ['enabled' => true, 'mode' => 'blocklist', 'allowedCommands' => [], 'blockedPatterns' => []]];
$mw = $toolSecConfig['middleware'] ?? ['audit' => ['enabled' => true, 'redactKeys' => []], 'rateLimit' => ['enabled' => true, 'overrides' => []], 'circuitBreaker' => ['enabled' => true], 'telemetry' => ['enabled' => true]];
?>

<!-- Settings Tabs -->
<div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:20px">
    <a href="/settings?tab=general" style="padding:8px 16px;font-size:13px;font-weight:600;text-decoration:none;border-bottom:2px solid <?= $tab === 'general' ? 'var(--primary)' : 'transparent' ?>;color:<?= $tab === 'general' ? 'var(--primary)' : 'var(--text-muted)' ?>">General</a>
    <a href="/settings?tab=security" style="padding:8px 16px;font-size:13px;font-weight:600;text-decoration:none;border-bottom:2px solid <?= $tab === 'security' ? 'var(--primary)' : 'transparent' ?>;color:<?= $tab === 'security' ? 'var(--primary)' : 'var(--text-muted)' ?>">Tool Security</a>
    <a href="/settings?tab=firewall" style="padding:8px 16px;font-size:13px;font-weight:600;text-decoration:none;border-bottom:2px solid <?= $tab === 'firewall' ? 'var(--primary)' : 'transparent' ?>;color:<?= $tab === 'firewall' ? 'var(--primary)' : 'var(--text-muted)' ?>">Network &amp; Firewall</a>
    <a href="/settings?tab=pricing" style="padding:8px 16px;font-size:13px;font-weight:600;text-decoration:none;border-bottom:2px solid <?= $tab === 'pricing' ? 'var(--primary)' : 'transparent' ?>;color:<?= $tab === 'pricing' ? 'var(--primary)' : 'var(--text-muted)' ?>">Model Pricing</a>
</div>

<style>
.settings-help-btn{background:none;border:1px solid var(--border);border-radius:50%;width:22px;height:22px;font-size:12px;font-weight:700;color:var(--text-muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;margin-left:8px;flex-shrink:0}
.settings-help-btn:hover{background:var(--primary);color:#fff;border-color:var(--primary)}
.settings-help-panel{display:none;background:var(--bg-alt,#f9f9f9);border:1px solid var(--border);border-radius:8px;padding:16px 20px;margin-bottom:16px;font-size:13px;line-height:1.6;color:var(--text-muted)}
.settings-help-panel.open{display:block}
.settings-help-panel h4{margin:12px 0 4px;font-size:13px;font-weight:600;color:var(--text,#333)}
.settings-help-panel ul{margin:4px 0 8px 18px;padding:0}
.settings-help-panel li{margin-bottom:4px}
</style>
<script>
function toggleSettingsHelp(id){var p=document.getElementById('help-'+id);if(p)p.classList.toggle('open')}
</script>

<?php if ($tab === 'general'): ?>
<div class="card">
    <div style="display:flex;align-items:center;gap:0">
        <h3>Settings</h3>
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
<?php if (empty($fields)): ?>
    <p class="text-muted">No settings returned from the API, or the API is unreachable.</p>
<?php else: ?>
    <form method="post" action="/settings" class="settings-form">
<?php foreach ($fields as $field): ?>
        <div class="form-group">
            <label for="s_<?= Helpers::e($field['key']) ?>">
                <?= Helpers::e(ucwords(str_replace(['_', '-'], ' ', $field['key']))) ?>
            </label>
            <input
                id="s_<?= Helpers::e($field['key']) ?>"
                type="text"
                name="<?= Helpers::e($field['key']) ?>"
                value="<?= Helpers::e((string)$field['value']) ?>"
            >
        </div>
<?php endforeach; ?>
        <button type="submit" class="btn btn-primary">Save Changes</button>
    </form>
<?php endif; ?>
</div>

<div class="card">
    <h3>Instance Information</h3>
    <div class="table-wrap">
        <table>
            <tbody>
                <tr>
                    <td><strong>API Endpoint</strong></td>
                    <td><code><?= Helpers::e(API_BASE) ?></code></td>
                </tr>
                <tr>
                    <td><strong>Dashboard</strong></td>
                    <td>Laravel (PHP)</td>
                </tr>
                <tr>
                    <td><strong>Logged in as</strong></td>
                    <td><?= Helpers::e($_SESSION['user']['email'] ?? $_SESSION['user']['name'] ?? 'Unknown') ?></td>
                </tr>
            </tbody>
        </table>
    </div>
</div>

<?php elseif ($tab === 'security'): ?>
<!-- Tool Security Settings -->
<form method="post" action="/settings">
    <input type="hidden" name="_action" value="save_tool_security">

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:0">
            <div>
                <h3 style="margin:0;font-size:18px;font-weight:600">Agent Tool Security</h3>
                <p style="margin:4px 0 0;font-size:13px;color:var(--text-muted)">Organization-wide defaults for all agent tools. Individual agents can override these settings.</p>
            </div>
            <button class="settings-help-btn" onclick="toggleSettingsHelp('tool-security')" title="Learn more">?</button>
        </div>
        <button class="btn btn-primary" type="submit">Save Settings</button>
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
    <div style="font-size:14px;font-weight:600;color:var(--text-muted);margin-bottom:12px;margin-top:8px">Security Sandboxes</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

        <!-- Path Sandbox -->
        <div class="card">
            <h3>Path Sandbox</h3>
            <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Controls which directories agents can read/write. Blocks path traversal and sensitive files.</p>
            <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                <label style="margin:0;font-weight:500">Enable path sandboxing</label>
                <input type="checkbox" name="ps_enabled" <?= ($sec['pathSandbox']['enabled'] ?? true) ? 'checked' : '' ?>>
            </div>
            <div class="form-group">
                <label>Allowed Directories (comma-separated)</label>
                <input type="text" name="ps_allowedDirs" value="<?= Helpers::e(implode(', ', $sec['pathSandbox']['allowedDirs'] ?? [])) ?>" placeholder="/path/to/allow" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
                <label>Blocked Patterns (comma-separated, regex)</label>
                <input type="text" name="ps_blockedPatterns" value="<?= Helpers::e(implode(', ', $sec['pathSandbox']['blockedPatterns'] ?? [])) ?>" placeholder="\.env$" style="font-family:monospace;font-size:12px">
            </div>
        </div>

        <!-- SSRF Protection -->
        <div class="card">
            <h3>SSRF Protection</h3>
            <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Blocks agents from accessing internal networks, cloud metadata endpoints, and private IPs.</p>
            <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                <label style="margin:0;font-weight:500">Enable SSRF protection</label>
                <input type="checkbox" name="ssrf_enabled" <?= ($sec['ssrf']['enabled'] ?? true) ? 'checked' : '' ?>>
            </div>
            <div class="form-group">
                <label>Allowed Hosts (comma-separated)</label>
                <input type="text" name="ssrf_allowedHosts" value="<?= Helpers::e(implode(', ', $sec['ssrf']['allowedHosts'] ?? [])) ?>" placeholder="api.example.com" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
                <label>Blocked CIDRs (comma-separated)</label>
                <input type="text" name="ssrf_blockedCidrs" value="<?= Helpers::e(implode(', ', $sec['ssrf']['blockedCidrs'] ?? [])) ?>" placeholder="10.0.0.0/8" style="font-family:monospace;font-size:12px">
            </div>
        </div>
    </div>

    <!-- Command Sanitizer (full width) -->
    <div class="card">
        <h3>Command Sanitizer</h3>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Controls which shell commands agents can execute. Blocks dangerous patterns like rm -rf /, fork bombs, and shell injection.</p>
        <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
            <label style="margin:0;font-weight:500">Enable command validation</label>
            <input type="checkbox" name="cs_enabled" <?= ($sec['commandSanitizer']['enabled'] ?? true) ? 'checked' : '' ?>>
        </div>
        <div class="form-group">
            <label>Mode</label>
            <select name="cs_mode" style="width:250px">
                <option value="blocklist" <?= ($sec['commandSanitizer']['mode'] ?? 'blocklist') === 'blocklist' ? 'selected' : '' ?>>Blocklist (block specific patterns)</option>
                <option value="allowlist" <?= ($sec['commandSanitizer']['mode'] ?? 'blocklist') === 'allowlist' ? 'selected' : '' ?>>Allowlist (only allow specific commands)</option>
            </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group">
                <label>Allowed Commands (comma-separated)</label>
                <input type="text" name="cs_allowedCommands" value="<?= Helpers::e(implode(', ', $sec['commandSanitizer']['allowedCommands'] ?? [])) ?>" placeholder="git, npm, node" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
                <label>Blocked Patterns (comma-separated)</label>
                <input type="text" name="cs_blockedPatterns" value="<?= Helpers::e(implode(', ', $sec['commandSanitizer']['blockedPatterns'] ?? [])) ?>" placeholder="curl.*\|.*sh" style="font-family:monospace;font-size:12px">
            </div>
        </div>
    </div>

    <!-- Middleware & Observability -->
    <div style="font-size:14px;font-weight:600;color:var(--text-muted);margin-bottom:12px;margin-top:8px">Middleware &amp; Observability</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

        <!-- Audit Logging -->
        <div class="card">
            <h3>Audit Logging</h3>
            <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Logs every tool invocation with agent ID, parameters (redacted), timing, and success/failure status.</p>
            <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                <label style="margin:0;font-weight:500">Enable audit logging</label>
                <input type="checkbox" name="audit_enabled" <?= ($mw['audit']['enabled'] ?? true) ? 'checked' : '' ?>>
            </div>
            <div class="form-group">
                <label>Keys to Redact (comma-separated)</label>
                <input type="text" name="audit_redactKeys" value="<?= Helpers::e(implode(', ', $mw['audit']['redactKeys'] ?? [])) ?>" placeholder="custom_secret" style="font-family:monospace;font-size:12px">
            </div>
        </div>

        <!-- Rate Limiting -->
        <div class="card">
            <h3>Rate Limiting</h3>
            <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Per-agent, per-tool rate limits using token bucket algorithm. Prevents runaway agents from overwhelming resources.</p>
            <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                <label style="margin:0;font-weight:500">Enable rate limiting</label>
                <input type="checkbox" name="rl_enabled" <?= ($mw['rateLimit']['enabled'] ?? true) ? 'checked' : '' ?>>
            </div>
        </div>

        <!-- Circuit Breaker -->
        <div class="card">
            <h3>Circuit Breaker</h3>
            <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Auto-stops calling failing tools after consecutive failures. Opens for 30 seconds then retries.</p>
            <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                <label style="margin:0;font-weight:500">Enable circuit breaker</label>
                <input type="checkbox" name="cb_enabled" <?= ($mw['circuitBreaker']['enabled'] ?? true) ? 'checked' : '' ?>>
            </div>
        </div>

        <!-- Telemetry -->
        <div class="card">
            <h3>Telemetry</h3>
            <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Collects execution timing, success/failure counters, and output size metrics for all tool invocations.</p>
            <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                <label style="margin:0;font-weight:500">Enable telemetry collection</label>
                <input type="checkbox" name="tel_enabled" <?= ($mw['telemetry']['enabled'] ?? true) ? 'checked' : '' ?>>
            </div>
        </div>
    </div>

    <div style="margin-top:16px;display:flex;justify-content:flex-end">
        <button class="btn btn-primary" type="submit">Save Tool Security Settings</button>
    </div>
</form>

<?php elseif ($tab === 'firewall'): ?>
<?php
$fwIp = $firewallConfig['ipAccess'] ?? ['enabled' => false, 'mode' => 'allowlist', 'allowlist' => [], 'blocklist' => [], 'bypassPaths' => ['/health', '/ready']];
$fwEgress = $firewallConfig['egress'] ?? ['enabled' => false, 'mode' => 'blocklist', 'allowedHosts' => [], 'blockedHosts' => [], 'allowedPorts' => [], 'blockedPorts' => []];
$fwProxy = $firewallConfig['proxy'] ?? ['httpProxy' => '', 'httpsProxy' => '', 'noProxy' => ['localhost', '127.0.0.1']];
$fwTp = $firewallConfig['trustedProxies'] ?? ['enabled' => false, 'ips' => []];
$fwNet = $firewallConfig['network'] ?? [];
$fwRl = $fwNet['rateLimit'] ?? ['enabled' => true, 'requestsPerMinute' => 120, 'skipPaths' => ['/health', '/ready']];
$fwHttps = $fwNet['httpsEnforcement'] ?? ['enabled' => false, 'excludePaths' => []];
$fwSh = $fwNet['securityHeaders'] ?? ['hsts' => true, 'hstsMaxAge' => 31536000, 'xFrameOptions' => 'DENY', 'xContentTypeOptions' => true, 'referrerPolicy' => 'strict-origin-when-cross-origin', 'permissionsPolicy' => 'camera=(), microphone=(), geolocation=()'];
?>
<!-- Network & Firewall Settings -->
<form method="post" action="/settings">
    <input type="hidden" name="_action" value="save_firewall">

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:0">
            <div>
                <h3 style="margin:0;font-size:18px;font-weight:600">Network &amp; Firewall</h3>
                <p style="margin:4px 0 0;font-size:13px;color:var(--text-muted)">IP access control, egress filtering, proxy configuration, and network security settings.</p>
            </div>
            <button class="settings-help-btn" onclick="toggleSettingsHelp('network-firewall')" title="Learn more">?</button>
        </div>
        <button class="btn btn-primary" type="submit">Save Settings</button>
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
    <div style="font-size:14px;font-weight:600;color:var(--text-muted);margin-bottom:12px;margin-top:8px">IP Access Control</div>
    <div class="card">
        <h3>IP Access Control</h3>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Control which IP addresses can access your instance. Use CIDRs for network ranges.</p>
        <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
            <label style="margin:0;font-weight:500">Enable IP access control</label>
            <input type="checkbox" name="fw_ip_enabled" <?= ($fwIp['enabled'] ?? false) ? 'checked' : '' ?>>
        </div>
        <div class="form-group">
            <label>Mode</label>
            <select name="fw_ip_mode" style="width:250px">
                <option value="allowlist" <?= ($fwIp['mode'] ?? 'allowlist') === 'allowlist' ? 'selected' : '' ?>>Allowlist</option>
                <option value="blocklist" <?= ($fwIp['mode'] ?? 'allowlist') === 'blocklist' ? 'selected' : '' ?>>Blocklist</option>
            </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group">
                <label>Allowlist CIDRs (comma-separated)</label>
                <input type="text" name="fw_ip_allowlist" value="<?= Helpers::e(implode(', ', $fwIp['allowlist'] ?? [])) ?>" placeholder="10.0.0.0/8, 192.168.1.0/24" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
                <label>Blocklist CIDRs (comma-separated)</label>
                <input type="text" name="fw_ip_blocklist" value="<?= Helpers::e(implode(', ', $fwIp['blocklist'] ?? [])) ?>" placeholder="0.0.0.0/0" style="font-family:monospace;font-size:12px">
            </div>
        </div>
        <div class="form-group">
            <label>Bypass Paths (comma-separated)</label>
            <input type="text" name="fw_ip_bypass_paths" value="<?= Helpers::e(implode(', ', $fwIp['bypassPaths'] ?? [])) ?>" placeholder="/health, /ready" style="font-family:monospace;font-size:12px">
        </div>
    </div>

    <!-- Outbound Egress -->
    <div style="font-size:14px;font-weight:600;color:var(--text-muted);margin-bottom:12px;margin-top:8px">Outbound Egress</div>
    <div class="card">
        <h3>Egress Filtering</h3>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Control outbound network connections from your instance. Restrict which hosts and ports agents can reach.</p>
        <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
            <label style="margin:0;font-weight:500">Enable egress filtering</label>
            <input type="checkbox" name="fw_egress_enabled" <?= ($fwEgress['enabled'] ?? false) ? 'checked' : '' ?>>
        </div>
        <div class="form-group">
            <label>Mode</label>
            <select name="fw_egress_mode" style="width:250px">
                <option value="blocklist" <?= ($fwEgress['mode'] ?? 'blocklist') === 'blocklist' ? 'selected' : '' ?>>Blocklist</option>
                <option value="allowlist" <?= ($fwEgress['mode'] ?? 'blocklist') === 'allowlist' ? 'selected' : '' ?>>Allowlist</option>
            </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group">
                <label>Allowed Hosts (comma-separated)</label>
                <input type="text" name="fw_egress_allowed_hosts" value="<?= Helpers::e(implode(', ', $fwEgress['allowedHosts'] ?? [])) ?>" placeholder="api.example.com" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
                <label>Blocked Hosts (comma-separated)</label>
                <input type="text" name="fw_egress_blocked_hosts" value="<?= Helpers::e(implode(', ', $fwEgress['blockedHosts'] ?? [])) ?>" placeholder="evil.com" style="font-family:monospace;font-size:12px">
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group">
                <label>Allowed Ports (comma-separated)</label>
                <input type="text" name="fw_egress_allowed_ports" value="<?= Helpers::e(implode(', ', $fwEgress['allowedPorts'] ?? [])) ?>" placeholder="80, 443" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
                <label>Blocked Ports (comma-separated)</label>
                <input type="text" name="fw_egress_blocked_ports" value="<?= Helpers::e(implode(', ', $fwEgress['blockedPorts'] ?? [])) ?>" placeholder="25, 587" style="font-family:monospace;font-size:12px">
            </div>
        </div>
    </div>

    <!-- Proxy -->
    <div style="font-size:14px;font-weight:600;color:var(--text-muted);margin-bottom:12px;margin-top:8px">Proxy</div>
    <div class="card">
        <h3>Proxy Configuration</h3>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Configure HTTP/HTTPS proxy settings for outbound requests.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group">
                <label>HTTP Proxy</label>
                <input type="text" name="fw_proxy_http" value="<?= Helpers::e($fwProxy['httpProxy'] ?? '') ?>" placeholder="http://proxy.example.com:8080" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
                <label>HTTPS Proxy</label>
                <input type="text" name="fw_proxy_https" value="<?= Helpers::e($fwProxy['httpsProxy'] ?? '') ?>" placeholder="https://proxy.example.com:8443" style="font-family:monospace;font-size:12px">
            </div>
        </div>
        <div class="form-group">
            <label>No-Proxy Hosts (comma-separated)</label>
            <input type="text" name="fw_proxy_no_proxy" value="<?= Helpers::e(implode(', ', $fwProxy['noProxy'] ?? [])) ?>" placeholder="localhost, 127.0.0.1" style="font-family:monospace;font-size:12px">
        </div>
    </div>

    <!-- Trusted Proxies -->
    <div style="font-size:14px;font-weight:600;color:var(--text-muted);margin-bottom:12px;margin-top:8px">Trusted Proxies</div>
    <div class="card">
        <h3>Trusted Proxies</h3>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Specify trusted reverse proxy IPs/CIDRs to correctly resolve client addresses.</p>
        <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
            <label style="margin:0;font-weight:500">Enable trusted proxies</label>
            <input type="checkbox" name="fw_tp_enabled" <?= ($fwTp['enabled'] ?? false) ? 'checked' : '' ?>>
        </div>
        <div class="form-group">
            <label>Proxy IPs / CIDRs (comma-separated)</label>
            <input type="text" name="fw_tp_ips" value="<?= Helpers::e(implode(', ', $fwTp['ips'] ?? [])) ?>" placeholder="10.0.0.1, 172.16.0.0/12" style="font-family:monospace;font-size:12px">
        </div>
    </div>

    <!-- Network Settings -->
    <div style="font-size:14px;font-weight:600;color:var(--text-muted);margin-bottom:12px;margin-top:8px">Network Settings</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="card">
            <h3>CORS &amp; Rate Limiting</h3>
            <div class="form-group">
                <label>CORS Origins (comma-separated)</label>
                <input type="text" name="fw_cors_origins" value="<?= Helpers::e(implode(', ', $fwNet['corsOrigins'] ?? [])) ?>" placeholder="https://app.example.com" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                <label style="margin:0;font-weight:500">Enable rate limiting</label>
                <input type="checkbox" name="fw_rl_enabled" <?= ($fwRl['enabled'] ?? true) ? 'checked' : '' ?>>
            </div>
            <div class="form-group">
                <label>Requests per Minute</label>
                <input type="number" name="fw_rl_rpm" value="<?= (int)($fwRl['requestsPerMinute'] ?? 120) ?>" placeholder="120">
            </div>
            <div class="form-group">
                <label>Skip Paths (comma-separated)</label>
                <input type="text" name="fw_rl_skip_paths" value="<?= Helpers::e(implode(', ', $fwRl['skipPaths'] ?? [])) ?>" placeholder="/health, /ready" style="font-family:monospace;font-size:12px">
            </div>
        </div>

        <div class="card">
            <h3>HTTPS Enforcement</h3>
            <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                <label style="margin:0;font-weight:500">Enforce HTTPS</label>
                <input type="checkbox" name="fw_https_enabled" <?= ($fwHttps['enabled'] ?? false) ? 'checked' : '' ?>>
            </div>
            <div class="form-group">
                <label>Exclude Paths (comma-separated)</label>
                <input type="text" name="fw_https_exclude_paths" value="<?= Helpers::e(implode(', ', $fwHttps['excludePaths'] ?? [])) ?>" placeholder="/health, /ready" style="font-family:monospace;font-size:12px">
            </div>
        </div>
    </div>

    <!-- Security Headers -->
    <div class="card">
        <h3>Security Headers</h3>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">HTTP security headers applied to all responses.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px">
            <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                <label style="margin:0;font-weight:500">HSTS</label>
                <input type="checkbox" name="fw_hsts_enabled" <?= ($fwSh['hsts'] ?? true) ? 'checked' : '' ?>>
            </div>
            <div class="form-group">
                <label>HSTS Max-Age (seconds)</label>
                <input type="number" name="fw_hsts_max_age" value="<?= (int)($fwSh['hstsMaxAge'] ?? 31536000) ?>" placeholder="31536000">
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px">
            <div class="form-group">
                <label>X-Frame-Options</label>
                <select name="fw_x_frame_options">
                    <option value="DENY" <?= ($fwSh['xFrameOptions'] ?? 'DENY') === 'DENY' ? 'selected' : '' ?>>DENY</option>
                    <option value="SAMEORIGIN" <?= ($fwSh['xFrameOptions'] ?? 'DENY') === 'SAMEORIGIN' ? 'selected' : '' ?>>SAMEORIGIN</option>
                </select>
            </div>
            <div class="form-group" style="display:flex;align-items:center;justify-content:space-between">
                <label style="margin:0;font-weight:500">X-Content-Type-Options: nosniff</label>
                <input type="checkbox" name="fw_xcto_enabled" <?= ($fwSh['xContentTypeOptions'] ?? true) ? 'checked' : '' ?>>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group">
                <label>Referrer-Policy</label>
                <input type="text" name="fw_referrer_policy" value="<?= Helpers::e($fwSh['referrerPolicy'] ?? 'strict-origin-when-cross-origin') ?>" placeholder="strict-origin-when-cross-origin" style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
                <label>Permissions-Policy</label>
                <input type="text" name="fw_permissions_policy" value="<?= Helpers::e($fwSh['permissionsPolicy'] ?? 'camera=(), microphone=(), geolocation=()') ?>" placeholder="camera=(), microphone=(), geolocation=()" style="font-family:monospace;font-size:12px">
            </div>
        </div>
    </div>

    <div style="margin-top:16px;display:flex;justify-content:flex-end">
        <button class="btn btn-primary" type="submit">Save Network &amp; Firewall Settings</button>
    </div>
</form>

<?php elseif ($tab === 'pricing'): ?>
<?php
$mpModels = $modelPricingConfig['models'] ?? [];
$mpCurrency = $modelPricingConfig['currency'] ?? 'USD';

// Group models by provider
$byProvider = [];
foreach ($mpModels as $m) {
    $prov = $m['provider'] ?? 'unknown';
    $byProvider[$prov][] = $m;
}
ksort($byProvider);
?>
<!-- Model Pricing Settings -->
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <div style="display:flex;align-items:center;gap:0">
        <div>
            <h3 style="margin:0;font-size:18px;font-weight:600">Model Pricing</h3>
            <p style="margin:4px 0 0;font-size:13px;color:var(--text-muted)">Configure per-model token costs for budget tracking and cost estimation. Currency: <?= Helpers::e($mpCurrency) ?></p>
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
<?php if (empty($mpModels)): ?>
<div class="card">
    <p style="color:var(--text-muted);font-size:13px;text-align:center;padding:24px 0">No model pricing configured yet. Add your first model below.</p>
</div>
<?php else: ?>
<?php foreach ($byProvider as $provName => $provModels): ?>
<div class="card">
    <h3 style="text-transform:capitalize"><?= Helpers::e($provName) ?></h3>
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Model</th>
                    <th>Display Name</th>
                    <th style="text-align:right">Input $/1M</th>
                    <th style="text-align:right">Output $/1M</th>
                    <th style="text-align:right">Context Window</th>
                    <th style="text-align:center">Actions</th>
                </tr>
            </thead>
            <tbody>
            <?php foreach ($provModels as $model): ?>
                <tr>
                    <td style="font-family:monospace;font-size:12px"><?= Helpers::e($model['modelId'] ?? '') ?></td>
                    <td><?= Helpers::e($model['displayName'] ?? '') ?></td>
                    <td style="text-align:right;font-family:monospace"><?= number_format((float)($model['inputCostPerMillion'] ?? 0), 2) ?></td>
                    <td style="text-align:right;font-family:monospace"><?= number_format((float)($model['outputCostPerMillion'] ?? 0), 2) ?></td>
                    <td style="text-align:right;font-family:monospace"><?= number_format((int)($model['contextWindow'] ?? 0)) ?></td>
                    <td style="text-align:center">
                        <form method="post" action="/settings" style="display:inline" onsubmit="return confirm('Remove this model from pricing?')">
                            <input type="hidden" name="_action" value="delete_model_pricing">
                            <input type="hidden" name="mp_delete_provider" value="<?= Helpers::e($model['provider'] ?? '') ?>">
                            <input type="hidden" name="mp_delete_model_id" value="<?= Helpers::e($model['modelId'] ?? '') ?>">
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
    <h3>Add Model</h3>
    <form method="post" action="/settings">
        <input type="hidden" name="_action" value="save_model_pricing">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">
            <div class="form-group">
                <label>Provider</label>
                <select name="mp_provider" required>
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
            <div class="form-group">
                <label>Model ID</label>
                <input type="text" name="mp_model_id" placeholder="claude-sonnet-4-20250514" required style="font-family:monospace;font-size:12px">
            </div>
            <div class="form-group">
                <label>Display Name</label>
                <input type="text" name="mp_display_name" placeholder="Claude Sonnet 4">
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:14px">
            <div class="form-group">
                <label>Input Cost per 1M Tokens ($)</label>
                <input type="number" step="0.01" min="0" name="mp_input_cost" placeholder="3.00" required>
            </div>
            <div class="form-group">
                <label>Output Cost per 1M Tokens ($)</label>
                <input type="number" step="0.01" min="0" name="mp_output_cost" placeholder="15.00" required>
            </div>
            <div class="form-group">
                <label>Context Window (tokens)</label>
                <input type="number" min="0" name="mp_context_window" placeholder="200000">
            </div>
        </div>
        <div style="margin-top:16px">
            <button class="btn btn-primary" type="submit">Add Model</button>
        </div>
    </form>
</div>
<?php endif; ?>
