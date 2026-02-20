package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// HandleSettings handles the settings page (GET) and settings update (POST).
func HandleSettings(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	if r.Method == "POST" {
		r.ParseForm()

		// Check if this is a tool security save
		if r.FormValue("_form") == "tool-security" {
			saveToolSecurity(w, r, s)
			return
		}

		// Check if this is a firewall save
		if r.FormValue("_form") == "firewall" {
			saveFirewall(w, r, s)
			return
		}

		// Check if this is a model pricing save
		if r.FormValue("_form") == "model-pricing" {
			saveModelPricing(w, r, s)
			return
		}

		services.APICall("/api/settings", "PATCH", s.Token, map[string]string{
			"name":         r.FormValue("name"),
			"domain":       r.FormValue("domain"),
			"primaryColor": r.FormValue("primaryColor"),
		})
		http.Redirect(w, r, "/settings", http.StatusFound)
		return
	}

	settings, _ := services.APICall("/api/settings", "GET", s.Token, nil)
	retention, _ := services.APICall("/api/retention", "GET", s.Token, nil)
	if settings == nil {
		settings = map[string]interface{}{}
	}
	if retention == nil {
		retention = map[string]interface{}{}
	}

	retEnabled := "Disabled"
	retColor := "var(--muted)"
	if enabled, ok := retention["enabled"].(bool); ok && enabled {
		retEnabled = "Enabled"
		retColor = "var(--success)"
	}
	retDays := templates.IntVal(retention, "retainDays")
	if retDays == 0 {
		retDays = 365
	}

	content := fmt.Sprintf(`<style>
.settings-help-btn{background:none;border:1px solid var(--border);border-radius:50%%;width:22px;height:22px;font-size:12px;font-weight:700;color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;margin-left:8px;flex-shrink:0}
.settings-help-btn:hover{background:var(--primary);color:#fff;border-color:var(--primary)}
.settings-help-panel{display:none;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px 20px;margin-bottom:16px;font-size:13px;line-height:1.6;color:var(--dim)}
.settings-help-panel.open{display:block}
.settings-help-panel h4{margin:12px 0 4px;font-size:13px;font-weight:600;color:var(--text,#333)}
.settings-help-panel ul{margin:4px 0 8px 18px;padding:0}
.settings-help-panel li{margin-bottom:4px}
</style>
<h2 class="t">Settings</h2><p class="desc">Configure your organization</p>
<div style="border-bottom:1px solid var(--border);margin-bottom:20px">
<div class="tabs" style="padding:0">
<div class="tab active" data-settings-tab="general" onclick="switchSettingsTab('general')">General</div>
<div class="tab" data-settings-tab="tool-security" onclick="switchSettingsTab('tool-security')">Tool Security</div>
<div class="tab" data-settings-tab="firewall" onclick="switchSettingsTab('firewall')">Network &amp; Firewall</div>
<div class="tab" data-settings-tab="model-pricing" onclick="switchSettingsTab('model-pricing')">Model Pricing</div>
</div></div>
<div id="settings-panel-general">
<div class="card"><div style="display:flex;align-items:center;gap:0"><div class="ct">General</div><button class="settings-help-btn" onclick="toggleSettingsHelp('general')" title="Learn more">?</button></div>
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
<form method="POST" action="/settings" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
<div class="fg"><label class="fl">Organization Name</label><input class="input" name="name" value="%s"></div>
<div class="fg"><label class="fl">Domain</label><input class="input" name="domain" value="%s" placeholder="agents.agenticmail.io"></div>
<div class="fg"><label class="fl">Primary Color</label><input class="input" type="color" name="primaryColor" value="%s" style="height:38px;padding:4px"></div>
<div></div><div><button class="btn btn-p" type="submit">Save Settings</button></div></form></div>
<div class="card"><div class="ct">Plan</div>%s <span style="font-size:13px;color:var(--dim);margin-left:12px">Subdomain: %s.agenticmail.io</span></div>
<div class="card"><div class="ct">Data Retention</div><div style="font-size:13px">Status: <span style="color:%s">%s</span><br><span style="color:var(--dim)">Retain emails for %d days</span></div></div>
</div>`,
		templates.Esc(settings["name"]), templates.Esc(settings["domain"]),
		templates.Esc(settings["primaryColor"]),
		templates.Badge(strings.ToUpper(templates.StrVal(settings, "plan"))),
		templates.Esc(settings["subdomain"]),
		retColor, retEnabled, retDays)

	// Tool Security panel
	content += renderToolSecurityPanel(s)

	// Firewall panel
	content += renderFirewallPanel(s)

	// Model Pricing panel
	content += renderModelPricingPanel(s)

	// Tab switching JavaScript + help toggle
	content += `<script>
function switchSettingsTab(tab){document.querySelectorAll('[id^="settings-panel-"]').forEach(function(p){p.style.display='none'});document.querySelectorAll('[data-settings-tab]').forEach(function(t){t.classList.remove('active')});document.getElementById('settings-panel-'+tab).style.display='block';document.querySelector('[data-settings-tab="'+tab+'"]').classList.add('active')}
function toggleSettingsHelp(id){var p=document.getElementById('help-'+id);if(p)p.classList.toggle('open')}
</script>`

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("settings", s.User, content))
}

