using System.Text.Json;
using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;
using static AgenticMailDashboard.Services.ApiClient;

namespace AgenticMailDashboard.Routes;

public static class SettingRoutes
{
    private static string CheckedAttr(JsonElement? el, string prop)
    {
        if (el != null && el.Value.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.True)
            return " checked";
        return "";
    }

    private static string JoinArray(JsonElement? el, string prop)
    {
        if (el == null) return "";
        if (!el.Value.TryGetProperty(prop, out var arr) || arr.ValueKind != JsonValueKind.Array)
            return "";
        var parts = new List<string>();
        foreach (var item in arr.EnumerateArray())
            parts.Add(item.GetString() ?? item.ToString());
        return string.Join(", ", parts);
    }

    private static List<string> SplitTrim(string val)
    {
        if (string.IsNullOrEmpty(val)) return new List<string>();
        return val.Split(',').Select(p => p.Trim()).Where(p => !string.IsNullOrEmpty(p)).ToList();
    }

    private static List<int> SplitTrimInt(string val)
    {
        if (string.IsNullOrEmpty(val)) return new List<int>();
        var result = new List<int>();
        foreach (var p in val.Split(','))
        {
            var trimmed = p.Trim();
            if (int.TryParse(trimmed, out var n)) result.Add(n);
        }
        return result;
    }

    private static string NumStr(JsonElement? el, string prop)
    {
        if (el == null) return "0";
        if (!el.Value.TryGetProperty(prop, out var v)) return "0";
        return v.ToString();
    }

