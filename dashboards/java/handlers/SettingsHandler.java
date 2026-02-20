/**
 * SettingsHandler — Read + update organization settings.
 * Routes: GET /settings, POST /settings
 */

import com.sun.net.httpserver.*;
import java.io.*;
import java.util.*;

public class SettingsHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            if ("POST".equals(ex.getRequestMethod())) {
                handleUpdate(ex);
                return;
            }

            handleRead(ex);

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }

    private void handleUpdate(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);
        Map<String, String> form = SessionManager.parseForm(ex);

        // Check if this is a tool security save
        if ("tool-security".equals(form.get("_form"))) {
            handleToolSecurityUpdate(ex, token, form);
            return;
        }

        // Check if this is a firewall save
        if ("firewall".equals(form.get("_form"))) {
            handleFirewallUpdate(ex, token, form);
            return;
        }

        // Check if this is a model pricing save
        if ("model-pricing".equals(form.get("_form"))) {
            handleModelPricingUpdate(ex, token, form);
            return;
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        String[] fields = {"org_name", "default_model", "max_agents", "rate_limit", "webhook_url"};
        for (String key : fields) {
            String val = form.get(key);
            if (val != null && !val.isEmpty()) {
                // Convert numeric fields
                if ("max_agents".equals(key) || "rate_limit".equals(key)) {
                    try {
                        payload.put(key, Integer.parseInt(val));
                    } catch (NumberFormatException e) {
                        payload.put(key, val);
                    }
                } else {
                    payload.put(key, val);
                }
            }
        }

        var result = ApiClient.patch("/api/settings", token, ApiClient.toJsonMixed(payload));
        int status = Helpers.intVal(result, "_status");

        if (status > 0 && status < 300) {
            SessionManager.setFlash(ex, "Settings updated successfully", "success");
        } else {
            String err = Helpers.strVal(result, "error");
            if (err.isEmpty()) err = "Failed to update settings";
            SessionManager.setFlash(ex, err, "danger");
        }

        SessionManager.redirect(ex, "/settings");
    }

    private void handleToolSecurityUpdate(HttpExchange ex, String token, Map<String, String> form) throws IOException {
        Map<String, Object> payload = new LinkedHashMap<>();

        Map<String, Object> security = new LinkedHashMap<>();

        Map<String, Object> pathSandbox = new LinkedHashMap<>();
        pathSandbox.put("enabled", "1".equals(form.get("ps_enabled")));
        pathSandbox.put("allowedDirs", splitTrim(form.getOrDefault("ps_allowedDirs", "")));
        pathSandbox.put("blockedPatterns", splitTrim(form.getOrDefault("ps_blockedPatterns", "")));
        security.put("pathSandbox", pathSandbox);

        Map<String, Object> ssrf = new LinkedHashMap<>();
        ssrf.put("enabled", "1".equals(form.get("ssrf_enabled")));
        ssrf.put("allowedHosts", splitTrim(form.getOrDefault("ssrf_allowedHosts", "")));
        ssrf.put("blockedCidrs", splitTrim(form.getOrDefault("ssrf_blockedCidrs", "")));
        security.put("ssrf", ssrf);

        Map<String, Object> cmdSanitizer = new LinkedHashMap<>();
        cmdSanitizer.put("enabled", "1".equals(form.get("cmd_enabled")));
        cmdSanitizer.put("mode", form.getOrDefault("cmd_mode", "blocklist"));
        cmdSanitizer.put("allowedCommands", splitTrim(form.getOrDefault("cmd_allowedCommands", "")));
        cmdSanitizer.put("blockedPatterns", splitTrim(form.getOrDefault("cmd_blockedPatterns", "")));
        security.put("commandSanitizer", cmdSanitizer);

        payload.put("security", security);

        Map<String, Object> middleware = new LinkedHashMap<>();

        Map<String, Object> audit = new LinkedHashMap<>();
        audit.put("enabled", "1".equals(form.get("audit_enabled")));
        audit.put("redactKeys", splitTrim(form.getOrDefault("audit_redactKeys", "")));
        middleware.put("audit", audit);

        Map<String, Object> rateLimit = new LinkedHashMap<>();
        rateLimit.put("enabled", "1".equals(form.get("rl_enabled")));
        rateLimit.put("overrides", new LinkedHashMap<>());
        middleware.put("rateLimit", rateLimit);

        Map<String, Object> circuitBreaker = new LinkedHashMap<>();
        circuitBreaker.put("enabled", "1".equals(form.get("cb_enabled")));
        middleware.put("circuitBreaker", circuitBreaker);

        Map<String, Object> telemetry = new LinkedHashMap<>();
        telemetry.put("enabled", "1".equals(form.get("tel_enabled")));
        middleware.put("telemetry", telemetry);

        payload.put("middleware", middleware);

        var result = ApiClient.put("/api/settings/tool-security", token, buildNestedJson(payload));
        int status = Helpers.intVal(result, "_status");

        if (status > 0 && status < 300) {
            SessionManager.setFlash(ex, "Tool security settings updated", "success");
        } else {
            String err = Helpers.strVal(result, "error");
            if (err.isEmpty()) err = "Failed to update tool security settings";
            SessionManager.setFlash(ex, err, "danger");
        }

        SessionManager.redirect(ex, "/settings");
    }

    private List<String> splitTrim(String val) {
        List<String> result = new ArrayList<>();
        if (val == null || val.isEmpty()) return result;
        for (String part : val.split(",")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) result.add(trimmed);
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private String buildNestedJson(Map<String, Object> map) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (var entry : map.entrySet()) {
            if (!first) sb.append(",");
            first = false;
            sb.append("\"").append(escJson(entry.getKey())).append("\":");
            appendValue(sb, entry.getValue());
        }
        sb.append("}");
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private void appendValue(StringBuilder sb, Object v) {
        if (v == null) {
            sb.append("null");
        } else if (v instanceof Boolean) {
            sb.append(v);
        } else if (v instanceof Number) {
            sb.append(v);
        } else if (v instanceof Map) {
            sb.append(buildNestedJson((Map<String, Object>) v));
        } else if (v instanceof List) {
            sb.append("[");
            boolean f = true;
            for (Object item : (List<?>) v) {
                if (!f) sb.append(",");
                f = false;
                if (item instanceof String) {
                    sb.append("\"").append(escJson(item.toString())).append("\"");
                } else {
                    appendValue(sb, item);
                }
            }
            sb.append("]");
        } else {
            sb.append("\"").append(escJson(v.toString())).append("\"");
        }
    }

    private String escJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
    }

    private void handleRead(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);
        var settings = ApiClient.get("/api/settings", token);

        StringBuilder html = new StringBuilder();
        html.append(Components.pageHeader("Settings", "Configure your AgenticMail Enterprise instance"));

        // Tabs
        html.append("<div style='border-bottom:1px solid var(--border);margin-bottom:20px'>");
        html.append("<div class='tabs' style='padding:0'>");
        html.append("<div class='tab active' data-settings-tab='general' onclick=\"switchSettingsTab('general')\">General</div>");
        html.append("<div class='tab' data-settings-tab='tool-security' onclick=\"switchSettingsTab('tool-security')\">Tool Security</div>");
        html.append("<div class='tab' data-settings-tab='firewall' onclick=\"switchSettingsTab('firewall')\">Network &amp; Firewall</div>");
        html.append("<div class='tab' data-settings-tab='model-pricing' onclick=\"switchSettingsTab('model-pricing')\">Model Pricing</div>");
        html.append("</div></div>");

        // General panel start
        html.append("<div id='settings-panel-general'>");

        // Settings form
        html.append("<div class='card'>");
        html.append("<div style='display:flex;align-items:center;gap:0'>");
        html.append("<h3>Organization Settings</h3>");
        html.append("<button class='settings-help-btn' onclick=\"toggleSettingsHelp('general')\" title='Learn more'>?</button>");
        html.append("</div>");
        html.append("<div id='help-general' class='settings-help-panel'>");
        html.append("<p>The General section configures your organization&rsquo;s identity and email delivery.</p>");
        html.append("<h4>Organization</h4>");
        html.append("<ul>");
        html.append("<li><strong>Company Name</strong> &mdash; Appears throughout the dashboard and in emails sent by agents.</li>");
        html.append("<li><strong>Domain</strong> &mdash; Your company&rsquo;s primary domain, used for agent email addresses.</li>");
        html.append("<li><strong>Subdomain</strong> &mdash; Your unique ID on the AgenticMail cloud (subdomain.agenticmail.io).</li>");
        html.append("<li><strong>Logo URL</strong> &mdash; Link to your company logo, shown in dashboard and emails.</li>");
        html.append("<li><strong>Primary Color</strong> &mdash; Customizes the dashboard accent color to match your brand.</li>");
        html.append("</ul>");
        html.append("<h4>SMTP Configuration</h4>");
        html.append("<p>Controls outgoing email delivery. Leave blank to use the default AgenticMail relay. Configure custom SMTP to send from your own mail infrastructure.</p>");
        html.append("</div>");
        html.append("<form method='POST' action='/settings'>");
        html.append("<div class='form-row'>");
        html.append("<div class='form-group'><label>Organization Name</label>");
        html.append("<input type='text' name='org_name' value='").append(Helpers.esc(Helpers.strVal(settings, "org_name")));
        html.append("' placeholder='Your Org'></div>");
        html.append("<div class='form-group'><label>Default Model</label>");
        html.append("<input type='text' name='default_model' value='").append(Helpers.esc(Helpers.strVal(settings, "default_model")));
        html.append("' placeholder='gpt-4o'></div>");
        html.append("</div>");

        html.append("<div class='form-row'>");
        html.append("<div class='form-group'><label>Max Agents</label>");
        html.append("<input type='number' name='max_agents' value='").append(Helpers.esc(Helpers.strVal(settings, "max_agents")));
        html.append("' placeholder='50'></div>");
        html.append("<div class='form-group'><label>Rate Limit (req/min)</label>");
        html.append("<input type='number' name='rate_limit' value='").append(Helpers.esc(Helpers.strVal(settings, "rate_limit")));
        html.append("' placeholder='1000'></div>");
        html.append("</div>");

        html.append("<div class='form-group'><label>Webhook URL</label>");
        html.append("<input type='url' name='webhook_url' value='").append(Helpers.esc(Helpers.strVal(settings, "webhook_url")));
        html.append("' placeholder='https://hooks.example.com/events'></div>");

        html.append("<button class='btn btn-primary' type='submit'>Save Settings</button>");
        html.append("</form>");
        html.append("</div>");

        // Instance info
        html.append(Components.cardStart("Instance Information"));
        html.append("<div class='table-wrap'><table><tbody>");

        html.append("<tr><td style='font-weight:600;width:200px'>API Endpoint</td>");
        html.append("<td><code>").append(Helpers.esc(ApiClient.API_URL)).append("</code></td></tr>");

        String version = Helpers.strVal(settings, "version");
        if (version.isEmpty()) version = Helpers.strVal(settings, "app_version");
        if (version.isEmpty()) version = "-";
        html.append("<tr><td style='font-weight:600'>Version</td>");
        html.append("<td>").append(Helpers.esc(version)).append("</td></tr>");

        String plan = Helpers.strVal(settings, "plan");
        if (plan.isEmpty()) plan = Helpers.strVal(settings, "tier");
        if (plan.isEmpty()) plan = "Enterprise";
        html.append("<tr><td style='font-weight:600'>Plan</td>");
        html.append("<td>").append(Helpers.esc(plan)).append("</td></tr>");

        String region = Helpers.strVal(settings, "region");
        if (region.isEmpty()) region = "-";
        html.append("<tr><td style='font-weight:600'>Region</td>");
        html.append("<td>").append(Helpers.esc(region)).append("</td></tr>");

        // Additional fields that might exist
        String domain = Helpers.strVal(settings, "domain");
        if (!domain.isEmpty()) {
            html.append("<tr><td style='font-weight:600'>Domain</td>");
            html.append("<td>").append(Helpers.esc(domain)).append("</td></tr>");
        }

        String subdomain = Helpers.strVal(settings, "subdomain");
        if (!subdomain.isEmpty()) {
            html.append("<tr><td style='font-weight:600'>Subdomain</td>");
            html.append("<td>").append(Helpers.esc(subdomain)).append(".agenticmail.io</td></tr>");
        }

        String name = Helpers.strVal(settings, "name");
        if (!name.isEmpty()) {
            html.append("<tr><td style='font-weight:600'>Org Name</td>");
            html.append("<td>").append(Helpers.esc(name)).append("</td></tr>");
        }

        html.append("</tbody></table></div>");
        html.append(Components.cardEnd());

        // General panel end
        html.append("</div>");

        // Tool Security panel
        renderToolSecurityPanel(html, token);

        // Firewall panel
        renderFirewallPanel(html, token);

        // Model Pricing panel
        renderModelPricingPanel(html, token);

        // Help panel styles
        html.append("<style>");
        html.append(".settings-help-btn{background:none;border:1px solid var(--border,#ddd);border-radius:50%;width:22px;height:22px;font-size:13px;font-weight:700;color:var(--text-muted,#888);cursor:pointer;margin-left:8px;line-height:1;padding:0;display:inline-flex;align-items:center;justify-content:center}");
        html.append(".settings-help-btn:hover{background:var(--bg-secondary,#f0f0f0);color:var(--text,#333)}");
        html.append(".settings-help-panel{max-height:0;overflow:hidden;transition:max-height .3s ease,padding .3s ease;padding:0 16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;margin-bottom:0;border:1px solid transparent}");
        html.append(".settings-help-panel.open{max-height:600px;padding:16px;border-color:var(--border,#ddd);margin-bottom:16px}");
        html.append(".settings-help-panel h4{margin:12px 0 6px;font-size:14px}");
        html.append(".settings-help-panel ul{margin:4px 0 8px 18px;padding:0}");
        html.append(".settings-help-panel li{margin-bottom:4px;font-size:13px;line-height:1.5}");
        html.append(".settings-help-panel p{margin:4px 0 8px;font-size:13px;line-height:1.5}");
        html.append("</style>");

        // Tab switching script + help toggle
        html.append("<script>");
        html.append("function switchSettingsTab(tab){document.querySelectorAll('[id^=\"settings-panel-\"]').forEach(function(p){p.style.display='none'});document.querySelectorAll('[data-settings-tab]').forEach(function(t){t.classList.remove('active')});document.getElementById('settings-panel-'+tab).style.display='block';document.querySelector('[data-settings-tab=\"'+tab+'\"]').classList.add('active')}");
        html.append("function toggleSettingsHelp(id){var p=document.getElementById('help-'+id);if(p)p.classList.toggle('open')}");
        html.append("</script>");

        String flash = SessionManager.consumeFlash(ex);
        SessionManager.respond(ex, 200, Layout.layout("/settings", SessionManager.getUser(ex), flash, html.toString()));
    }

    @SuppressWarnings("unchecked")
    private void renderToolSecurityPanel(StringBuilder html, String token) {
        var tsData = ApiClient.get("/api/settings/tool-security", token);
        if (tsData == null) tsData = new HashMap<>();

        // Unwrap toolSecurityConfig if present
        Map<String, Object> cfg = tsData;
        Map<String, Object> tsc = Helpers.mapVal(tsData, "toolSecurityConfig");
        if (!tsc.isEmpty()) cfg = tsc;

        Map<String, Object> security = Helpers.mapVal(cfg, "security");
        Map<String, Object> middleware = Helpers.mapVal(cfg, "middleware");

        // Security sub-objects
        Map<String, Object> pathSandbox = Helpers.mapVal(security, "pathSandbox");
        Map<String, Object> ssrf = Helpers.mapVal(security, "ssrf");
        Map<String, Object> cmdSanitizer = Helpers.mapVal(security, "commandSanitizer");

        // Middleware sub-objects
        Map<String, Object> audit = Helpers.mapVal(middleware, "audit");
        Map<String, Object> rateLimit = Helpers.mapVal(middleware, "rateLimit");
        Map<String, Object> circuitBreaker = Helpers.mapVal(middleware, "circuitBreaker");
        Map<String, Object> telemetry = Helpers.mapVal(middleware, "telemetry");

        String cmdMode = Helpers.strVal(cmdSanitizer, "mode");
        if (cmdMode.isEmpty()) cmdMode = "blocklist";

        html.append("<div id='settings-panel-tool-security' style='display:none'>");
        html.append("<form method='POST' action='/settings'>");
        html.append("<input type='hidden' name='_form' value='tool-security'>");

        // Security Policies card
        html.append("<div class='card'>");
        html.append("<div style='display:flex;align-items:center;gap:0'>");
        html.append("<h3>Security Policies</h3>");
        html.append("<button class='settings-help-btn' onclick=\"toggleSettingsHelp('tool-security')\" title='Learn more'>?</button>");
        html.append("</div>");
        html.append("<div id='help-tool-security' class='settings-help-panel'>");
        html.append("<p>Tool Security controls what AI agents are allowed to do at the system level &mdash; safety guardrails that prevent agents from accessing sensitive resources.</p>");
        html.append("<h4>Security Sandboxes</h4>");
        html.append("<ul>");
        html.append("<li><strong>Path Sandbox</strong> &mdash; Restricts which folders agents can read/write. Prevents access to sensitive files.</li>");
        html.append("<li><strong>SSRF Protection</strong> &mdash; Blocks agents from reaching internal networks, cloud metadata, or private IPs.</li>");
        html.append("<li><strong>Command Sanitizer</strong> &mdash; Controls which shell commands agents can execute. Blocklist blocks dangerous patterns; Allowlist only permits specified commands.</li>");
        html.append("</ul>");
        html.append("</div>");
        html.append("<div style='display:grid;gap:20px'>");

        // Path Sandbox
        html.append("<div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
        html.append("<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>");
        html.append("<div><strong style='font-size:14px'>Path Sandbox</strong><div style='font-size:12px;color:var(--text-muted)'>Restrict file system access to allowed directories</div></div>");
        html.append("<label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='ps_enabled' value='1'").append(checkedAttr(pathSandbox, "enabled")).append("> Enabled</label>");
        html.append("</div>");
        html.append("<div class='form-group'><label>Allowed Directories (comma-separated)</label>");
        html.append("<input type='text' name='ps_allowedDirs' value='").append(Helpers.esc(joinList(pathSandbox, "allowedDirs"))).append("' placeholder='/tmp, /var/data'></div>");
        html.append("<div class='form-group'><label>Blocked Patterns (comma-separated)</label>");
        html.append("<input type='text' name='ps_blockedPatterns' value='").append(Helpers.esc(joinList(pathSandbox, "blockedPatterns"))).append("' placeholder='*.exe, /etc/shadow'></div>");
        html.append("</div>");

        // SSRF Protection
        html.append("<div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
        html.append("<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>");
        html.append("<div><strong style='font-size:14px'>SSRF Protection</strong><div style='font-size:12px;color:var(--text-muted)'>Prevent server-side request forgery attacks</div></div>");
        html.append("<label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='ssrf_enabled' value='1'").append(checkedAttr(ssrf, "enabled")).append("> Enabled</label>");
        html.append("</div>");
        html.append("<div class='form-group'><label>Allowed Hosts (comma-separated)</label>");
        html.append("<input type='text' name='ssrf_allowedHosts' value='").append(Helpers.esc(joinList(ssrf, "allowedHosts"))).append("' placeholder='api.example.com, cdn.example.com'></div>");
        html.append("<div class='form-group'><label>Blocked CIDRs (comma-separated)</label>");
        html.append("<input type='text' name='ssrf_blockedCidrs' value='").append(Helpers.esc(joinList(ssrf, "blockedCidrs"))).append("' placeholder='10.0.0.0/8, 172.16.0.0/12'></div>");
        html.append("</div>");

        // Command Sanitizer
        html.append("<div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
        html.append("<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>");
        html.append("<div><strong style='font-size:14px'>Command Sanitizer</strong><div style='font-size:12px;color:var(--text-muted)'>Control which shell commands agents can execute</div></div>");
        html.append("<label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='cmd_enabled' value='1'").append(checkedAttr(cmdSanitizer, "enabled")).append("> Enabled</label>");
        html.append("</div>");
        html.append("<div class='form-group'><label>Mode</label>");
        html.append("<select name='cmd_mode'><option value='blocklist'").append("blocklist".equals(cmdMode) ? " selected" : "").append(">Blocklist</option>");
        html.append("<option value='allowlist'").append("allowlist".equals(cmdMode) ? " selected" : "").append(">Allowlist</option></select></div>");
        html.append("<div class='form-group'><label>Allowed Commands (comma-separated)</label>");
        html.append("<input type='text' name='cmd_allowedCommands' value='").append(Helpers.esc(joinList(cmdSanitizer, "allowedCommands"))).append("' placeholder='ls, cat, grep'></div>");
        html.append("<div class='form-group'><label>Blocked Patterns (comma-separated)</label>");
        html.append("<input type='text' name='cmd_blockedPatterns' value='").append(Helpers.esc(joinList(cmdSanitizer, "blockedPatterns"))).append("' placeholder='rm -rf, sudo, chmod'></div>");
        html.append("</div>");

        html.append("</div>");
        html.append("</div>");

        // Middleware card
        html.append("<div class='card'>");
        html.append("<div style='display:flex;align-items:center;gap:0'>");
        html.append("<h3>Middleware</h3>");
        html.append("<button class='settings-help-btn' onclick=\"toggleSettingsHelp('middleware')\" title='Learn more'>?</button>");
        html.append("</div>");
        html.append("<div id='help-middleware' class='settings-help-panel'>");
        html.append("<h4>Middleware &amp; Observability</h4>");
        html.append("<ul>");
        html.append("<li><strong>Audit Logging</strong> &mdash; Records every tool action: what, when, success/failure, duration. Sensitive fields are auto-redacted.</li>");
        html.append("<li><strong>Rate Limiting</strong> &mdash; Limits tool calls per minute per agent. Prevents system overload.</li>");
        html.append("<li><strong>Circuit Breaker</strong> &mdash; Auto-pauses tools that keep failing (5 consecutive errors). Waits 30s before retry.</li>");
        html.append("<li><strong>Telemetry</strong> &mdash; Collects performance metrics: call duration, success rates, output sizes.</li>");
        html.append("</ul>");
        html.append("</div>");
        html.append("<div style='display:grid;grid-template-columns:1fr 1fr;gap:16px'>");

        // Audit
        html.append("<div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
        html.append("<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>");
        html.append("<div><strong style='font-size:14px'>Audit Logging</strong><div style='font-size:12px;color:var(--text-muted)'>Log all tool invocations</div></div>");
        html.append("<label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='audit_enabled' value='1'").append(checkedAttr(audit, "enabled")).append("> Enabled</label>");
        html.append("</div>");
        html.append("<div class='form-group'><label>Redact Keys (comma-separated)</label>");
        html.append("<input type='text' name='audit_redactKeys' value='").append(Helpers.esc(joinList(audit, "redactKeys"))).append("' placeholder='password, secret, token'></div>");
        html.append("</div>");

        // Rate Limiting
        html.append("<div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
        html.append("<div style='display:flex;justify-content:space-between;align-items:center'>");
        html.append("<div><strong style='font-size:14px'>Rate Limiting</strong><div style='font-size:12px;color:var(--text-muted)'>Throttle tool calls</div></div>");
        html.append("<label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='rl_enabled' value='1'").append(checkedAttr(rateLimit, "enabled")).append("> Enabled</label>");
        html.append("</div></div>");

        // Circuit Breaker
        html.append("<div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
        html.append("<div style='display:flex;justify-content:space-between;align-items:center'>");
        html.append("<div><strong style='font-size:14px'>Circuit Breaker</strong><div style='font-size:12px;color:var(--text-muted)'>Halt tools after repeated failures</div></div>");
        html.append("<label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='cb_enabled' value='1'").append(checkedAttr(circuitBreaker, "enabled")).append("> Enabled</label>");
        html.append("</div></div>");

        // Telemetry
        html.append("<div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
        html.append("<div style='display:flex;justify-content:space-between;align-items:center'>");
        html.append("<div><strong style='font-size:14px'>Telemetry</strong><div style='font-size:12px;color:var(--text-muted)'>Collect tool usage metrics</div></div>");
        html.append("<label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='tel_enabled' value='1'").append(checkedAttr(telemetry, "enabled")).append("> Enabled</label>");
        html.append("</div></div>");

        html.append("</div>");
        html.append("</div>");

        html.append("<button class='btn btn-primary' type='submit'>Save Tool Security</button>");
        html.append("</form>");
        html.append("</div>");
    }

    @SuppressWarnings("unchecked")
    private void renderFirewallPanel(StringBuilder html, String token) {
        var fwData = ApiClient.get("/api/settings/firewall", token);
        if (fwData == null) fwData = new HashMap<>();

        // Unwrap firewallConfig if present
        Map<String, Object> cfg = fwData;
        Map<String, Object> fc = Helpers.mapVal(fwData, "firewallConfig");
        if (!fc.isEmpty()) cfg = fc;

        Map<String, Object> ipAccess = Helpers.mapVal(cfg, "ipAccess");
        Map<String, Object> egress = Helpers.mapVal(cfg, "egress");
        Map<String, Object> proxy = Helpers.mapVal(cfg, "proxy");
        Map<String, Object> trustedProxies = Helpers.mapVal(cfg, "trustedProxies");
        Map<String, Object> network = Helpers.mapVal(cfg, "network");
        Map<String, Object> netRateLimit = Helpers.mapVal(network, "rateLimit");
        Map<String, Object> httpsEnforcement = Helpers.mapVal(network, "httpsEnforcement");
        Map<String, Object> secHeaders = Helpers.mapVal(network, "securityHeaders");

        String ipMode = Helpers.strVal(ipAccess, "mode");
        if (ipMode.isEmpty()) ipMode = "allowlist";

        String egressMode = Helpers.strVal(egress, "mode");
        if (egressMode.isEmpty()) egressMode = "blocklist";

        int rpm = Helpers.intVal(netRateLimit, "requestsPerMinute");
        if (rpm == 0) rpm = 120;

        int hstsMaxAge = Helpers.intVal(secHeaders, "hstsMaxAge");
        if (hstsMaxAge == 0) hstsMaxAge = 31536000;

        String xFrameOptions = Helpers.strVal(secHeaders, "xFrameOptions");
        if (xFrameOptions.isEmpty()) xFrameOptions = "DENY";

        String referrerPolicy = Helpers.strVal(secHeaders, "referrerPolicy");
        if (referrerPolicy.isEmpty()) referrerPolicy = "strict-origin-when-cross-origin";

        String permissionsPolicy = Helpers.strVal(secHeaders, "permissionsPolicy");
        if (permissionsPolicy.isEmpty()) permissionsPolicy = "camera=(), microphone=(), geolocation=()";

        html.append("<div id='settings-panel-firewall' style='display:none'>");
        html.append("<form method='POST' action='/settings'>");
        html.append("<input type='hidden' name='_form' value='firewall'>");

        // IP Access Control card
        html.append("<div class='card'>");
        html.append("<div style='display:flex;align-items:center;gap:0'>");
        html.append("<h3>IP Access Control</h3>");
        html.append("<button class='settings-help-btn' onclick=\"toggleSettingsHelp('ip-access')\" title='Learn more'>?</button>");
        html.append("</div>");
        html.append("<div id='help-ip-access' class='settings-help-panel'>");
        html.append("<p>Restricts which IPs can reach the dashboard and APIs. Allowlist = only listed IPs connect. Blocklist = all except blocked IPs.</p>");
        html.append("</div>");
        html.append("<div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
        html.append("<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>");
        html.append("<div><strong style='font-size:14px'>IP Access Control</strong><div style='font-size:12px;color:var(--text-muted)'>Restrict access by IP address</div></div>");
        html.append("<label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='ip_enabled' value='1'").append(checkedAttr(ipAccess, "enabled")).append("> Enabled</label>");
        html.append("</div>");
        html.append("<div style='display:grid;grid-template-columns:1fr 1fr;gap:14px'>");
        html.append("<div class='form-group'><label>Mode</label>");
        html.append("<select name='ip_mode'><option value='allowlist'").append("allowlist".equals(ipMode) ? " selected" : "").append(">Allowlist</option>");
        html.append("<option value='blocklist'").append("blocklist".equals(ipMode) ? " selected" : "").append(">Blocklist</option></select></div>");
        html.append("<div></div>");
        html.append("<div class='form-group'><label>Allowlist IPs (comma-separated)</label>");
        html.append("<input type='text' name='ip_allowlist' value='").append(Helpers.esc(joinList(ipAccess, "allowlist"))).append("' placeholder='192.168.1.0/24, 10.0.0.1'></div>");
        html.append("<div class='form-group'><label>Blocklist IPs (comma-separated)</label>");
        html.append("<input type='text' name='ip_blocklist' value='").append(Helpers.esc(joinList(ipAccess, "blocklist"))).append("' placeholder='203.0.113.0/24'></div>");
        html.append("<div class='form-group' style='grid-column:1/-1'><label>Bypass Paths (comma-separated)</label>");
        html.append("<input type='text' name='ip_bypassPaths' value='").append(Helpers.esc(joinList(ipAccess, "bypassPaths"))).append("' placeholder='/health, /ready'></div>");
        html.append("</div></div>");
        html.append("</div>");

        // Outbound Egress card
        html.append("<div class='card'>");
        html.append("<div style='display:flex;align-items:center;gap:0'>");
        html.append("<h3>Outbound Egress</h3>");
        html.append("<button class='settings-help-btn' onclick=\"toggleSettingsHelp('egress')\" title='Learn more'>?</button>");
        html.append("</div>");
        html.append("<div id='help-egress' class='settings-help-panel'>");
        html.append("<p>Controls which external hosts/ports agents can reach. Allowlist = only approved hosts. Blocklist = everything except blocked hosts.</p>");
        html.append("</div>");
        html.append("<div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
        html.append("<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>");
        html.append("<div><strong style='font-size:14px'>Egress Filtering</strong><div style='font-size:12px;color:var(--text-muted)'>Control outbound network connections</div></div>");
        html.append("<label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='eg_enabled' value='1'").append(checkedAttr(egress, "enabled")).append("> Enabled</label>");
        html.append("</div>");
        html.append("<div style='display:grid;grid-template-columns:1fr 1fr;gap:14px'>");
        html.append("<div class='form-group'><label>Mode</label>");
        html.append("<select name='eg_mode'><option value='blocklist'").append("blocklist".equals(egressMode) ? " selected" : "").append(">Blocklist</option>");
        html.append("<option value='allowlist'").append("allowlist".equals(egressMode) ? " selected" : "").append(">Allowlist</option></select></div>");
        html.append("<div></div>");
        html.append("<div class='form-group'><label>Allowed Hosts (comma-separated)</label>");
        html.append("<input type='text' name='eg_allowedHosts' value='").append(Helpers.esc(joinList(egress, "allowedHosts"))).append("' placeholder='api.example.com'></div>");
        html.append("<div class='form-group'><label>Blocked Hosts (comma-separated)</label>");
        html.append("<input type='text' name='eg_blockedHosts' value='").append(Helpers.esc(joinList(egress, "blockedHosts"))).append("' placeholder='evil.com'></div>");
        html.append("<div class='form-group'><label>Allowed Ports (comma-separated)</label>");
        html.append("<input type='text' name='eg_allowedPorts' value='").append(Helpers.esc(joinList(egress, "allowedPorts"))).append("' placeholder='443, 80'></div>");
        html.append("<div class='form-group'><label>Blocked Ports (comma-separated)</label>");
        html.append("<input type='text' name='eg_blockedPorts' value='").append(Helpers.esc(joinList(egress, "blockedPorts"))).append("' placeholder='25, 445'></div>");
        html.append("</div></div>");
        html.append("</div>");

        // Proxy Configuration card
        html.append("<div class='card'>");
        html.append("<div style='display:flex;align-items:center;gap:0'>");
        html.append("<h3>Proxy Configuration</h3>");
        html.append("<button class='settings-help-btn' onclick=\"toggleSettingsHelp('proxy')\" title='Learn more'>?</button>");
        html.append("</div>");
        html.append("<div id='help-proxy' class='settings-help-panel'>");
        html.append("<ul>");
        html.append("<li><strong>Proxy Config</strong> &mdash; HTTP/HTTPS proxy URLs for outbound access. &ldquo;No-Proxy&rdquo; bypasses the proxy.</li>");
        html.append("<li><strong>Trusted Proxies</strong> &mdash; IPs of your load balancers/reverse proxies, so IP access control sees real client IPs.</li>");
        html.append("</ul>");
        html.append("</div>");
        html.append("<div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
        html.append("<div style='display:grid;grid-template-columns:1fr 1fr;gap:14px'>");
        html.append("<div class='form-group'><label>HTTP Proxy</label>");
        html.append("<input type='text' name='proxy_http' value='").append(Helpers.esc(Helpers.strVal(proxy, "httpProxy"))).append("' placeholder='http://proxy:8080'></div>");
        html.append("<div class='form-group'><label>HTTPS Proxy</label>");
        html.append("<input type='text' name='proxy_https' value='").append(Helpers.esc(Helpers.strVal(proxy, "httpsProxy"))).append("' placeholder='http://proxy:8443'></div>");
        html.append("<div class='form-group' style='grid-column:1/-1'><label>No-Proxy Hosts (comma-separated)</label>");
        html.append("<input type='text' name='proxy_noProxy' value='").append(Helpers.esc(joinList(proxy, "noProxy"))).append("' placeholder='localhost, 127.0.0.1'></div>");
        html.append("</div></div>");
        html.append("</div>");

        // Trusted Proxies card
        html.append("<div class='card'>");
        html.append("<div style='display:flex;align-items:center;gap:0'>");
        html.append("<h3>Trusted Proxies</h3>");
        html.append("<button class='settings-help-btn' onclick=\"toggleSettingsHelp('trusted-proxies')\" title='Learn more'>?</button>");
        html.append("</div>");
        html.append("<div id='help-trusted-proxies' class='settings-help-panel'>");
        html.append("<p>IPs of your load balancers/reverse proxies, so IP access control sees real client IPs instead of proxy IPs.</p>");
        html.append("</div>");
        html.append("<div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
        html.append("<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>");
        html.append("<div><strong style='font-size:14px'>Trusted Proxies</strong><div style='font-size:12px;color:var(--text-muted)'>Configure trusted reverse proxy IPs/CIDRs</div></div>");
        html.append("<label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='tp_enabled' value='1'").append(checkedAttr(trustedProxies, "enabled")).append("> Enabled</label>");
        html.append("</div>");
        html.append("<div class='form-group'><label>IPs/CIDRs (comma-separated)</label>");
        html.append("<input type='text' name='tp_ips' value='").append(Helpers.esc(joinList(trustedProxies, "ips"))).append("' placeholder='10.0.0.0/8, 172.16.0.0/12'></div>");
        html.append("</div>");
        html.append("</div>");

        // Network Settings card
        html.append("<div class='card'>");
        html.append("<div style='display:flex;align-items:center;gap:0'>");
        html.append("<h3>Network Settings</h3>");
        html.append("<button class='settings-help-btn' onclick=\"toggleSettingsHelp('network')\" title='Learn more'>?</button>");
        html.append("</div>");
        html.append("<div id='help-network' class='settings-help-panel'>");
        html.append("<ul>");
        html.append("<li><strong>CORS Origins</strong> &mdash; Which websites can make API calls to AgenticMail. Empty = allow all.</li>");
        html.append("<li><strong>Rate Limiting</strong> &mdash; Limits API requests per IP per minute. Protects against abuse.</li>");
        html.append("<li><strong>HTTPS Enforcement</strong> &mdash; Forces encrypted connections. Recommended for production.</li>");
        html.append("<li><strong>Security Headers</strong> &mdash; Browser security: HSTS, X-Frame-Options, Content-Type-Options.</li>");
        html.append("</ul>");
        html.append("</div>");
        html.append("<div style='display:grid;gap:20px'>");

        // CORS
        html.append("<div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
        html.append("<strong style='font-size:14px'>CORS</strong><div style='font-size:12px;color:var(--text-muted);margin-bottom:12px'>Allowed origins for cross-origin requests</div>");
        html.append("<div class='form-group'><label>CORS Origins (comma-separated)</label>");
        html.append("<input type='text' name='net_corsOrigins' value='").append(Helpers.esc(joinList(network, "corsOrigins"))).append("' placeholder='https://app.example.com'></div>");
        html.append("</div>");

        // Rate Limiting
        html.append("<div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
        html.append("<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>");
        html.append("<div><strong style='font-size:14px'>Rate Limiting</strong><div style='font-size:12px;color:var(--text-muted)'>Throttle incoming requests</div></div>");
        html.append("<label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='net_rl_enabled' value='1'").append(checkedAttr(netRateLimit, "enabled")).append("> Enabled</label>");
        html.append("</div>");
        html.append("<div style='display:grid;grid-template-columns:1fr 1fr;gap:14px'>");
        html.append("<div class='form-group'><label>Requests Per Minute</label>");
        html.append("<input type='number' name='net_rl_rpm' value='").append(rpm).append("' placeholder='120'></div>");
        html.append("<div class='form-group'><label>Skip Paths (comma-separated)</label>");
        html.append("<input type='text' name='net_rl_skipPaths' value='").append(Helpers.esc(joinList(netRateLimit, "skipPaths"))).append("' placeholder='/health, /ready'></div>");
        html.append("</div></div>");

        // HTTPS Enforcement
        html.append("<div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
        html.append("<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>");
        html.append("<div><strong style='font-size:14px'>HTTPS Enforcement</strong><div style='font-size:12px;color:var(--text-muted)'>Redirect HTTP to HTTPS</div></div>");
        html.append("<label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='net_https_enabled' value='1'").append(checkedAttr(httpsEnforcement, "enabled")).append("> Enabled</label>");
        html.append("</div>");
        html.append("<div class='form-group'><label>Exclude Paths (comma-separated)</label>");
        html.append("<input type='text' name='net_https_excludePaths' value='").append(Helpers.esc(joinList(httpsEnforcement, "excludePaths"))).append("' placeholder='/health, /ready'></div>");
        html.append("</div>");

        // Security Headers
        html.append("<div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
        html.append("<strong style='font-size:14px'>Security Headers</strong><div style='font-size:12px;color:var(--text-muted);margin-bottom:12px'>HTTP security response headers</div>");
        html.append("<div style='display:grid;grid-template-columns:1fr 1fr;gap:14px'>");
        html.append("<div class='form-group'><label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='net_hsts' value='1'").append(checkedAttr(secHeaders, "hsts")).append("> HSTS</label></div>");
        html.append("<div class='form-group'><label>HSTS Max-Age (seconds)</label>");
        html.append("<input type='number' name='net_hstsMaxAge' value='").append(hstsMaxAge).append("'></div>");
        html.append("<div class='form-group'><label>X-Frame-Options</label>");
        html.append("<select name='net_xFrameOptions'><option value='DENY'").append("DENY".equals(xFrameOptions) ? " selected" : "").append(">DENY</option>");
        html.append("<option value='SAMEORIGIN'").append("SAMEORIGIN".equals(xFrameOptions) ? " selected" : "").append(">SAMEORIGIN</option></select></div>");
        html.append("<div class='form-group'><label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='net_xContentTypeOptions' value='1'").append(checkedAttr(secHeaders, "xContentTypeOptions")).append("> X-Content-Type-Options: nosniff</label></div>");
        html.append("<div class='form-group'><label>Referrer Policy</label>");
        html.append("<input type='text' name='net_referrerPolicy' value='").append(Helpers.esc(referrerPolicy)).append("'></div>");
        html.append("<div class='form-group'><label>Permissions Policy</label>");
        html.append("<input type='text' name='net_permissionsPolicy' value='").append(Helpers.esc(permissionsPolicy)).append("'></div>");
        html.append("</div></div>");

        html.append("</div>");
        html.append("</div>");

        html.append("<button class='btn btn-primary' type='submit'>Save Network &amp; Firewall</button>");
        html.append("</form>");
        html.append("</div>");
    }

    @SuppressWarnings("unchecked")
    private void renderModelPricingPanel(StringBuilder html, String token) {
        var mpData = ApiClient.get("/api/settings/model-pricing", token);
        if (mpData == null) mpData = new HashMap<>();

        // Unwrap modelPricingConfig if present
        Map<String, Object> cfg = mpData;
        Map<String, Object> mpc = Helpers.mapVal(mpData, "modelPricingConfig");
        if (!mpc.isEmpty()) cfg = mpc;

        String currency = Helpers.strVal(cfg, "currency");
        if (currency.isEmpty()) currency = "USD";

        List<?> models = new ArrayList<>();
        Object modelsObj = cfg.get("models");
        if (modelsObj instanceof List) {
            models = (List<?>) modelsObj;
        }

        // Provider display name mapping
        Map<String, String> providerLabelsMap = new LinkedHashMap<>();
        providerLabelsMap.put("anthropic", "Anthropic");
        providerLabelsMap.put("openai", "OpenAI");
        providerLabelsMap.put("google", "Google");
        providerLabelsMap.put("deepseek", "DeepSeek");
        providerLabelsMap.put("xai", "xAI (Grok)");
        providerLabelsMap.put("mistral", "Mistral");
        providerLabelsMap.put("groq", "Groq");
        providerLabelsMap.put("together", "Together");
        providerLabelsMap.put("fireworks", "Fireworks");
        providerLabelsMap.put("moonshot", "Moonshot (Kimi)");
        providerLabelsMap.put("cerebras", "Cerebras");
        providerLabelsMap.put("openrouter", "OpenRouter");
        providerLabelsMap.put("ollama", "Ollama (Local)");
        providerLabelsMap.put("vllm", "vLLM (Local)");
        providerLabelsMap.put("lmstudio", "LM Studio (Local)");
        providerLabelsMap.put("litellm", "LiteLLM (Local)");

        // Group models by provider
        List<String> providerOrder = new ArrayList<>();
        Map<String, List<Map<String, Object>>> providerModels = new LinkedHashMap<>();
        for (Object item : models) {
            if (!(item instanceof Map)) continue;
            Map<String, Object> m = (Map<String, Object>) item;
            String provider = Helpers.strVal(m, "provider");
            if (!providerModels.containsKey(provider)) {
                providerOrder.add(provider);
                providerModels.put(provider, new ArrayList<>());
            }
            providerModels.get(provider).add(m);
        }

        html.append("<div id='settings-panel-model-pricing' style='display:none'>");
        html.append("<form method='POST' action='/settings'>");
        html.append("<input type='hidden' name='_form' value='model-pricing'>");

        html.append("<div class='card'>");
        html.append("<div style='display:flex;align-items:center;gap:0'>");
        html.append("<h3>Model Pricing</h3>");
        html.append("<button class='settings-help-btn' onclick=\"toggleSettingsHelp('model-pricing')\" title='Learn more'>?</button>");
        html.append("</div>");
        html.append("<div id='help-model-pricing' class='settings-help-panel'>");
        html.append("<p>Configure per-model pricing for cost estimation and budget tracking. Costs are per million tokens.</p>");
        html.append("<h4>How It Works</h4>");
        html.append("<ul>");
        html.append("<li><strong>Input Cost</strong> &mdash; Cost per million input (prompt) tokens sent to the model.</li>");
        html.append("<li><strong>Output Cost</strong> &mdash; Cost per million output (completion) tokens generated by the model.</li>");
        html.append("<li><strong>Context Window</strong> &mdash; Maximum number of tokens the model supports in a single request.</li>");
        html.append("</ul>");
        html.append("</div>");
        html.append("<div style='font-size:13px;color:var(--text-muted);margin-bottom:12px'>Currency: ").append(Helpers.esc(currency)).append("</div>");

        if (models.isEmpty()) {
            html.append("<p style='color:var(--text-muted);font-size:13px'>No models configured yet. Add one below.</p>");
        } else {
            for (String provider : providerOrder) {
                List<Map<String, Object>> pModels = providerModels.get(provider);
                String providerLabel = providerLabelsMap.getOrDefault(provider, provider.isEmpty() ? "Unknown" : provider);
                html.append("<div style='margin-bottom:16px'><strong style='font-size:14px'>").append(Helpers.esc(providerLabel)).append("</strong>");
                html.append("<div class='table-wrap' style='margin-top:8px'><table><thead><tr><th>Model ID</th><th>Display Name</th><th>Input Cost/M</th><th>Output Cost/M</th><th>Context Window</th><th></th></tr></thead><tbody>");
                for (int i = 0; i < pModels.size(); i++) {
                    Map<String, Object> m = pModels.get(i);
                    String prefix = "model_" + provider + "_" + i + "_";
                    String modelId = Helpers.strVal(m, "modelId");
                    String displayName = Helpers.strVal(m, "displayName");
                    String inputCost = numStr(m, "inputCostPerMillion");
                    String outputCost = numStr(m, "outputCostPerMillion");
                    String contextWindow = numStr(m, "contextWindow");

                    html.append("<tr>");
                    html.append("<td><input type='text' name='").append(prefix).append("modelId' value='").append(Helpers.esc(modelId)).append("' style='min-width:140px'></td>");
                    html.append("<td><input type='text' name='").append(prefix).append("displayName' value='").append(Helpers.esc(displayName)).append("' style='min-width:120px'></td>");
                    html.append("<td><input type='number' step='0.01' name='").append(prefix).append("inputCost' value='").append(Helpers.esc(inputCost)).append("' style='width:100px'></td>");
                    html.append("<td><input type='number' step='0.01' name='").append(prefix).append("outputCost' value='").append(Helpers.esc(outputCost)).append("' style='width:100px'></td>");
                    html.append("<td><input type='number' name='").append(prefix).append("contextWindow' value='").append(Helpers.esc(contextWindow)).append("' style='width:110px'></td>");
                    html.append("<td><input type='hidden' name='").append(prefix).append("provider' value='").append(Helpers.esc(provider)).append("'>");
                    html.append("<button type='button' class='btn' style='padding:4px 10px;font-size:12px;color:var(--danger,#e53e3e)' onclick='this.closest(\"tr\").remove()'>Remove</button></td>");
                    html.append("</tr>");
                }
                html.append("</tbody></table></div></div>");
            }
        }

        html.append("</div>");

        html.append("<div class='card'>");
        html.append("<h3>Add Model</h3>");
        html.append("<div style='display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px'>");
        html.append("<div class='form-group'><label>Provider</label><select name='new_provider'><option value='anthropic'>Anthropic</option><option value='openai'>OpenAI</option><option value='google'>Google</option><option value='deepseek'>DeepSeek</option><option value='xai'>xAI (Grok)</option><option value='mistral'>Mistral</option><option value='groq'>Groq</option><option value='together'>Together</option><option value='fireworks'>Fireworks</option><option value='moonshot'>Moonshot (Kimi)</option><option value='cerebras'>Cerebras</option><option value='openrouter'>OpenRouter</option><option value='ollama'>Ollama (Local)</option><option value='vllm'>vLLM (Local)</option><option value='lmstudio'>LM Studio (Local)</option><option value='litellm'>LiteLLM (Local)</option></select></div>");
        html.append("<div class='form-group'><label>Model ID</label><input type='text' name='new_modelId' placeholder='gpt-4o'></div>");
        html.append("<div class='form-group'><label>Display Name</label><input type='text' name='new_displayName' placeholder='GPT-4o'></div>");
        html.append("<div class='form-group'><label>Input Cost / Million Tokens</label><input type='number' step='0.01' name='new_inputCost' placeholder='2.50'></div>");
        html.append("<div class='form-group'><label>Output Cost / Million Tokens</label><input type='number' step='0.01' name='new_outputCost' placeholder='10.00'></div>");
        html.append("<div class='form-group'><label>Context Window</label><input type='number' name='new_contextWindow' placeholder='128000'></div>");
        html.append("</div></div>");

        html.append("<button class='btn btn-primary' type='submit'>Save Model Pricing</button>");
        html.append("</form>");
        html.append("</div>");
    }

    private String numStr(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (v == null) return "0";
        return v.toString();
    }

    private void handleModelPricingUpdate(HttpExchange ex, String token, Map<String, String> form) throws IOException {
        // Collect existing models from form fields (model_{provider}_{index}_*)
        Map<String, Boolean> seenPrefixes = new LinkedHashMap<>();
        for (String key : form.keySet()) {
            if (key.startsWith("model_") && key.endsWith("provider")) {
                String prefix = key.substring(0, key.length() - "provider".length());
                seenPrefixes.put(prefix, true);
            }
        }

        List<Object> models = new ArrayList<>();
        for (String prefix : seenPrefixes.keySet()) {
            String modelId = form.getOrDefault(prefix + "modelId", "");
            if (modelId.isEmpty()) continue;

            double inputCost = 0;
            try { inputCost = Double.parseDouble(form.getOrDefault(prefix + "inputCost", "0")); } catch (NumberFormatException e) { }
            double outputCost = 0;
            try { outputCost = Double.parseDouble(form.getOrDefault(prefix + "outputCost", "0")); } catch (NumberFormatException e) { }
            int contextWindow = 0;
            try { contextWindow = Integer.parseInt(form.getOrDefault(prefix + "contextWindow", "0")); } catch (NumberFormatException e) { }

            Map<String, Object> model = new LinkedHashMap<>();
            model.put("provider", form.getOrDefault(prefix + "provider", ""));
            model.put("modelId", modelId);
            model.put("displayName", form.getOrDefault(prefix + "displayName", ""));
            model.put("inputCostPerMillion", inputCost);
            model.put("outputCostPerMillion", outputCost);
            model.put("contextWindow", contextWindow);
            models.add(model);
        }

        // Add new model if provided
        String newModelId = form.getOrDefault("new_modelId", "");
        if (!newModelId.isEmpty()) {
            double newInputCost = 0;
            try { newInputCost = Double.parseDouble(form.getOrDefault("new_inputCost", "0")); } catch (NumberFormatException e) { }
            double newOutputCost = 0;
            try { newOutputCost = Double.parseDouble(form.getOrDefault("new_outputCost", "0")); } catch (NumberFormatException e) { }
            int newContextWindow = 0;
            try { newContextWindow = Integer.parseInt(form.getOrDefault("new_contextWindow", "0")); } catch (NumberFormatException e) { }

            Map<String, Object> newModel = new LinkedHashMap<>();
            newModel.put("provider", form.getOrDefault("new_provider", ""));
            newModel.put("modelId", newModelId);
            newModel.put("displayName", form.getOrDefault("new_displayName", ""));
            newModel.put("inputCostPerMillion", newInputCost);
            newModel.put("outputCostPerMillion", newOutputCost);
            newModel.put("contextWindow", newContextWindow);
            models.add(newModel);
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("models", models);
        payload.put("currency", "USD");

        var result = ApiClient.put("/api/settings/model-pricing", token, buildNestedJson(payload));
        int status = Helpers.intVal(result, "_status");

        if (status > 0 && status < 300) {
            SessionManager.setFlash(ex, "Model pricing settings updated", "success");
        } else {
            String err = Helpers.strVal(result, "error");
            if (err.isEmpty()) err = "Failed to update model pricing settings";
            SessionManager.setFlash(ex, err, "danger");
        }

        SessionManager.redirect(ex, "/settings");
    }

    private void handleFirewallUpdate(HttpExchange ex, String token, Map<String, String> form) throws IOException {
        Map<String, Object> payload = new LinkedHashMap<>();

        Map<String, Object> ipAccess = new LinkedHashMap<>();
        ipAccess.put("enabled", "1".equals(form.get("ip_enabled")));
        ipAccess.put("mode", form.getOrDefault("ip_mode", "allowlist"));
        ipAccess.put("allowlist", splitTrim(form.getOrDefault("ip_allowlist", "")));
        ipAccess.put("blocklist", splitTrim(form.getOrDefault("ip_blocklist", "")));
        ipAccess.put("bypassPaths", splitTrim(form.getOrDefault("ip_bypassPaths", "")));
        payload.put("ipAccess", ipAccess);

        Map<String, Object> egress = new LinkedHashMap<>();
        egress.put("enabled", "1".equals(form.get("eg_enabled")));
        egress.put("mode", form.getOrDefault("eg_mode", "blocklist"));
        egress.put("allowedHosts", splitTrim(form.getOrDefault("eg_allowedHosts", "")));
        egress.put("blockedHosts", splitTrim(form.getOrDefault("eg_blockedHosts", "")));
        egress.put("allowedPorts", splitTrimInt(form.getOrDefault("eg_allowedPorts", "")));
        egress.put("blockedPorts", splitTrimInt(form.getOrDefault("eg_blockedPorts", "")));
        payload.put("egress", egress);

        Map<String, Object> proxy = new LinkedHashMap<>();
        proxy.put("httpProxy", form.getOrDefault("proxy_http", ""));
        proxy.put("httpsProxy", form.getOrDefault("proxy_https", ""));
        proxy.put("noProxy", splitTrim(form.getOrDefault("proxy_noProxy", "")));
        payload.put("proxy", proxy);

        Map<String, Object> trustedProxies = new LinkedHashMap<>();
        trustedProxies.put("enabled", "1".equals(form.get("tp_enabled")));
        trustedProxies.put("ips", splitTrim(form.getOrDefault("tp_ips", "")));
        payload.put("trustedProxies", trustedProxies);

        int rpm = 120;
        try { rpm = Integer.parseInt(form.getOrDefault("net_rl_rpm", "120")); } catch (NumberFormatException e) { }
        int hstsMaxAge = 31536000;
        try { hstsMaxAge = Integer.parseInt(form.getOrDefault("net_hstsMaxAge", "31536000")); } catch (NumberFormatException e) { }

        Map<String, Object> network = new LinkedHashMap<>();
        network.put("corsOrigins", splitTrim(form.getOrDefault("net_corsOrigins", "")));

        Map<String, Object> rateLimit = new LinkedHashMap<>();
        rateLimit.put("enabled", "1".equals(form.get("net_rl_enabled")));
        rateLimit.put("requestsPerMinute", rpm);
        rateLimit.put("skipPaths", splitTrim(form.getOrDefault("net_rl_skipPaths", "")));
        network.put("rateLimit", rateLimit);

        Map<String, Object> httpsEnforcement = new LinkedHashMap<>();
        httpsEnforcement.put("enabled", "1".equals(form.get("net_https_enabled")));
        httpsEnforcement.put("excludePaths", splitTrim(form.getOrDefault("net_https_excludePaths", "")));
        network.put("httpsEnforcement", httpsEnforcement);

        Map<String, Object> securityHeaders = new LinkedHashMap<>();
        securityHeaders.put("hsts", "1".equals(form.get("net_hsts")));
        securityHeaders.put("hstsMaxAge", hstsMaxAge);
        securityHeaders.put("xFrameOptions", form.getOrDefault("net_xFrameOptions", "DENY"));
        securityHeaders.put("xContentTypeOptions", "1".equals(form.get("net_xContentTypeOptions")));
        securityHeaders.put("referrerPolicy", form.getOrDefault("net_referrerPolicy", "strict-origin-when-cross-origin"));
        securityHeaders.put("permissionsPolicy", form.getOrDefault("net_permissionsPolicy", "camera=(), microphone=(), geolocation=()"));
        network.put("securityHeaders", securityHeaders);

        payload.put("network", network);

        var result = ApiClient.put("/api/settings/firewall", token, buildNestedJson(payload));
        int status = Helpers.intVal(result, "_status");

        if (status > 0 && status < 300) {
            SessionManager.setFlash(ex, "Network & firewall settings updated", "success");
        } else {
            String err = Helpers.strVal(result, "error");
            if (err.isEmpty()) err = "Failed to update network & firewall settings";
            SessionManager.setFlash(ex, err, "danger");
        }

        SessionManager.redirect(ex, "/settings");
    }

    private List<Integer> splitTrimInt(String val) {
        List<Integer> result = new ArrayList<>();
        if (val == null || val.isEmpty()) return result;
        for (String part : val.split(",")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                try { result.add(Integer.parseInt(trimmed)); }
                catch (NumberFormatException e) { /* skip */ }
            }
        }
        return result;
    }

    private String checkedAttr(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (Boolean.TRUE.equals(v)) return " checked";
        return "";
    }

    @SuppressWarnings("unchecked")
    private String joinList(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (v instanceof List) {
            StringBuilder sb = new StringBuilder();
            boolean first = true;
            for (Object item : (List<?>) v) {
                if (!first) sb.append(", ");
                first = false;
                sb.append(item != null ? item.toString() : "");
            }
            return sb.toString();
        }
        return "";
    }
}