// renderToolSecurityPanel fetches and renders the tool security settings panel.
func renderToolSecurityPanel(s *services.Session) string {
	tsData, _ := services.APICall("/api/settings/tool-security", "GET", s.Token, nil)
	if tsData == nil {
		tsData = map[string]interface{}{}
	}

	// Unwrap toolSecurityConfig if present
	cfg := tsData
	if tsc, ok := tsData["toolSecurityConfig"].(map[string]interface{}); ok {
		cfg = tsc
	}

	security := map[string]interface{}{}
	if sec, ok := cfg["security"].(map[string]interface{}); ok {
		security = sec
	}
	middleware := map[string]interface{}{}
	if mw, ok := cfg["middleware"].(map[string]interface{}); ok {
		middleware = mw
	}

	// Security sub-objects
	pathSandbox := map[string]interface{}{}
	if ps, ok := security["pathSandbox"].(map[string]interface{}); ok {
		pathSandbox = ps
	}
	ssrf := map[string]interface{}{}
	if s, ok := security["ssrf"].(map[string]interface{}); ok {
		ssrf = s
	}
	cmdSanitizer := map[string]interface{}{}
	if cs, ok := security["commandSanitizer"].(map[string]interface{}); ok {
		cmdSanitizer = cs
	}

	// Middleware sub-objects
	audit := map[string]interface{}{}
	if a, ok := middleware["audit"].(map[string]interface{}); ok {
		audit = a
	}
	rateLimit := map[string]interface{}{}
	if rl, ok := middleware["rateLimit"].(map[string]interface{}); ok {
		rateLimit = rl
	}
	circuitBreaker := map[string]interface{}{}
	if cb, ok := middleware["circuitBreaker"].(map[string]interface{}); ok {
		circuitBreaker = cb
	}
	telemetry := map[string]interface{}{}
	if t, ok := middleware["telemetry"].(map[string]interface{}); ok {
		telemetry = t
	}

	checked := func(m map[string]interface{}, key string) string {
		if v, ok := m[key].(bool); ok && v {
			return " checked"
		}
		return ""
	}

	joinArray := func(m map[string]interface{}, key string) string {
		if arr, ok := m[key].([]interface{}); ok {
			parts := make([]string, 0, len(arr))
			for _, v := range arr {
				parts = append(parts, fmt.Sprintf("%v", v))
			}
			return strings.Join(parts, ", ")
		}
		return ""
	}

	cmdMode := templates.StrVal(cmdSanitizer, "mode")
	if cmdMode == "" {
		cmdMode = "blocklist"
	}
	blocklistSel := ""
	allowlistSel := ""
	if cmdMode == "allowlist" {
		allowlistSel = " selected"
	} else {
		blocklistSel = " selected"
	}

	html := fmt.Sprintf(`<div id="settings-panel-tool-security" style="display:none">
<form method="POST" action="/settings">
<input type="hidden" name="_form" value="tool-security">

<div style="display:flex;align-items:center;gap:0;margin-bottom:16px"><h3 style="margin:0;font-size:18px;font-weight:600">Agent Tool Security</h3><button class="settings-help-btn" onclick="toggleSettingsHelp('tool-security')" title="Learn more">?</button></div>
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

<div class="card" style="margin-bottom:16px"><div class="ct">Security Policies</div>
<div style="display:grid;gap:20px">

<div style="padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
<div><strong style="font-size:14px">Path Sandbox</strong><div style="font-size:12px;color:var(--dim)">Restrict file system access to allowed directories</div></div>
<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" name="ps_enabled" value="1"%s> Enabled</label>
</div>
<div class="fg"><label class="fl">Allowed Directories (comma-separated)</label><input class="input" name="ps_allowedDirs" value="%s" placeholder="/tmp, /var/data"></div>
<div class="fg"><label class="fl">Blocked Patterns (comma-separated)</label><input class="input" name="ps_blockedPatterns" value="%s" placeholder="*.exe, /etc/shadow"></div>
</div>

<div style="padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
<div><strong style="font-size:14px">SSRF Protection</strong><div style="font-size:12px;color:var(--dim)">Prevent server-side request forgery attacks</div></div>
<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" name="ssrf_enabled" value="1"%s> Enabled</label>
</div>
<div class="fg"><label class="fl">Allowed Hosts (comma-separated)</label><input class="input" name="ssrf_allowedHosts" value="%s" placeholder="api.example.com, cdn.example.com"></div>
<div class="fg"><label class="fl">Blocked CIDRs (comma-separated)</label><input class="input" name="ssrf_blockedCidrs" value="%s" placeholder="10.0.0.0/8, 172.16.0.0/12"></div>
</div>

<div style="padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
<div><strong style="font-size:14px">Command Sanitizer</strong><div style="font-size:12px;color:var(--dim)">Control which shell commands agents can execute</div></div>
<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" name="cmd_enabled" value="1"%s> Enabled</label>
</div>
<div class="fg"><label class="fl">Mode</label><select class="input" name="cmd_mode"><option value="blocklist"%s>Blocklist</option><option value="allowlist"%s>Allowlist</option></select></div>
<div class="fg"><label class="fl">Allowed Commands (comma-separated)</label><input class="input" name="cmd_allowedCommands" value="%s" placeholder="ls, cat, grep"></div>
<div class="fg"><label class="fl">Blocked Patterns (comma-separated)</label><input class="input" name="cmd_blockedPatterns" value="%s" placeholder="rm -rf, sudo, chmod"></div>
</div>
</div></div>

<div class="card" style="margin-bottom:16px"><div class="ct">Middleware</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

<div style="padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
<div><strong style="font-size:14px">Audit Logging</strong><div style="font-size:12px;color:var(--dim)">Log all tool invocations</div></div>
<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" name="audit_enabled" value="1"%s> Enabled</label>
</div>
<div class="fg"><label class="fl">Redact Keys (comma-separated)</label><input class="input" name="audit_redactKeys" value="%s" placeholder="password, secret, token"></div>
</div>

<div style="padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
<div><strong style="font-size:14px">Rate Limiting</strong><div style="font-size:12px;color:var(--dim)">Throttle tool calls</div></div>
<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" name="rl_enabled" value="1"%s> Enabled</label>
</div>
</div>

<div style="padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center">
<div><strong style="font-size:14px">Circuit Breaker</strong><div style="font-size:12px;color:var(--dim)">Halt tools after repeated failures</div></div>
<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" name="cb_enabled" value="1"%s> Enabled</label>
</div>
</div>

<div style="padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center">
<div><strong style="font-size:14px">Telemetry</strong><div style="font-size:12px;color:var(--dim)">Collect tool usage metrics</div></div>
<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" name="tel_enabled" value="1"%s> Enabled</label>
</div>
</div>

</div></div>

<div><button class="btn btn-p" type="submit">Save Tool Security</button></div>
</form>
</div>`,
		checked(pathSandbox, "enabled"),
		templates.Esc(joinArray(pathSandbox, "allowedDirs")),
		templates.Esc(joinArray(pathSandbox, "blockedPatterns")),
		checked(ssrf, "enabled"),
		templates.Esc(joinArray(ssrf, "allowedHosts")),
		templates.Esc(joinArray(ssrf, "blockedCidrs")),
		checked(cmdSanitizer, "enabled"),
		blocklistSel, allowlistSel,
		templates.Esc(joinArray(cmdSanitizer, "allowedCommands")),
		templates.Esc(joinArray(cmdSanitizer, "blockedPatterns")),
		checked(audit, "enabled"),
		templates.Esc(joinArray(audit, "redactKeys")),
		checked(rateLimit, "enabled"),
		checked(circuitBreaker, "enabled"),
		checked(telemetry, "enabled"),
	)

	return html
}