    public static void Map(WebApplication app)
    {
        // GET /settings - display settings form + instance info
        app.MapGet("/settings", async (HttpContext ctx, ApiClient api) =>
        {
            var s = await api.GetAsync(ctx, "/api/settings");

            var orgName = Str(s, "org_name");
            var defaultModel = Str(s, "default_model");
            var maxAgents = Str(s, "max_agents");
            var rateLimit = Str(s, "rate_limit");
            var webhookUrl = Str(s, "webhook_url");

            var version = Str(s, "version");
            if (string.IsNullOrEmpty(version)) version = Str(s, "app_version");
            if (string.IsNullOrEmpty(version)) version = "-";

            var plan = Str(s, "plan");
            if (string.IsNullOrEmpty(plan)) plan = Str(s, "tier");
            if (string.IsNullOrEmpty(plan)) plan = "Enterprise";

            var region = Str(s, "region");
            if (string.IsNullOrEmpty(region)) region = "-";

            var apiUrl = Environment.GetEnvironmentVariable("AGENTICMAIL_URL") ?? "http://localhost:3000";

            // Fetch tool security config
            JsonElement? tsData = null;
            try { tsData = await api.GetAsync(ctx, "/api/settings/tool-security"); } catch { }

            // Fetch firewall config
            JsonElement? fwData = null;
            try { fwData = await api.GetAsync(ctx, "/api/settings/firewall"); } catch { }

            // Fetch model pricing config
            JsonElement? mpData = null;
            try { mpData = await api.GetAsync(ctx, "/api/settings/model-pricing"); } catch { }

            JsonElement? fwCfg = fwData;
            if (fwData != null && fwData.Value.TryGetProperty("firewallConfig", out var fwc))
                fwCfg = fwc;

            JsonElement? ipAccessEl = null, egressEl = null, proxyEl = null, trustedProxiesEl = null, networkEl = null;
            if (fwCfg != null)
            {
                if (fwCfg.Value.TryGetProperty("ipAccess", out var ia)) ipAccessEl = ia;
                if (fwCfg.Value.TryGetProperty("egress", out var eg)) egressEl = eg;
                if (fwCfg.Value.TryGetProperty("proxy", out var px)) proxyEl = px;
                if (fwCfg.Value.TryGetProperty("trustedProxies", out var tp)) trustedProxiesEl = tp;
                if (fwCfg.Value.TryGetProperty("network", out var nw)) networkEl = nw;
            }

            JsonElement? netRateLimitEl = null, httpsEnforcementEl = null, secHeadersEl = null;
            if (networkEl != null)
            {
                if (networkEl.Value.TryGetProperty("rateLimit", out var nrl)) netRateLimitEl = nrl;
                if (networkEl.Value.TryGetProperty("httpsEnforcement", out var nhe)) httpsEnforcementEl = nhe;
                if (networkEl.Value.TryGetProperty("securityHeaders", out var nsh)) secHeadersEl = nsh;
            }

            var ipMode = Str(ipAccessEl, "mode");
            if (string.IsNullOrEmpty(ipMode)) ipMode = "allowlist";
            var egressMode = Str(egressEl, "mode");
            if (string.IsNullOrEmpty(egressMode)) egressMode = "blocklist";

            var fwRpm = Int(netRateLimitEl, "requestsPerMinute");
            if (fwRpm == 0) fwRpm = 120;
            var fwHstsMaxAge = Int(secHeadersEl, "hstsMaxAge");
            if (fwHstsMaxAge == 0) fwHstsMaxAge = 31536000;

            var fwXFrameOptions = Str(secHeadersEl, "xFrameOptions");
            if (string.IsNullOrEmpty(fwXFrameOptions)) fwXFrameOptions = "DENY";
            var fwReferrerPolicy = Str(secHeadersEl, "referrerPolicy");
            if (string.IsNullOrEmpty(fwReferrerPolicy)) fwReferrerPolicy = "strict-origin-when-cross-origin";
            var fwPermissionsPolicy = Str(secHeadersEl, "permissionsPolicy");
            if (string.IsNullOrEmpty(fwPermissionsPolicy)) fwPermissionsPolicy = "camera=(), microphone=(), geolocation=()";

            JsonElement? tsCfg = tsData;
            if (tsData != null && tsData.Value.TryGetProperty("toolSecurityConfig", out var tsc))
                tsCfg = tsc;

            JsonElement? securityEl = null;
            JsonElement? middlewareEl = null;
            if (tsCfg != null && tsCfg.Value.TryGetProperty("security", out var secEl))
                securityEl = secEl;
            if (tsCfg != null && tsCfg.Value.TryGetProperty("middleware", out var mwEl))
                middlewareEl = mwEl;

            JsonElement? pathSandbox = null, ssrfEl = null, cmdSanitizer = null;
            if (securityEl != null)
            {
                if (securityEl.Value.TryGetProperty("pathSandbox", out var ps)) pathSandbox = ps;
                if (securityEl.Value.TryGetProperty("ssrf", out var ss)) ssrfEl = ss;
                if (securityEl.Value.TryGetProperty("commandSanitizer", out var cs)) cmdSanitizer = cs;
            }

            JsonElement? auditEl = null, rateLimitEl = null, circuitBreakerEl = null, telemetryEl = null;
            if (middlewareEl != null)
            {
                if (middlewareEl.Value.TryGetProperty("audit", out var au)) auditEl = au;
                if (middlewareEl.Value.TryGetProperty("rateLimit", out var rl)) rateLimitEl = rl;
                if (middlewareEl.Value.TryGetProperty("circuitBreaker", out var cb)) circuitBreakerEl = cb;
                if (middlewareEl.Value.TryGetProperty("telemetry", out var te)) telemetryEl = te;
            }

            var cmdMode = Str(cmdSanitizer, "mode");
            if (string.IsNullOrEmpty(cmdMode)) cmdMode = "blocklist";

            // Extract model pricing config
            JsonElement? mpCfg = mpData;
            if (mpData != null && mpData.Value.TryGetProperty("modelPricingConfig", out var mpcVal))
                mpCfg = mpcVal;

            var mpCurrency = Str(mpCfg, "currency");
            if (string.IsNullOrEmpty(mpCurrency)) mpCurrency = "USD";

            var mpModelsHtml = new System.Text.StringBuilder();
            var mpModels = new List<JsonElement>();
            if (mpCfg != null && mpCfg.Value.TryGetProperty("models", out var mpModelsArr) && mpModelsArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var m in mpModelsArr.EnumerateArray())
                    mpModels.Add(m);
            }

            // Provider display name mapping
            var providerLabelsMap = new Dictionary<string, string>
            {
                ["anthropic"] = "Anthropic", ["openai"] = "OpenAI", ["google"] = "Google",
                ["deepseek"] = "DeepSeek", ["xai"] = "xAI (Grok)", ["mistral"] = "Mistral",
                ["groq"] = "Groq", ["together"] = "Together", ["fireworks"] = "Fireworks",
                ["moonshot"] = "Moonshot (Kimi)", ["cerebras"] = "Cerebras", ["openrouter"] = "OpenRouter",
                ["ollama"] = "Ollama (Local)", ["vllm"] = "vLLM (Local)", ["lmstudio"] = "LM Studio (Local)",
                ["litellm"] = "LiteLLM (Local)"
            };

            // Group models by provider
            var mpProviderOrder = new List<string>();
            var mpProviderModels = new Dictionary<string, List<(JsonElement model, int index)>>();
            for (int i = 0; i < mpModels.Count; i++)
            {
                var m = mpModels[i];
                var provider = Str(m, "provider") ?? "";
                if (!mpProviderModels.ContainsKey(provider))
                {
                    mpProviderOrder.Add(provider);
                    mpProviderModels[provider] = new List<(JsonElement, int)>();
                }
                mpProviderModels[provider].Add((m, i));
            }

            if (mpModels.Count == 0)
            {
                mpModelsHtml.Append("<p style='color:var(--text-muted);font-size:13px'>No models configured yet. Add one below.</p>");
            }
            else
            {
                foreach (var provider in mpProviderOrder)
                {
                    var pModels = mpProviderModels[provider];
                    var providerLabel = providerLabelsMap.TryGetValue(provider, out var plbl) ? plbl : (string.IsNullOrEmpty(provider) ? "Unknown" : provider);
                    mpModelsHtml.Append($"<div style='margin-bottom:16px'><strong style='font-size:14px'>{Esc(providerLabel)}</strong>");
                    mpModelsHtml.Append("<div class='table-wrap' style='margin-top:8px'><table><thead><tr><th>Model ID</th><th>Display Name</th><th>Input Cost/M</th><th>Output Cost/M</th><th>Context Window</th><th></th></tr></thead><tbody>");
                    foreach (var (m, idx) in pModels)
                    {
                        var prefix = $"model_{provider}_{idx}_";
                        var modelId = Str(m, "modelId") ?? "";
                        var displayName = Str(m, "displayName") ?? "";
                        var inputCost = NumStr(m, "inputCostPerMillion");
                        var outputCost = NumStr(m, "outputCostPerMillion");
                        var contextWindow = NumStr(m, "contextWindow");

                        mpModelsHtml.Append("<tr>");
                        mpModelsHtml.Append($"<td><input type='text' name='{prefix}modelId' value='{Esc(modelId)}' style='min-width:140px'></td>");
                        mpModelsHtml.Append($"<td><input type='text' name='{prefix}displayName' value='{Esc(displayName)}' style='min-width:120px'></td>");
                        mpModelsHtml.Append($"<td><input type='number' step='0.01' name='{prefix}inputCost' value='{Esc(inputCost)}' style='width:100px'></td>");
                        mpModelsHtml.Append($"<td><input type='number' step='0.01' name='{prefix}outputCost' value='{Esc(outputCost)}' style='width:100px'></td>");
                        mpModelsHtml.Append($"<td><input type='number' name='{prefix}contextWindow' value='{Esc(contextWindow)}' style='width:110px'></td>");
                        mpModelsHtml.Append($"<td><input type='hidden' name='{prefix}provider' value='{Esc(provider)}'>");
                        mpModelsHtml.Append("<button type='button' class='btn' style='padding:4px 10px;font-size:12px;color:var(--danger,#e53e3e)' onclick='this.closest(\"tr\").remove()'>Remove</button></td>");
                        mpModelsHtml.Append("</tr>");
                    }
                    mpModelsHtml.Append("</tbody></table></div></div>");
                }
            }
            var mpModelsContent = mpModelsHtml.ToString();

            var html = $@"<div class='page-header'>
                <h1>Settings</h1>
                <p>Configure your AgenticMail Enterprise instance</p>
            </div>

            <div style='border-bottom:1px solid var(--border);margin-bottom:20px'>
                <div class='tabs' style='padding:0'>
                    <div class='tab active' data-settings-tab='general' onclick=""switchSettingsTab('general')"">General</div>
                    <div class='tab' data-settings-tab='tool-security' onclick=""switchSettingsTab('tool-security')"">Tool Security</div>
                    <div class='tab' data-settings-tab='firewall' onclick=""switchSettingsTab('firewall')"">Network &amp; Firewall</div>
                    <div class='tab' data-settings-tab='model-pricing' onclick=""switchSettingsTab('model-pricing')"">Model Pricing</div>
                </div>
            </div>

            <div id='settings-panel-general'>
            <div class='card'>
                <div style='display:flex;align-items:center;gap:0'>
                    <h3>Organization Settings</h3>
                    <button class='settings-help-btn' onclick=""toggleSettingsHelp('general')"" title='Learn more'>?</button>
                </div>
                <div id='help-general' class='settings-help-panel'>
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
                <form method='POST' action='/settings'>
                    <div class='form-row'>
                        <div class='form-group'>
                            <label>Organization Name</label>
                            <input type='text' name='org_name' value='{Esc(orgName)}' placeholder='Your Org'>
                        </div>
                        <div class='form-group'>
                            <label>Default Model</label>
                            <input type='text' name='default_model' value='{Esc(defaultModel)}' placeholder='gpt-4o'>
                        </div>
                    </div>
                    <div class='form-row'>
                        <div class='form-group'>
                            <label>Max Agents</label>
                            <input type='number' name='max_agents' value='{Esc(maxAgents)}' placeholder='50'>
                        </div>
                        <div class='form-group'>
                            <label>Rate Limit (req/min)</label>
                            <input type='number' name='rate_limit' value='{Esc(rateLimit)}' placeholder='1000'>
                        </div>
                    </div>
                    <div class='form-group'>
                        <label>Webhook URL</label>
                        <input type='url' name='webhook_url' value='{Esc(webhookUrl)}' placeholder='https://hooks.example.com/events'>
                    </div>
                    <button class='btn btn-primary' type='submit'>Save Settings</button>
                </form>
            </div>

            <div class='card'>
                <h3>Instance Information</h3>
                <div class='table-wrap'>
                    <table>
                        <tbody>
                            <tr><td style='font-weight:600;width:200px'>API Endpoint</td><td><code>{Esc(apiUrl)}</code></td></tr>
                            <tr><td style='font-weight:600'>Version</td><td>{Esc(version)}</td></tr>
                            <tr><td style='font-weight:600'>Plan</td><td>{Esc(plan)}</td></tr>
                            <tr><td style='font-weight:600'>Region</td><td>{Esc(region)}</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
            </div>

            <div id='settings-panel-tool-security' style='display:none'>
            <form method='POST' action='/settings/tool-security'>

            <div class='card'>
                <div style='display:flex;align-items:center;gap:0'>
                    <h3>Security Policies</h3>
                    <button class='settings-help-btn' onclick=""toggleSettingsHelp('tool-security')"" title='Learn more'>?</button>
                </div>
                <div id='help-tool-security' class='settings-help-panel'>
                    <p>Tool Security controls what AI agents are allowed to do at the system level &mdash; safety guardrails that prevent agents from accessing sensitive resources.</p>
                    <h4>Security Sandboxes</h4>
                    <ul>
                        <li><strong>Path Sandbox</strong> &mdash; Restricts which folders agents can read/write. Prevents access to sensitive files.</li>
                        <li><strong>SSRF Protection</strong> &mdash; Blocks agents from reaching internal networks, cloud metadata, or private IPs.</li>
                        <li><strong>Command Sanitizer</strong> &mdash; Controls which shell commands agents can execute. Blocklist blocks dangerous patterns; Allowlist only permits specified commands.</li>
                    </ul>
                </div>
                <div style='display:grid;gap:20px'>

                    <div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                        <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>
                            <div><strong style='font-size:14px'>Path Sandbox</strong><div style='font-size:12px;color:var(--text-muted)'>Restrict file system access to allowed directories</div></div>
                            <label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='ps_enabled' value='1'{CheckedAttr(pathSandbox, "enabled")}> Enabled</label>
                        </div>
                        <div class='form-group'><label>Allowed Directories (comma-separated)</label>
                        <input type='text' name='ps_allowedDirs' value='{Esc(JoinArray(pathSandbox, "allowedDirs"))}' placeholder='/tmp, /var/data'></div>
                        <div class='form-group'><label>Blocked Patterns (comma-separated)</label>
                        <input type='text' name='ps_blockedPatterns' value='{Esc(JoinArray(pathSandbox, "blockedPatterns"))}' placeholder='*.exe, /etc/shadow'></div>
                    </div>

                    <div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                        <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>
                            <div><strong style='font-size:14px'>SSRF Protection</strong><div style='font-size:12px;color:var(--text-muted)'>Prevent server-side request forgery attacks</div></div>
                            <label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='ssrf_enabled' value='1'{CheckedAttr(ssrfEl, "enabled")}> Enabled</label>
                        </div>
                        <div class='form-group'><label>Allowed Hosts (comma-separated)</label>
                        <input type='text' name='ssrf_allowedHosts' value='{Esc(JoinArray(ssrfEl, "allowedHosts"))}' placeholder='api.example.com, cdn.example.com'></div>
                        <div class='form-group'><label>Blocked CIDRs (comma-separated)</label>
                        <input type='text' name='ssrf_blockedCidrs' value='{Esc(JoinArray(ssrfEl, "blockedCidrs"))}' placeholder='10.0.0.0/8, 172.16.0.0/12'></div>
                    </div>

                    <div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                        <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>
                            <div><strong style='font-size:14px'>Command Sanitizer</strong><div style='font-size:12px;color:var(--text-muted)'>Control which shell commands agents can execute</div></div>
                            <label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='cmd_enabled' value='1'{CheckedAttr(cmdSanitizer, "enabled")}> Enabled</label>
                        </div>
                        <div class='form-group'><label>Mode</label>
                        <select name='cmd_mode'><option value='blocklist'{(cmdMode == "blocklist" ? " selected" : "")}>Blocklist</option><option value='allowlist'{(cmdMode == "allowlist" ? " selected" : "")}>Allowlist</option></select></div>
                        <div class='form-group'><label>Allowed Commands (comma-separated)</label>
                        <input type='text' name='cmd_allowedCommands' value='{Esc(JoinArray(cmdSanitizer, "allowedCommands"))}' placeholder='ls, cat, grep'></div>
                        <div class='form-group'><label>Blocked Patterns (comma-separated)</label>
                        <input type='text' name='cmd_blockedPatterns' value='{Esc(JoinArray(cmdSanitizer, "blockedPatterns"))}' placeholder='rm -rf, sudo, chmod'></div>
                    </div>

                </div>
            </div>

            <div class='card'>
                <div style='display:flex;align-items:center;gap:0'>
                    <h3>Middleware</h3>
                    <button class='settings-help-btn' onclick=""toggleSettingsHelp('middleware')"" title='Learn more'>?</button>
                </div>
                <div id='help-middleware' class='settings-help-panel'>
                    <h4>Middleware &amp; Observability</h4>
                    <ul>
                        <li><strong>Audit Logging</strong> &mdash; Records every tool action: what, when, success/failure, duration. Sensitive fields are auto-redacted.</li>
                        <li><strong>Rate Limiting</strong> &mdash; Limits tool calls per minute per agent. Prevents system overload.</li>
                        <li><strong>Circuit Breaker</strong> &mdash; Auto-pauses tools that keep failing (5 consecutive errors). Waits 30s before retry.</li>
                        <li><strong>Telemetry</strong> &mdash; Collects performance metrics: call duration, success rates, output sizes.</li>
                    </ul>
                </div>
                <div style='display:grid;grid-template-columns:1fr 1fr;gap:16px'>

                    <div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                        <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>
                            <div><strong style='font-size:14px'>Audit Logging</strong><div style='font-size:12px;color:var(--text-muted)'>Log all tool invocations</div></div>
                            <label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='audit_enabled' value='1'{CheckedAttr(auditEl, "enabled")}> Enabled</label>
                        </div>
                        <div class='form-group'><label>Redact Keys (comma-separated)</label>
                        <input type='text' name='audit_redactKeys' value='{Esc(JoinArray(auditEl, "redactKeys"))}' placeholder='password, secret, token'></div>
                    </div>

                    <div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                        <div style='display:flex;justify-content:space-between;align-items:center'>
                            <div><strong style='font-size:14px'>Rate Limiting</strong><div style='font-size:12px;color:var(--text-muted)'>Throttle tool calls</div></div>
                            <label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='rl_enabled' value='1'{CheckedAttr(rateLimitEl, "enabled")}> Enabled</label>
                        </div>
                    </div>

                    <div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                        <div style='display:flex;justify-content:space-between;align-items:center'>
                            <div><strong style='font-size:14px'>Circuit Breaker</strong><div style='font-size:12px;color:var(--text-muted)'>Halt tools after repeated failures</div></div>
                            <label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='cb_enabled' value='1'{CheckedAttr(circuitBreakerEl, "enabled")}> Enabled</label>
                        </div>
                    </div>

                    <div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                        <div style='display:flex;justify-content:space-between;align-items:center'>
                            <div><strong style='font-size:14px'>Telemetry</strong><div style='font-size:12px;color:var(--text-muted)'>Collect tool usage metrics</div></div>
                            <label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='tel_enabled' value='1'{CheckedAttr(telemetryEl, "enabled")}> Enabled</label>
                        </div>
                    </div>

                </div>
            </div>

            <button class='btn btn-primary' type='submit'>Save Tool Security</button>
            </form>
            </div>

            <div id='settings-panel-firewall' style='display:none'>
            <form method='POST' action='/settings/firewall'>

            <div class='card'>
                <div style='display:flex;align-items:center;gap:0'>
                    <h3>IP Access Control</h3>
                    <button class='settings-help-btn' onclick=""toggleSettingsHelp('ip-access')"" title='Learn more'>?</button>
                </div>
                <div id='help-ip-access' class='settings-help-panel'>
                    <p>Restricts which IPs can reach the dashboard and APIs. Allowlist = only listed IPs connect. Blocklist = all except blocked IPs.</p>
                </div>
                <div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                    <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>
                        <div><strong style='font-size:14px'>IP Access Control</strong><div style='font-size:12px;color:var(--text-muted)'>Restrict access by IP address</div></div>
                        <label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='ip_enabled' value='1'{CheckedAttr(ipAccessEl, "enabled")}> Enabled</label>
                    </div>
                    <div style='display:grid;grid-template-columns:1fr 1fr;gap:14px'>
                        <div class='form-group'><label>Mode</label>
                        <select name='ip_mode'><option value='allowlist'{(ipMode == "allowlist" ? " selected" : "")}>Allowlist</option><option value='blocklist'{(ipMode == "blocklist" ? " selected" : "")}>Blocklist</option></select></div>
                        <div></div>
                        <div class='form-group'><label>Allowlist IPs (comma-separated)</label>
                        <input type='text' name='ip_allowlist' value='{Esc(JoinArray(ipAccessEl, "allowlist"))}' placeholder='192.168.1.0/24, 10.0.0.1'></div>
                        <div class='form-group'><label>Blocklist IPs (comma-separated)</label>
                        <input type='text' name='ip_blocklist' value='{Esc(JoinArray(ipAccessEl, "blocklist"))}' placeholder='203.0.113.0/24'></div>
                        <div class='form-group' style='grid-column:1/-1'><label>Bypass Paths (comma-separated)</label>
                        <input type='text' name='ip_bypassPaths' value='{Esc(JoinArray(ipAccessEl, "bypassPaths"))}' placeholder='/health, /ready'></div>
                    </div>
                </div>
            </div>

            <div class='card'>
                <div style='display:flex;align-items:center;gap:0'>
                    <h3>Outbound Egress</h3>
                    <button class='settings-help-btn' onclick=""toggleSettingsHelp('egress')"" title='Learn more'>?</button>
                </div>
                <div id='help-egress' class='settings-help-panel'>
                    <p>Controls which external hosts/ports agents can reach. Allowlist = only approved hosts. Blocklist = everything except blocked hosts.</p>
                </div>
                <div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                    <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>
                        <div><strong style='font-size:14px'>Egress Filtering</strong><div style='font-size:12px;color:var(--text-muted)'>Control outbound network connections</div></div>
                        <label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='eg_enabled' value='1'{CheckedAttr(egressEl, "enabled")}> Enabled</label>
                    </div>
                    <div style='display:grid;grid-template-columns:1fr 1fr;gap:14px'>
                        <div class='form-group'><label>Mode</label>
                        <select name='eg_mode'><option value='blocklist'{(egressMode == "blocklist" ? " selected" : "")}>Blocklist</option><option value='allowlist'{(egressMode == "allowlist" ? " selected" : "")}>Allowlist</option></select></div>
                        <div></div>
                        <div class='form-group'><label>Allowed Hosts (comma-separated)</label>
                        <input type='text' name='eg_allowedHosts' value='{Esc(JoinArray(egressEl, "allowedHosts"))}' placeholder='api.example.com'></div>
                        <div class='form-group'><label>Blocked Hosts (comma-separated)</label>
                        <input type='text' name='eg_blockedHosts' value='{Esc(JoinArray(egressEl, "blockedHosts"))}' placeholder='evil.com'></div>
                        <div class='form-group'><label>Allowed Ports (comma-separated)</label>
                        <input type='text' name='eg_allowedPorts' value='{Esc(JoinArray(egressEl, "allowedPorts"))}' placeholder='443, 80'></div>
                        <div class='form-group'><label>Blocked Ports (comma-separated)</label>
                        <input type='text' name='eg_blockedPorts' value='{Esc(JoinArray(egressEl, "blockedPorts"))}' placeholder='25, 445'></div>
                    </div>
                </div>
            </div>

            <div class='card'>
                <div style='display:flex;align-items:center;gap:0'>
                    <h3>Proxy Configuration</h3>
                    <button class='settings-help-btn' onclick=""toggleSettingsHelp('proxy')"" title='Learn more'>?</button>
                </div>
                <div id='help-proxy' class='settings-help-panel'>
                    <ul>
                        <li><strong>Proxy Config</strong> &mdash; HTTP/HTTPS proxy URLs for outbound access. &ldquo;No-Proxy&rdquo; bypasses the proxy.</li>
                        <li><strong>Trusted Proxies</strong> &mdash; IPs of your load balancers/reverse proxies, so IP access control sees real client IPs.</li>
                    </ul>
                </div>
                <div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                    <div style='display:grid;grid-template-columns:1fr 1fr;gap:14px'>
                        <div class='form-group'><label>HTTP Proxy</label>
                        <input type='text' name='proxy_http' value='{Esc(Str(proxyEl, "httpProxy"))}' placeholder='http://proxy:8080'></div>
                        <div class='form-group'><label>HTTPS Proxy</label>
                        <input type='text' name='proxy_https' value='{Esc(Str(proxyEl, "httpsProxy"))}' placeholder='http://proxy:8443'></div>
                        <div class='form-group' style='grid-column:1/-1'><label>No-Proxy Hosts (comma-separated)</label>
                        <input type='text' name='proxy_noProxy' value='{Esc(JoinArray(proxyEl, "noProxy"))}' placeholder='localhost, 127.0.0.1'></div>
                    </div>
                </div>
            </div>

            <div class='card'>
                <div style='display:flex;align-items:center;gap:0'>
                    <h3>Trusted Proxies</h3>
                    <button class='settings-help-btn' onclick=""toggleSettingsHelp('trusted-proxies')"" title='Learn more'>?</button>
                </div>
                <div id='help-trusted-proxies' class='settings-help-panel'>
                    <p>IPs of your load balancers/reverse proxies, so IP access control sees real client IPs instead of proxy IPs.</p>
                </div>
                <div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                    <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>
                        <div><strong style='font-size:14px'>Trusted Proxies</strong><div style='font-size:12px;color:var(--text-muted)'>Configure trusted reverse proxy IPs/CIDRs</div></div>
                        <label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='tp_enabled' value='1'{CheckedAttr(trustedProxiesEl, "enabled")}> Enabled</label>
                    </div>
                    <div class='form-group'><label>IPs/CIDRs (comma-separated)</label>
                    <input type='text' name='tp_ips' value='{Esc(JoinArray(trustedProxiesEl, "ips"))}' placeholder='10.0.0.0/8, 172.16.0.0/12'></div>
                </div>
            </div>

            <div class='card'>
                <div style='display:flex;align-items:center;gap:0'>
                    <h3>Network Settings</h3>
                    <button class='settings-help-btn' onclick=""toggleSettingsHelp('network')"" title='Learn more'>?</button>
                </div>
                <div id='help-network' class='settings-help-panel'>
                    <ul>
                        <li><strong>CORS Origins</strong> &mdash; Which websites can make API calls to AgenticMail. Empty = allow all.</li>
                        <li><strong>Rate Limiting</strong> &mdash; Limits API requests per IP per minute. Protects against abuse.</li>
                        <li><strong>HTTPS Enforcement</strong> &mdash; Forces encrypted connections. Recommended for production.</li>
                        <li><strong>Security Headers</strong> &mdash; Browser security: HSTS, X-Frame-Options, Content-Type-Options.</li>
                    </ul>
                </div>
                <div style='display:grid;gap:20px'>

                    <div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                        <strong style='font-size:14px'>CORS</strong><div style='font-size:12px;color:var(--text-muted);margin-bottom:12px'>Allowed origins for cross-origin requests</div>
                        <div class='form-group'><label>CORS Origins (comma-separated)</label>
                        <input type='text' name='net_corsOrigins' value='{Esc(JoinArray(networkEl, "corsOrigins"))}' placeholder='https://app.example.com'></div>
                    </div>

                    <div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                        <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>
                            <div><strong style='font-size:14px'>Rate Limiting</strong><div style='font-size:12px;color:var(--text-muted)'>Throttle incoming requests</div></div>
                            <label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='net_rl_enabled' value='1'{CheckedAttr(netRateLimitEl, "enabled")}> Enabled</label>
                        </div>
                        <div style='display:grid;grid-template-columns:1fr 1fr;gap:14px'>
                            <div class='form-group'><label>Requests Per Minute</label>
                            <input type='number' name='net_rl_rpm' value='{fwRpm}' placeholder='120'></div>
                            <div class='form-group'><label>Skip Paths (comma-separated)</label>
                            <input type='text' name='net_rl_skipPaths' value='{Esc(JoinArray(netRateLimitEl, "skipPaths"))}' placeholder='/health, /ready'></div>
                        </div>
                    </div>

                    <div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                        <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>
                            <div><strong style='font-size:14px'>HTTPS Enforcement</strong><div style='font-size:12px;color:var(--text-muted)'>Redirect HTTP to HTTPS</div></div>
                            <label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='net_https_enabled' value='1'{CheckedAttr(httpsEnforcementEl, "enabled")}> Enabled</label>
                        </div>
                        <div class='form-group'><label>Exclude Paths (comma-separated)</label>
                        <input type='text' name='net_https_excludePaths' value='{Esc(JoinArray(httpsEnforcementEl, "excludePaths"))}' placeholder='/health, /ready'></div>
                    </div>

                    <div style='padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                        <strong style='font-size:14px'>Security Headers</strong><div style='font-size:12px;color:var(--text-muted);margin-bottom:12px'>HTTP security response headers</div>
                        <div style='display:grid;grid-template-columns:1fr 1fr;gap:14px'>
                            <div class='form-group'><label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='net_hsts' value='1'{CheckedAttr(secHeadersEl, "hsts")}> HSTS</label></div>
                            <div class='form-group'><label>HSTS Max-Age (seconds)</label>
                            <input type='number' name='net_hstsMaxAge' value='{fwHstsMaxAge}'></div>
                            <div class='form-group'><label>X-Frame-Options</label>
                            <select name='net_xFrameOptions'><option value='DENY'{(fwXFrameOptions == "DENY" ? " selected" : "")}>DENY</option><option value='SAMEORIGIN'{(fwXFrameOptions == "SAMEORIGIN" ? " selected" : "")}>SAMEORIGIN</option></select></div>
                            <div class='form-group'><label style='display:flex;align-items:center;gap:6px;cursor:pointer'><input type='checkbox' name='net_xContentTypeOptions' value='1'{CheckedAttr(secHeadersEl, "xContentTypeOptions")}> X-Content-Type-Options: nosniff</label></div>
                            <div class='form-group'><label>Referrer Policy</label>
                            <input type='text' name='net_referrerPolicy' value='{Esc(fwReferrerPolicy)}'></div>
                            <div class='form-group'><label>Permissions Policy</label>
                            <input type='text' name='net_permissionsPolicy' value='{Esc(fwPermissionsPolicy)}'></div>
                        </div>
                    </div>

                </div>
            </div>

            <button class='btn btn-primary' type='submit'>Save Network &amp; Firewall</button>
            </form>
            </div>

            <div id='settings-panel-model-pricing' style='display:none'>
            <form method='POST' action='/settings/model-pricing'>

            <div class='card'>
                <div style='display:flex;align-items:center;gap:0'>
                    <h3>Model Pricing</h3>
                    <button class='settings-help-btn' onclick=""toggleSettingsHelp('model-pricing')"" title='Learn more'>?</button>
                </div>
                <div id='help-model-pricing' class='settings-help-panel'>
                    <p>Configure per-model pricing for cost estimation and budget tracking. Costs are per million tokens.</p>
                    <h4>How It Works</h4>
                    <ul>
                        <li><strong>Input Cost</strong> &mdash; Cost per million input (prompt) tokens sent to the model.</li>
                        <li><strong>Output Cost</strong> &mdash; Cost per million output (completion) tokens generated by the model.</li>
                        <li><strong>Context Window</strong> &mdash; Maximum number of tokens the model supports in a single request.</li>
                    </ul>
                </div>
                <div style='font-size:13px;color:var(--text-muted);margin-bottom:12px'>Currency: {Esc(mpCurrency)}</div>
                {mpModelsContent}
            </div>

            <div class='card'>
                <h3>Add Model</h3>
                <div style='display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px'>
                    <div class='form-group'><label>Provider</label><select name='new_provider'><option value='anthropic'>Anthropic</option><option value='openai'>OpenAI</option><option value='google'>Google</option><option value='deepseek'>DeepSeek</option><option value='xai'>xAI (Grok)</option><option value='mistral'>Mistral</option><option value='groq'>Groq</option><option value='together'>Together</option><option value='fireworks'>Fireworks</option><option value='moonshot'>Moonshot (Kimi)</option><option value='cerebras'>Cerebras</option><option value='openrouter'>OpenRouter</option><option value='ollama'>Ollama (Local)</option><option value='vllm'>vLLM (Local)</option><option value='lmstudio'>LM Studio (Local)</option><option value='litellm'>LiteLLM (Local)</option></select></div>
                    <div class='form-group'><label>Model ID</label><input type='text' name='new_modelId' placeholder='gpt-4o'></div>
                    <div class='form-group'><label>Display Name</label><input type='text' name='new_displayName' placeholder='GPT-4o'></div>
                    <div class='form-group'><label>Input Cost / Million Tokens</label><input type='number' step='0.01' name='new_inputCost' placeholder='2.50'></div>
                    <div class='form-group'><label>Output Cost / Million Tokens</label><input type='number' step='0.01' name='new_outputCost' placeholder='10.00'></div>
                    <div class='form-group'><label>Context Window</label><input type='number' name='new_contextWindow' placeholder='128000'></div>
                </div>
            </div>

            <button class='btn btn-primary' type='submit'>Save Model Pricing</button>
            </form>
            </div>

            <style>
            .settings-help-btn{{background:none;border:1px solid var(--border,#ddd);border-radius:50%;width:22px;height:22px;font-size:13px;font-weight:700;color:var(--text-muted,#888);cursor:pointer;margin-left:8px;line-height:1;padding:0;display:inline-flex;align-items:center;justify-content:center}}
            .settings-help-btn:hover{{background:var(--bg-secondary,#f0f0f0);color:var(--text,#333)}}
            .settings-help-panel{{max-height:0;overflow:hidden;transition:max-height .3s ease,padding .3s ease;padding:0 16px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;margin-bottom:0;border:1px solid transparent}}
            .settings-help-panel.open{{max-height:600px;padding:16px;border-color:var(--border,#ddd);margin-bottom:16px}}
            .settings-help-panel h4{{margin:12px 0 6px;font-size:14px}}
            .settings-help-panel ul{{margin:4px 0 8px 18px;padding:0}}
            .settings-help-panel li{{margin-bottom:4px;font-size:13px;line-height:1.5}}
            .settings-help-panel p{{margin:4px 0 8px;font-size:13px;line-height:1.5}}
            </style>
            <script>
            function switchSettingsTab(tab){{document.querySelectorAll('[id^=""settings-panel-""]').forEach(function(p){{p.style.display='none'}});document.querySelectorAll('[data-settings-tab]').forEach(function(t){{t.classList.remove('active')}});document.getElementById('settings-panel-'+tab).style.display='block';document.querySelector('[data-settings-tab=""'+tab+'""]').classList.add('active')}}
            function toggleSettingsHelp(id){{var p=document.getElementById('help-'+id);if(p)p.classList.toggle('open')}}
            </script>";

            return Results.Content(Page(ctx, "/settings", html), "text/html");
        });

        // POST /settings - update settings
        app.MapPost("/settings", async (HttpContext ctx, ApiClient api) =>
        {
            var form = await ctx.Request.ReadFormAsync();

            // Build payload with only non-empty fields
            var payload = new Dictionary<string, object>();
            foreach (var key in new[] { "org_name", "default_model", "max_agents", "rate_limit", "webhook_url" })
            {
                var val = form[key].ToString();
                if (!string.IsNullOrEmpty(val))
                    payload[key] = val;
            }

            var (data, statusCode) = await api.PatchAsync(ctx, "/api/settings", payload);

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Settings updated", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to update settings";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/settings");
        });

        // POST /settings/tool-security - update tool security config
        app.MapPost("/settings/tool-security", async (HttpContext ctx, ApiClient api) =>
        {
            var form = await ctx.Request.ReadFormAsync();

            var payload = new Dictionary<string, object>
            {
                ["security"] = new Dictionary<string, object>
                {
                    ["pathSandbox"] = new Dictionary<string, object>
                    {
                        ["enabled"] = form["ps_enabled"].ToString() == "1",
                        ["allowedDirs"] = SplitTrim(form["ps_allowedDirs"].ToString()),
                        ["blockedPatterns"] = SplitTrim(form["ps_blockedPatterns"].ToString())
                    },
                    ["ssrf"] = new Dictionary<string, object>
                    {
                        ["enabled"] = form["ssrf_enabled"].ToString() == "1",
                        ["allowedHosts"] = SplitTrim(form["ssrf_allowedHosts"].ToString()),
                        ["blockedCidrs"] = SplitTrim(form["ssrf_blockedCidrs"].ToString())
                    },
                    ["commandSanitizer"] = new Dictionary<string, object>
                    {
                        ["enabled"] = form["cmd_enabled"].ToString() == "1",
                        ["mode"] = string.IsNullOrEmpty(form["cmd_mode"].ToString()) ? "blocklist" : form["cmd_mode"].ToString(),
                        ["allowedCommands"] = SplitTrim(form["cmd_allowedCommands"].ToString()),
                        ["blockedPatterns"] = SplitTrim(form["cmd_blockedPatterns"].ToString())
                    }
                },
                ["middleware"] = new Dictionary<string, object>
                {
                    ["audit"] = new Dictionary<string, object>
                    {
                        ["enabled"] = form["audit_enabled"].ToString() == "1",
                        ["redactKeys"] = SplitTrim(form["audit_redactKeys"].ToString())
                    },
                    ["rateLimit"] = new Dictionary<string, object>
                    {
                        ["enabled"] = form["rl_enabled"].ToString() == "1",
                        ["overrides"] = new Dictionary<string, object>()
                    },
                    ["circuitBreaker"] = new Dictionary<string, object>
                    {
                        ["enabled"] = form["cb_enabled"].ToString() == "1"
                    },
                    ["telemetry"] = new Dictionary<string, object>
                    {
                        ["enabled"] = form["tel_enabled"].ToString() == "1"
                    }
                }
            };

            var (data, statusCode) = await api.PutAsync(ctx, "/api/settings/tool-security", payload);

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Tool security settings updated", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to update tool security settings";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/settings");
        });

        // POST /settings/firewall - update firewall config
        app.MapPost("/settings/firewall", async (HttpContext ctx, ApiClient api) =>
        {
            var form = await ctx.Request.ReadFormAsync();

            int fwRpmVal = 120;
            int.TryParse(form["net_rl_rpm"].ToString(), out fwRpmVal);
            if (fwRpmVal == 0) fwRpmVal = 120;

            int fwHstsMaxAgeVal = 31536000;
            int.TryParse(form["net_hstsMaxAge"].ToString(), out fwHstsMaxAgeVal);
            if (fwHstsMaxAgeVal == 0) fwHstsMaxAgeVal = 31536000;

            var payload = new Dictionary<string, object>
            {
                ["ipAccess"] = new Dictionary<string, object>
                {
                    ["enabled"] = form["ip_enabled"].ToString() == "1",
                    ["mode"] = string.IsNullOrEmpty(form["ip_mode"].ToString()) ? "allowlist" : form["ip_mode"].ToString(),
                    ["allowlist"] = SplitTrim(form["ip_allowlist"].ToString()),
                    ["blocklist"] = SplitTrim(form["ip_blocklist"].ToString()),
                    ["bypassPaths"] = SplitTrim(form["ip_bypassPaths"].ToString())
                },
                ["egress"] = new Dictionary<string, object>
                {
                    ["enabled"] = form["eg_enabled"].ToString() == "1",
                    ["mode"] = string.IsNullOrEmpty(form["eg_mode"].ToString()) ? "blocklist" : form["eg_mode"].ToString(),
                    ["allowedHosts"] = SplitTrim(form["eg_allowedHosts"].ToString()),
                    ["blockedHosts"] = SplitTrim(form["eg_blockedHosts"].ToString()),
                    ["allowedPorts"] = SplitTrimInt(form["eg_allowedPorts"].ToString()),
                    ["blockedPorts"] = SplitTrimInt(form["eg_blockedPorts"].ToString())
                },
                ["proxy"] = new Dictionary<string, object>
                {
                    ["httpProxy"] = form["proxy_http"].ToString(),
                    ["httpsProxy"] = form["proxy_https"].ToString(),
                    ["noProxy"] = SplitTrim(form["proxy_noProxy"].ToString())
                },
                ["trustedProxies"] = new Dictionary<string, object>
                {
                    ["enabled"] = form["tp_enabled"].ToString() == "1",
                    ["ips"] = SplitTrim(form["tp_ips"].ToString())
                },
                ["network"] = new Dictionary<string, object>
                {
                    ["corsOrigins"] = SplitTrim(form["net_corsOrigins"].ToString()),
                    ["rateLimit"] = new Dictionary<string, object>
                    {
                        ["enabled"] = form["net_rl_enabled"].ToString() == "1",
                        ["requestsPerMinute"] = fwRpmVal,
                        ["skipPaths"] = SplitTrim(form["net_rl_skipPaths"].ToString())
                    },
                    ["httpsEnforcement"] = new Dictionary<string, object>
                    {
                        ["enabled"] = form["net_https_enabled"].ToString() == "1",
                        ["excludePaths"] = SplitTrim(form["net_https_excludePaths"].ToString())
                    },
                    ["securityHeaders"] = new Dictionary<string, object>
                    {
                        ["hsts"] = form["net_hsts"].ToString() == "1",
                        ["hstsMaxAge"] = fwHstsMaxAgeVal,
                        ["xFrameOptions"] = string.IsNullOrEmpty(form["net_xFrameOptions"].ToString()) ? "DENY" : form["net_xFrameOptions"].ToString(),
                        ["xContentTypeOptions"] = form["net_xContentTypeOptions"].ToString() == "1",
                        ["referrerPolicy"] = string.IsNullOrEmpty(form["net_referrerPolicy"].ToString()) ? "strict-origin-when-cross-origin" : form["net_referrerPolicy"].ToString(),
                        ["permissionsPolicy"] = string.IsNullOrEmpty(form["net_permissionsPolicy"].ToString()) ? "camera=(), microphone=(), geolocation=()" : form["net_permissionsPolicy"].ToString()
                    }
                }
            };

            var (data, statusCode) = await api.PutAsync(ctx, "/api/settings/firewall", payload);

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Network & firewall settings updated", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to update network & firewall settings";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/settings");
        });

        // POST /settings/model-pricing - update model pricing config
        app.MapPost("/settings/model-pricing", async (HttpContext ctx, ApiClient api) =>
        {
            var form = await ctx.Request.ReadFormAsync();

            // Collect existing models from form fields (model_{provider}_{index}_*)
            var seenPrefixes = new List<string>();
            foreach (var key in form.Keys)
            {
                if (key.StartsWith("model_") && key.EndsWith("provider"))
                {
                    var prefix = key.Substring(0, key.Length - "provider".Length);
                    if (!seenPrefixes.Contains(prefix))
                        seenPrefixes.Add(prefix);
                }
            }

            var models = new List<Dictionary<string, object>>();
            foreach (var prefix in seenPrefixes)
            {
                var modelId = form[prefix + "modelId"].ToString();
                if (string.IsNullOrEmpty(modelId)) continue;

                double inputCost = 0;
                double.TryParse(form[prefix + "inputCost"].ToString(), out inputCost);
                double outputCost = 0;
                double.TryParse(form[prefix + "outputCost"].ToString(), out outputCost);
                int contextWindow = 0;
                int.TryParse(form[prefix + "contextWindow"].ToString(), out contextWindow);

                models.Add(new Dictionary<string, object>
                {
                    ["provider"] = form[prefix + "provider"].ToString(),
                    ["modelId"] = modelId,
                    ["displayName"] = form[prefix + "displayName"].ToString(),
                    ["inputCostPerMillion"] = inputCost,
                    ["outputCostPerMillion"] = outputCost,
                    ["contextWindow"] = contextWindow
                });
            }

            // Add new model if provided
            var newModelId = form["new_modelId"].ToString();
            if (!string.IsNullOrEmpty(newModelId))
            {
                double newInputCost = 0;
                double.TryParse(form["new_inputCost"].ToString(), out newInputCost);
                double newOutputCost = 0;
                double.TryParse(form["new_outputCost"].ToString(), out newOutputCost);
                int newContextWindow = 0;
                int.TryParse(form["new_contextWindow"].ToString(), out newContextWindow);

                models.Add(new Dictionary<string, object>
                {
                    ["provider"] = form["new_provider"].ToString(),
                    ["modelId"] = newModelId,
                    ["displayName"] = form["new_displayName"].ToString(),
                    ["inputCostPerMillion"] = newInputCost,
                    ["outputCostPerMillion"] = newOutputCost,
                    ["contextWindow"] = newContextWindow
                });
            }

            var payload = new Dictionary<string, object>
            {
                ["models"] = models,
                ["currency"] = "USD"
            };

            var (data, statusCode) = await api.PutAsync(ctx, "/api/settings/model-pricing", payload);

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Model pricing settings updated", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to update model pricing settings";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/settings");
        });
    }
}