// renderFirewallPanel fetches and renders the network & firewall settings panel.
func renderFirewallPanel(s *services.Session) string {
	fwData, _ := services.APICall("/api/settings/firewall", "GET", s.Token, nil)
	if fwData == nil {
		fwData = map[string]interface{}{}
	}

	// Unwrap firewallConfig if present
	cfg := fwData
	if fc, ok := fwData["firewallConfig"].(map[string]interface{}); ok {
		cfg = fc
	}

	ipAccess := map[string]interface{}{}
	if ia, ok := cfg["ipAccess"].(map[string]interface{}); ok {
		ipAccess = ia
	}
	egress := map[string]interface{}{}
	if eg, ok := cfg["egress"].(map[string]interface{}); ok {
		egress = eg
	}
	proxy := map[string]interface{}{}
	if px, ok := cfg["proxy"].(map[string]interface{}); ok {
		proxy = px
	}
	trustedProxies := map[string]interface{}{}
	if tp, ok := cfg["trustedProxies"].(map[string]interface{}); ok {
		trustedProxies = tp
	}
	network := map[string]interface{}{}
	if nw, ok := cfg["network"].(map[string]interface{}); ok {
		network = nw
	}
	netRateLimit := map[string]interface{}{}
	if rl, ok := network["rateLimit"].(map[string]interface{}); ok {
		netRateLimit = rl
	}
	httpsEnforcement := map[string]interface{}{}
	if he, ok := network["httpsEnforcement"].(map[string]interface{}); ok {
		httpsEnforcement = he
	}
	secHeaders := map[string]interface{}{}
	if sh, ok := network["securityHeaders"].(map[string]interface{}); ok {
		secHeaders = sh
	}

	checked := func(m map[string]interface{}, key string) string {
		if v, ok := m[key].(bool); ok && v {
			return " checked"
		}
		return ""
	}

	joinArray := func(m map[string]interface{}, key string) string {
		if arr, ok := m[key].([]interface{}); ok {
			parts := make([]string, 0, len(arr))
			for _, v := range arr {
				parts = append(parts, fmt.Sprintf("%v", v))
			}
			return strings.Join(parts, ", ")
		}
		return ""
	}

	ipMode := templates.StrVal(ipAccess, "mode")
	if ipMode == "" {
		ipMode = "allowlist"
	}
	ipAllowlistSel := ""
	ipBlocklistSel := ""
	if ipMode == "blocklist" {
		ipBlocklistSel = " selected"
	} else {
		ipAllowlistSel = " selected"
	}

	egressMode := templates.StrVal(egress, "mode")
	if egressMode == "" {
		egressMode = "blocklist"
	}
	egAllowlistSel := ""
	egBlocklistSel := ""
	if egressMode == "allowlist" {
		egAllowlistSel = " selected"
	} else {
		egBlocklistSel = " selected"
	}

	rpm := templates.IntVal(netRateLimit, "requestsPerMinute")
	if rpm == 0 {
		rpm = 120
	}

	hstsMaxAge := templates.IntVal(secHeaders, "hstsMaxAge")
	if hstsMaxAge == 0 {
		hstsMaxAge = 31536000
	}

	xFrameOptions := templates.StrVal(secHeaders, "xFrameOptions")
	if xFrameOptions == "" {
		xFrameOptions = "DENY"
	}
	xfoDeny := ""
	xfoSameorigin := ""
	if xFrameOptions == "SAMEORIGIN" {
		xfoSameorigin = " selected"
	} else {
		xfoDeny = " selected"
	}

	referrerPolicy := templates.StrVal(secHeaders, "referrerPolicy")
	if referrerPolicy == "" {
		referrerPolicy = "strict-origin-when-cross-origin"
	}

	permissionsPolicy := templates.StrVal(secHeaders, "permissionsPolicy")
	if permissionsPolicy == "" {
		permissionsPolicy = "camera=(), microphone=(), geolocation=()"
	}

	html := fmt.Sprintf(`<div id="settings-panel-firewall" style="display:none">
<form method="POST" action="/settings">
<input type="hidden" name="_form" value="firewall">

<div style="display:flex;align-items:center;gap:0;margin-bottom:16px"><h3 style="margin:0;font-size:18px;font-weight:600">Network &amp; Firewall</h3><button class="settings-help-btn" onclick="toggleSettingsHelp('network-firewall')" title="Learn more">?</button></div>
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

<div class="card" style="margin-bottom:16px"><div class="ct">IP Access Control</div>
<div style="padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
<div><strong style="font-size:14px">IP Access Control</strong><div style="font-size:12px;color:var(--dim)">Restrict access by IP address</div></div>
<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" name="ip_enabled" value="1"%s> Enabled</label>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
<div class="fg"><label class="fl">Mode</label><select class="input" name="ip_mode"><option value="allowlist"%s>Allowlist</option><option value="blocklist"%s>Blocklist</option></select></div>
<div></div>
<div class="fg"><label class="fl">Allowlist IPs (comma-separated)</label><input class="input" name="ip_allowlist" value="%s" placeholder="192.168.1.0/24, 10.0.0.1"></div>
<div class="fg"><label class="fl">Blocklist IPs (comma-separated)</label><input class="input" name="ip_blocklist" value="%s" placeholder="203.0.113.0/24"></div>
<div class="fg" style="grid-column:1/-1"><label class="fl">Bypass Paths (comma-separated)</label><input class="input" name="ip_bypassPaths" value="%s" placeholder="/health, /ready"></div>
</div></div></div>

<div class="card" style="margin-bottom:16px"><div class="ct">Outbound Egress</div>
<div style="padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
<div><strong style="font-size:14px">Egress Filtering</strong><div style="font-size:12px;color:var(--dim)">Control outbound network connections</div></div>
<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" name="eg_enabled" value="1"%s> Enabled</label>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
<div class="fg"><label class="fl">Mode</label><select class="input" name="eg_mode"><option value="blocklist"%s>Blocklist</option><option value="allowlist"%s>Allowlist</option></select></div>
<div></div>
<div class="fg"><label class="fl">Allowed Hosts (comma-separated)</label><input class="input" name="eg_allowedHosts" value="%s" placeholder="api.example.com"></div>
<div class="fg"><label class="fl">Blocked Hosts (comma-separated)</label><input class="input" name="eg_blockedHosts" value="%s" placeholder="evil.com"></div>
<div class="fg"><label class="fl">Allowed Ports (comma-separated)</label><input class="input" name="eg_allowedPorts" value="%s" placeholder="443, 80"></div>
<div class="fg"><label class="fl">Blocked Ports (comma-separated)</label><input class="input" name="eg_blockedPorts" value="%s" placeholder="25, 445"></div>
</div></div></div>

<div class="card" style="margin-bottom:16px"><div class="ct">Proxy Configuration</div>
<div style="padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
<div class="fg"><label class="fl">HTTP Proxy</label><input class="input" name="proxy_http" value="%s" placeholder="http://proxy:8080"></div>
<div class="fg"><label class="fl">HTTPS Proxy</label><input class="input" name="proxy_https" value="%s" placeholder="http://proxy:8443"></div>
<div class="fg" style="grid-column:1/-1"><label class="fl">No-Proxy Hosts (comma-separated)</label><input class="input" name="proxy_noProxy" value="%s" placeholder="localhost, 127.0.0.1"></div>
</div></div></div>

<div class="card" style="margin-bottom:16px"><div class="ct">Trusted Proxies</div>
<div style="padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
<div><strong style="font-size:14px">Trusted Proxies</strong><div style="font-size:12px;color:var(--dim)">Configure trusted reverse proxy IPs/CIDRs</div></div>
<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" name="tp_enabled" value="1"%s> Enabled</label>
</div>
<div class="fg"><label class="fl">IPs/CIDRs (comma-separated)</label><input class="input" name="tp_ips" value="%s" placeholder="10.0.0.0/8, 172.16.0.0/12"></div>
</div></div>

<div class="card" style="margin-bottom:16px"><div class="ct">Network Settings</div>
<div style="display:grid;gap:20px">

<div style="padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<strong style="font-size:14px">CORS</strong><div style="font-size:12px;color:var(--dim);margin-bottom:12px">Allowed origins for cross-origin requests</div>
<div class="fg"><label class="fl">CORS Origins (comma-separated)</label><input class="input" name="net_corsOrigins" value="%s" placeholder="https://app.example.com"></div>
</div>

<div style="padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
<div><strong style="font-size:14px">Rate Limiting</strong><div style="font-size:12px;color:var(--dim)">Throttle incoming requests</div></div>
<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" name="net_rl_enabled" value="1"%s> Enabled</label>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
<div class="fg"><label class="fl">Requests Per Minute</label><input class="input" type="number" name="net_rl_rpm" value="%d" placeholder="120"></div>
<div class="fg"><label class="fl">Skip Paths (comma-separated)</label><input class="input" name="net_rl_skipPaths" value="%s" placeholder="/health, /ready"></div>
</div></div>

<div style="padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
<div><strong style="font-size:14px">HTTPS Enforcement</strong><div style="font-size:12px;color:var(--dim)">Redirect HTTP to HTTPS</div></div>
<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" name="net_https_enabled" value="1"%s> Enabled</label>
</div>
<div class="fg"><label class="fl">Exclude Paths (comma-separated)</label><input class="input" name="net_https_excludePaths" value="%s" placeholder="/health, /ready"></div>
</div>

<div style="padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<strong style="font-size:14px">Security Headers</strong><div style="font-size:12px;color:var(--dim);margin-bottom:12px">HTTP security response headers</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
<div class="fg"><label class="fl"><label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" name="net_hsts" value="1"%s> HSTS</label></label></div>
<div class="fg"><label class="fl">HSTS Max-Age (seconds)</label><input class="input" type="number" name="net_hstsMaxAge" value="%d"></div>
<div class="fg"><label class="fl">X-Frame-Options</label><select class="input" name="net_xFrameOptions"><option value="DENY"%s>DENY</option><option value="SAMEORIGIN"%s>SAMEORIGIN</option></select></div>
<div class="fg"><label class="fl"><label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" name="net_xContentTypeOptions" value="1"%s> X-Content-Type-Options: nosniff</label></label></div>
<div class="fg"><label class="fl">Referrer Policy</label><input class="input" name="net_referrerPolicy" value="%s"></div>
<div class="fg"><label class="fl">Permissions Policy</label><input class="input" name="net_permissionsPolicy" value="%s"></div>
</div></div>

</div></div>

<div><button class="btn btn-p" type="submit">Save Network &amp; Firewall</button></div>
</form>
</div>`,
		checked(ipAccess, "enabled"),
		ipAllowlistSel, ipBlocklistSel,
		templates.Esc(joinArray(ipAccess, "allowlist")),
		templates.Esc(joinArray(ipAccess, "blocklist")),
		templates.Esc(joinArray(ipAccess, "bypassPaths")),
		checked(egress, "enabled"),
		egBlocklistSel, egAllowlistSel,
		templates.Esc(joinArray(egress, "allowedHosts")),
		templates.Esc(joinArray(egress, "blockedHosts")),
		templates.Esc(joinArray(egress, "allowedPorts")),
		templates.Esc(joinArray(egress, "blockedPorts")),
		templates.Esc(proxy["httpProxy"]),
		templates.Esc(proxy["httpsProxy"]),
		templates.Esc(joinArray(proxy, "noProxy")),
		checked(trustedProxies, "enabled"),
		templates.Esc(joinArray(trustedProxies, "ips")),
		templates.Esc(joinArray(network, "corsOrigins")),
		checked(netRateLimit, "enabled"),
		rpm,
		templates.Esc(joinArray(netRateLimit, "skipPaths")),
		checked(httpsEnforcement, "enabled"),
		templates.Esc(joinArray(httpsEnforcement, "excludePaths")),
		checked(secHeaders, "hsts"),
		hstsMaxAge,
		xfoDeny, xfoSameorigin,
		checked(secHeaders, "xContentTypeOptions"),
		templates.Esc(secHeaders["referrerPolicy"]),
		templates.Esc(secHeaders["permissionsPolicy"]),
	)

	return html
}

// saveFirewall handles the POST for network & firewall settings.
func saveFirewall(w http.ResponseWriter, r *http.Request, s *services.Session) {
	splitTrim := func(val string) []string {
		if val == "" {
			return []string{}
		}
		parts := strings.Split(val, ",")
		result := []string{}
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				result = append(result, p)
			}
		}
		return result
	}

	splitTrimInt := func(val string) []int {
		if val == "" {
			return []int{}
		}
		parts := strings.Split(val, ",")
		result := []int{}
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				n := 0
				fmt.Sscanf(p, "%d", &n)
				if n > 0 {
					result = append(result, n)
				}
			}
		}
		return result
	}

	rpmStr := r.FormValue("net_rl_rpm")
	rpm := 120
	if rpmStr != "" {
		fmt.Sscanf(rpmStr, "%d", &rpm)
	}

	hstsMaxAgeStr := r.FormValue("net_hstsMaxAge")
	hstsMaxAge := 31536000
	if hstsMaxAgeStr != "" {
		fmt.Sscanf(hstsMaxAgeStr, "%d", &hstsMaxAge)
	}

	payload := map[string]interface{}{
		"ipAccess": map[string]interface{}{
			"enabled":     r.FormValue("ip_enabled") == "1",
			"mode":        r.FormValue("ip_mode"),
			"allowlist":   splitTrim(r.FormValue("ip_allowlist")),
			"blocklist":   splitTrim(r.FormValue("ip_blocklist")),
			"bypassPaths": splitTrim(r.FormValue("ip_bypassPaths")),
		},
		"egress": map[string]interface{}{
			"enabled":      r.FormValue("eg_enabled") == "1",
			"mode":         r.FormValue("eg_mode"),
			"allowedHosts": splitTrim(r.FormValue("eg_allowedHosts")),
			"blockedHosts": splitTrim(r.FormValue("eg_blockedHosts")),
			"allowedPorts": splitTrimInt(r.FormValue("eg_allowedPorts")),
			"blockedPorts": splitTrimInt(r.FormValue("eg_blockedPorts")),
		},
		"proxy": map[string]interface{}{
			"httpProxy":  r.FormValue("proxy_http"),
			"httpsProxy": r.FormValue("proxy_https"),
			"noProxy":    splitTrim(r.FormValue("proxy_noProxy")),
		},
		"trustedProxies": map[string]interface{}{
			"enabled": r.FormValue("tp_enabled") == "1",
			"ips":     splitTrim(r.FormValue("tp_ips")),
		},
		"network": map[string]interface{}{
			"corsOrigins": splitTrim(r.FormValue("net_corsOrigins")),
			"rateLimit": map[string]interface{}{
				"enabled":           r.FormValue("net_rl_enabled") == "1",
				"requestsPerMinute": rpm,
				"skipPaths":         splitTrim(r.FormValue("net_rl_skipPaths")),
			},
			"httpsEnforcement": map[string]interface{}{
				"enabled":      r.FormValue("net_https_enabled") == "1",
				"excludePaths": splitTrim(r.FormValue("net_https_excludePaths")),
			},
			"securityHeaders": map[string]interface{}{
				"hsts":                r.FormValue("net_hsts") == "1",
				"hstsMaxAge":          hstsMaxAge,
				"xFrameOptions":       r.FormValue("net_xFrameOptions"),
				"xContentTypeOptions": r.FormValue("net_xContentTypeOptions") == "1",
				"referrerPolicy":      r.FormValue("net_referrerPolicy"),
				"permissionsPolicy":   r.FormValue("net_permissionsPolicy"),
			},
		},
	}

	services.APICall("/api/settings/firewall", "PUT", s.Token, payload)
	http.Redirect(w, r, "/settings", http.StatusFound)
}

// renderModelPricingPanel fetches and renders the model pricing settings panel.
func renderModelPricingPanel(s *services.Session) string {
	mpData, _ := services.APICall("/api/settings/model-pricing", "GET", s.Token, nil)
	if mpData == nil {
		mpData = map[string]interface{}{}
	}

	// Unwrap modelPricingConfig if present
	cfg := mpData
	if mpc, ok := mpData["modelPricingConfig"].(map[string]interface{}); ok {
		cfg = mpc
	}

	currency := "USD"
	if c, ok := cfg["currency"].(string); ok && c != "" {
		currency = c
	}

	models := []interface{}{}
	if m, ok := cfg["models"].([]interface{}); ok {
		models = m
	}

	// Provider display name mapping
	providerLabels := map[string]string{
		"anthropic": "Anthropic", "openai": "OpenAI", "google": "Google",
		"deepseek": "DeepSeek", "xai": "xAI (Grok)", "mistral": "Mistral",
		"groq": "Groq", "together": "Together", "fireworks": "Fireworks",
		"moonshot": "Moonshot (Kimi)", "cerebras": "Cerebras", "openrouter": "OpenRouter",
		"ollama": "Ollama (Local)", "vllm": "vLLM (Local)", "lmstudio": "LM Studio (Local)",
		"litellm": "LiteLLM (Local)",
	}

	// Group models by provider
	providerOrder := []string{}
	providerModels := map[string][]map[string]interface{}{}
	for _, item := range models {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		provider := ""
		if p, ok := m["provider"].(string); ok {
			provider = p
		}
		if _, exists := providerModels[provider]; !exists {
			providerOrder = append(providerOrder, provider)
		}
		providerModels[provider] = append(providerModels[provider], m)
	}

	floatStr := func(m map[string]interface{}, key string) string {
		if v, ok := m[key]; ok {
			return fmt.Sprintf("%v", v)
		}
		return "0"
	}

	intStr := func(m map[string]interface{}, key string) string {
		if v, ok := m[key]; ok {
			return fmt.Sprintf("%v", v)
		}
		return "0"
	}

	html := `<div id="settings-panel-model-pricing" style="display:none">
<form method="POST" action="/settings">
<input type="hidden" name="_form" value="model-pricing">

<div style="display:flex;align-items:center;gap:0;margin-bottom:16px"><h3 style="margin:0;font-size:18px;font-weight:600">Model Pricing</h3><button class="settings-help-btn" onclick="toggleSettingsHelp('model-pricing')" title="Learn more">?</button></div>
<div id="help-model-pricing" class="settings-help-panel">
<p>Configure per-model pricing for cost estimation and budget tracking. Costs are per million tokens.</p>
<h4>How It Works</h4>
<ul>
<li><strong>Input Cost</strong> — Cost per million input (prompt) tokens sent to the model.</li>
<li><strong>Output Cost</strong> — Cost per million output (completion) tokens generated by the model.</li>
<li><strong>Context Window</strong> — Maximum number of tokens the model supports in a single request.</li>
</ul>
</div>

<div class="card" style="margin-bottom:16px"><div class="ct">Current Models</div>
<div style="font-size:13px;color:var(--dim);margin-bottom:12px">Currency: ` + templates.Esc(currency) + `</div>`

	if len(models) == 0 {
		html += `<p style="color:var(--dim);font-size:13px">No models configured yet. Add one below.</p>`
	} else {
		for _, provider := range providerOrder {
			pModels := providerModels[provider]
			providerLabel := providerLabels[provider]
			if providerLabel == "" {
				if provider == "" {
					providerLabel = "Unknown"
				} else {
					providerLabel = provider
				}
			}
			html += fmt.Sprintf(`<div style="margin-bottom:16px"><strong style="font-size:14px">%s</strong>`, templates.Esc(providerLabel))
			html += `<div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Model ID</th><th>Display Name</th><th>Input Cost/M</th><th>Output Cost/M</th><th>Context Window</th><th></th></tr></thead><tbody>`
			for i, m := range pModels {
				modelId := templates.StrVal(m, "modelId")
				displayName := templates.StrVal(m, "displayName")
				prefix := fmt.Sprintf("model_%s_%d_", provider, i)
				html += fmt.Sprintf(`<tr>
<td><input class="input" name="%smodelId" value="%s" style="min-width:140px"></td>
<td><input class="input" name="%sdisplayName" value="%s" style="min-width:120px"></td>
<td><input class="input" type="number" step="0.01" name="%sinputCost" value="%s" style="width:100px"></td>
<td><input class="input" type="number" step="0.01" name="%soutputCost" value="%s" style="width:100px"></td>
<td><input class="input" type="number" name="%scontextWindow" value="%s" style="width:110px"></td>
<td><input type="hidden" name="%sprovider" value="%s"><button type="button" class="btn" style="padding:4px 10px;font-size:12px;color:var(--danger,#e53e3e)" onclick="this.closest('tr').remove()">Remove</button></td>
</tr>`,
					prefix, templates.Esc(modelId),
					prefix, templates.Esc(displayName),
					prefix, floatStr(m, "inputCostPerMillion"),
					prefix, floatStr(m, "outputCostPerMillion"),
					prefix, intStr(m, "contextWindow"),
					prefix, templates.Esc(provider))
			}
			html += `</tbody></table></div></div>`
		}
	}

	html += `</div>

<div class="card" style="margin-bottom:16px"><div class="ct">Add Model</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">
<div class="fg"><label class="fl">Provider</label><select class="input" name="new_provider"><option value="anthropic">Anthropic</option><option value="openai">OpenAI</option><option value="google">Google</option><option value="deepseek">DeepSeek</option><option value="xai">xAI (Grok)</option><option value="mistral">Mistral</option><option value="groq">Groq</option><option value="together">Together</option><option value="fireworks">Fireworks</option><option value="moonshot">Moonshot (Kimi)</option><option value="cerebras">Cerebras</option><option value="openrouter">OpenRouter</option><option value="ollama">Ollama (Local)</option><option value="vllm">vLLM (Local)</option><option value="lmstudio">LM Studio (Local)</option><option value="litellm">LiteLLM (Local)</option></select></div>
<div class="fg"><label class="fl">Model ID</label><input class="input" name="new_modelId" placeholder="gpt-4o"></div>
<div class="fg"><label class="fl">Display Name</label><input class="input" name="new_displayName" placeholder="GPT-4o"></div>
<div class="fg"><label class="fl">Input Cost / Million Tokens</label><input class="input" type="number" step="0.01" name="new_inputCost" placeholder="2.50"></div>
<div class="fg"><label class="fl">Output Cost / Million Tokens</label><input class="input" type="number" step="0.01" name="new_outputCost" placeholder="10.00"></div>
<div class="fg"><label class="fl">Context Window</label><input class="input" type="number" name="new_contextWindow" placeholder="128000"></div>
</div></div>

<div><button class="btn btn-p" type="submit">Save Model Pricing</button></div>
</form>
</div>`

	return html
}

// saveModelPricing handles the POST for model pricing settings.
func saveModelPricing(w http.ResponseWriter, r *http.Request, s *services.Session) {
	// Collect existing models from form fields (model_{provider}_{index}_*)
	modelsMap := map[string]map[string]interface{}{} // keyed by prefix
	prefixes := []string{}

	for key := range r.Form {
		if strings.HasPrefix(key, "model_") && strings.HasSuffix(key, "provider") {
			prefix := key[:len(key)-len("provider")]
			if _, exists := modelsMap[prefix]; !exists {
				prefixes = append(prefixes, prefix)
				modelsMap[prefix] = map[string]interface{}{}
			}
		}
	}

	models := []interface{}{}
	for _, prefix := range prefixes {
		modelId := r.FormValue(prefix + "modelId")
		if modelId == "" {
			continue
		}
		inputCost, _ := strconv.ParseFloat(r.FormValue(prefix+"inputCost"), 64)
		outputCost, _ := strconv.ParseFloat(r.FormValue(prefix+"outputCost"), 64)
		contextWindow := 0
		fmt.Sscanf(r.FormValue(prefix+"contextWindow"), "%d", &contextWindow)

		models = append(models, map[string]interface{}{
			"provider":            r.FormValue(prefix + "provider"),
			"modelId":             modelId,
			"displayName":         r.FormValue(prefix + "displayName"),
			"inputCostPerMillion": inputCost,
			"outputCostPerMillion": outputCost,
			"contextWindow":       contextWindow,
		})
	}

	// Add new model if provided
	newModelId := r.FormValue("new_modelId")
	if newModelId != "" {
		newInputCost, _ := strconv.ParseFloat(r.FormValue("new_inputCost"), 64)
		newOutputCost, _ := strconv.ParseFloat(r.FormValue("new_outputCost"), 64)
		newContextWindow := 0
		fmt.Sscanf(r.FormValue("new_contextWindow"), "%d", &newContextWindow)

		models = append(models, map[string]interface{}{
			"provider":            r.FormValue("new_provider"),
			"modelId":             newModelId,
			"displayName":         r.FormValue("new_displayName"),
			"inputCostPerMillion": newInputCost,
			"outputCostPerMillion": newOutputCost,
			"contextWindow":       newContextWindow,
		})
	}

	payload := map[string]interface{}{
		"models":   models,
		"currency": "USD",
	}

	services.APICall("/api/settings/model-pricing", "PUT", s.Token, payload)
	http.Redirect(w, r, "/settings", http.StatusFound)
}

// saveToolSecurity handles the POST for tool security settings.
func saveToolSecurity(w http.ResponseWriter, r *http.Request, s *services.Session) {
	splitTrim := func(val string) []string {
		if val == "" {
			return []string{}
		}
		parts := strings.Split(val, ",")
		result := []string{}
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				result = append(result, p)
			}
		}
		return result
	}

	payload := map[string]interface{}{
		"security": map[string]interface{}{
			"pathSandbox": map[string]interface{}{
				"enabled":         r.FormValue("ps_enabled") == "1",
				"allowedDirs":     splitTrim(r.FormValue("ps_allowedDirs")),
				"blockedPatterns": splitTrim(r.FormValue("ps_blockedPatterns")),
			},
			"ssrf": map[string]interface{}{
				"enabled":      r.FormValue("ssrf_enabled") == "1",
				"allowedHosts": splitTrim(r.FormValue("ssrf_allowedHosts")),
				"blockedCidrs": splitTrim(r.FormValue("ssrf_blockedCidrs")),
			},
			"commandSanitizer": map[string]interface{}{
				"enabled":         r.FormValue("cmd_enabled") == "1",
				"mode":            r.FormValue("cmd_mode"),
				"allowedCommands": splitTrim(r.FormValue("cmd_allowedCommands")),
				"blockedPatterns": splitTrim(r.FormValue("cmd_blockedPatterns")),
			},
		},
		"middleware": map[string]interface{}{
			"audit": map[string]interface{}{
				"enabled":    r.FormValue("audit_enabled") == "1",
				"redactKeys": splitTrim(r.FormValue("audit_redactKeys")),
			},
			"rateLimit": map[string]interface{}{
				"enabled":   r.FormValue("rl_enabled") == "1",
				"overrides": map[string]interface{}{},
			},
			"circuitBreaker": map[string]interface{}{
				"enabled": r.FormValue("cb_enabled") == "1",
			},
			"telemetry": map[string]interface{}{
				"enabled": r.FormValue("tel_enabled") == "1",
			},
		},
	}

	services.APICall("/api/settings/tool-security", "PUT", s.Token, payload)
	http.Redirect(w, r, "/settings", http.StatusFound)
}
