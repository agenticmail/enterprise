using System.Text.Json;
using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;
using static AgenticMailDashboard.Services.ApiClient;

namespace AgenticMailDashboard.Routes;

public static class AgentRoutes
{
    // --- Name / Email / Model Resolution ---

    private static string ResolveAgentName(JsonElement? a)
    {
        if (a == null) return "Unnamed Agent";
        // identity.name > config.name > config.displayName > agent.name
        if (a.Value.TryGetProperty("identity", out var identity))
        {
            var v = Str(identity, "name");
            if (!string.IsNullOrEmpty(v)) return v;
        }
        if (a.Value.TryGetProperty("config", out var config))
        {
            var v = Str(config, "name");
            if (!string.IsNullOrEmpty(v)) return v;
            v = Str(config, "displayName");
            if (!string.IsNullOrEmpty(v)) return v;
        }
        var name = Str(a, "name");
        return string.IsNullOrEmpty(name) ? "Unnamed Agent" : name;
    }

    private static string ResolveAgentEmail(JsonElement? a)
    {
        if (a == null) return "";
        // identity.email > config.email > agent.email, skip UUIDs
        if (a.Value.TryGetProperty("identity", out var identity))
        {
            var v = Str(identity, "email");
            if (!string.IsNullOrEmpty(v) && v.Contains("@")) return v;
        }
        if (a.Value.TryGetProperty("config", out var config))
        {
            var v = Str(config, "email");
            if (!string.IsNullOrEmpty(v) && v.Contains("@")) return v;
        }
        var email = Str(a, "email");
        return (!string.IsNullOrEmpty(email) && email.Contains("@")) ? email : "";
    }

    private static string ResolveModel(JsonElement? a)
    {
        if (a == null) return "";
        if (a.Value.TryGetProperty("config", out var config) &&
            config.TryGetProperty("model", out var modelEl))
        {
            if (modelEl.ValueKind == JsonValueKind.String)
                return modelEl.GetString() ?? "";
            if (modelEl.ValueKind == JsonValueKind.Object)
            {
                var v = Str(modelEl, "modelId");
                if (!string.IsNullOrEmpty(v)) return v;
                v = Str(modelEl, "provider");
                if (!string.IsNullOrEmpty(v)) return v;
            }
        }
        return Str(a, "model");
    }

    private static JsonElement? GetJsonArray(JsonElement? data, string key)
    {
        if (data == null) return null;
        if (data.Value.TryGetProperty(key, out var arr) && arr.ValueKind == JsonValueKind.Array)
            return arr;
        return null;
    }

    public static void Map(WebApplication app)
    {
        // GET /agents - list all agents with create form
        app.MapGet("/agents", async (HttpContext ctx, ApiClient api) =>
        {
            var data = await api.GetAsync(ctx, "/api/agents");

            var rows = "";
            var modals = "";
            var count = 0;

            if (data?.TryGetProperty("agents", out var arr) == true)
            {
                foreach (var a in arr.EnumerateArray())
                {
                    count++;
                    var id = Str(a, "id");
                    var displayName = ResolveAgentName(a);
                    var model = ResolveModel(a);
                    if (string.IsNullOrEmpty(model)) model = Str(a, "model");
                    var status = Str(a, "status");
                    if (string.IsNullOrEmpty(status)) status = "active";
                    var createdAt = Str(a, "created_at");

                    var archiveBtn = "";
                    if (status.ToLower() != "archived")
                    {
                        var modalId = $"archive-agent-{Esc(id)}";
                        archiveBtn = $"<button class='btn btn-sm btn-danger' onclick=\"document.getElementById('{modalId}').classList.add('open')\">Archive</button>";
                        modals += Modal(modalId, "Archive Agent",
                            $"<p>Are you sure you want to archive <strong>{Esc(displayName)}</strong>? This agent will no longer be able to send or receive messages.</p>",
                            $"/agents/{Esc(id)}/archive",
                            "Archive", "btn-danger");
                    }

                    rows += $@"<tr>
                        <td><a href='/agents/{Esc(id)}' style='color:var(--accent);text-decoration:none;font-weight:600'>{Esc(displayName)}</a></td>
                        <td><code>{Esc(string.IsNullOrEmpty(model) ? "-" : model)}</code></td>
                        <td>{StatusBadge(status)}</td>
                        <td style='color:var(--text-muted)'>{TimeAgo(createdAt)}</td>
                        <td>{archiveBtn}</td>
                    </tr>";
                }
            }

            var table = Table(
                new[] { "Name", "Model", "Status", "Created", "Actions" },
                rows,
                "&#129302;",
                "No agents yet. Create one above."
            );

            var html = $@"<div class='page-header'>
                <h1>Agents</h1>
                <p>Manage AI agents in your organization</p>
            </div>

            <div class='card'>
                <h3>Create Agent</h3>
                <form method='POST' action='/agents'>
                    <div class='form-row'>
                        <div class='form-group'>
                            <label>Name</label>
                            <input type='text' name='name' required placeholder='e.g. Support Agent'>
                        </div>
                        <div class='form-group'>
                            <label>Model</label>
                            <select name='model' id='agent-model'><option value=''>Loading models...</option></select>
                        </div>
                    </div>
                    <div class='form-group'>
                        <label>Provider</label>
                        <select name='provider' id='agent-provider'>
                            <option value='anthropic'>Anthropic</option>
                            <option value='openai'>OpenAI</option>
                            <option value='google'>Google</option>
                            <option value='deepseek'>DeepSeek</option>
                            <option value='xai'>xAI (Grok)</option>
                            <option value='mistral'>Mistral</option>
                            <option value='groq'>Groq</option>
                            <option value='together'>Together</option>
                            <option value='fireworks'>Fireworks</option>
                            <option value='moonshot'>Moonshot (Kimi)</option>
                            <option value='cerebras'>Cerebras</option>
                            <option value='openrouter'>OpenRouter</option>
                            <option value='ollama'>Ollama (Local)</option>
                            <option value='vllm'>vLLM (Local)</option>
                            <option value='lmstudio'>LM Studio (Local)</option>
                            <option value='litellm'>LiteLLM (Local)</option>
                        </select>
                    </div>
                    <div class='form-group'>
                        <label>Description</label>
                        <input type='text' name='description' placeholder='What does this agent do?'>
                    </div>
                    <div class='form-group'>
                        <label>Role Template</label>
                        <select name='soulId'>
                            <option value=''>Custom (no template)</option>
                            <optgroup label='Support'>
                                <option value='customer-support-lead'>Customer Support Lead</option>
                                <option value='technical-support-engineer'>Technical Support Engineer</option>
                                <option value='customer-success-manager'>Customer Success Manager</option>
                            </optgroup>
                            <optgroup label='Sales'>
                                <option value='sales-development-rep'>Sales Development Rep</option>
                                <option value='account-executive'>Account Executive</option>
                            </optgroup>
                            <optgroup label='Engineering'>
                                <option value='senior-software-engineer'>Senior Software Engineer</option>
                                <option value='devops-engineer'>DevOps Engineer</option>
                                <option value='qa-engineer'>QA Engineer</option>
                            </optgroup>
                            <optgroup label='Operations'>
                                <option value='executive-assistant'>Executive Assistant</option>
                                <option value='project-coordinator'>Project Coordinator</option>
                            </optgroup>
                            <optgroup label='Marketing'>
                                <option value='content-writer'>Content Writer</option>
                                <option value='social-media-manager'>Social Media Manager</option>
                            </optgroup>
                            <optgroup label='Finance'>
                                <option value='financial-controller'>Financial Controller</option>
                                <option value='expense-auditor'>Expense Auditor</option>
                            </optgroup>
                            <optgroup label='Legal'>
                                <option value='legal-compliance-officer'>Legal Compliance Officer</option>
                                <option value='contract-reviewer'>Contract Reviewer</option>
                            </optgroup>
                            <optgroup label='Security'>
                                <option value='security-analyst'>Security Analyst</option>
                                <option value='compliance-auditor'>Compliance Auditor</option>
                            </optgroup>
                        </select>
                    </div>
                    <fieldset class='persona-fieldset'><legend>Persona (optional)</legend>
                    <div class='form-row'><div class='form-group'><label>Date of Birth</label><input type='date' name='date_of_birth' id='date_of_birth'></div></div>
                    <div class='form-row'><div class='form-group'><label>Gender</label><select name='gender'><option value=''>Not specified</option><option value='male'>Male</option><option value='female'>Female</option><option value='non-binary'>Non-binary</option></select></div></div>
                    <div class='form-row'><div class='form-group'><label>Marital Status</label><select name='marital_status'><option value=''>Not specified</option><option value='single'>Single</option><option value='married'>Married</option><option value='divorced'>Divorced</option></select></div><div class='form-group'><label>Cultural Background</label><select name='cultural_background'><option value=''>Not specified</option><option value='north-american'>North American</option><option value='british-european'>British / European</option><option value='latin-american'>Latin American</option><option value='middle-eastern'>Middle Eastern</option><option value='east-asian'>East Asian</option><option value='south-asian'>South Asian</option><option value='southeast-asian'>Southeast Asian</option><option value='african'>African</option><option value='caribbean'>Caribbean</option><option value='australian-pacific'>Australian / Pacific</option></select></div></div>
                    <div class='form-row'><div class='form-group'><label>Language</label><select name='language'><option value='en-us'>English (American)</option><option value='en-gb'>English (British)</option><option value='en-au'>English (Australian)</option><option value='es'>Spanish</option><option value='pt'>Portuguese</option><option value='fr'>French</option><option value='de'>German</option><option value='ja'>Japanese</option><option value='ko'>Korean</option><option value='zh'>Mandarin</option><option value='hi'>Hindi</option><option value='ar'>Arabic</option><option value='yo'>Yoruba</option><option value='ig'>Igbo</option><option value='sw'>Swahili</option><option value='it'>Italian</option><option value='nl'>Dutch</option><option value='ru'>Russian</option><option value='tr'>Turkish</option><option value='pl'>Polish</option><option value='th'>Thai</option><option value='vi'>Vietnamese</option><option value='id'>Indonesian</option><option value='ms'>Malay</option><option value='tl'>Filipino (Tagalog)</option></select></div><div class='form-group'><label>Communication Style</label><select name='trait_communication'><option value='direct'>Direct</option><option value='diplomatic'>Diplomatic</option></select></div></div>
                    <div class='form-row'><div class='form-group'><label>Detail Level</label><select name='trait_detail'><option value='detail-oriented'>Detail-oriented</option><option value='big-picture'>Big-picture</option></select></div><div class='form-group'><label>Energy</label><select name='trait_energy'><option value='calm'>Calm &amp; measured</option><option value='enthusiastic'>Enthusiastic</option></select></div></div>
                    <div class='form-group'><label>Humor</label><select name='humor' id='humor'><option value='witty'>Witty</option><option value='dry'>Dry</option><option value='warm' selected>Warm</option><option value='none'>None</option></select></div>
                    <div class='form-group'><label>Formality</label><select name='formality' id='formality'><option value='formal'>Formal</option><option value='casual'>Casual</option><option value='adaptive' selected>Adaptive</option></select></div>
                    <div class='form-group'><label>Empathy</label><select name='empathy' id='empathy'><option value='high'>High</option><option value='moderate' selected>Moderate</option><option value='reserved'>Reserved</option></select></div>
                    <div class='form-group'><label>Patience</label><select name='patience' id='patience'><option value='patient' selected>Patient</option><option value='efficient'>Efficient</option></select></div>
                    <div class='form-group'><label>Creativity</label><select name='creativity' id='creativity'><option value='creative' selected>Creative</option><option value='conventional'>Conventional</option></select></div>
                    </fieldset>
                    <button class='btn btn-primary' type='submit'>Create Agent</button>
                </form>
                <script>
function loadModels(provider){{var sel=document.getElementById('agent-model');if(!sel)return;fetch('/api/providers/'+provider+'/models').then(function(r){{return r.json()}}).then(function(d){{sel.innerHTML='';(d.models||[]).forEach(function(m){{var o=document.createElement('option');o.value=m.id;o.textContent=m.name||m.id;sel.appendChild(o)}});var c=document.createElement('option');c.value='custom';c.textContent='Custom (enter manually)';sel.appendChild(c)}}).catch(function(){{sel.innerHTML='<option value=\"\">Type model ID</option>'}})}}
var provSel=document.getElementById('agent-provider');if(provSel){{provSel.addEventListener('change',function(){{loadModels(this.value)}});loadModels(provSel.value||'anthropic')}}
                </script>
            </div>

            <div class='card'>
                <h3>All Agents ({count})</h3>
                {table}
            </div>
            {modals}";

            return Results.Content(Page(ctx, "/agents", html), "text/html");
        });

        // GET /agents/{id} - agent detail page
        app.MapGet("/agents/{id}", async (string id, HttpContext ctx, ApiClient api) =>
        {
            var data = await api.GetAsync(ctx, $"/api/agents/{id}");
            if (data == null)
                return Results.Redirect("/agents");

            // The API may return the agent at top level or nested under "agent"
            JsonElement? a = data;
            if (data.Value.TryGetProperty("agent", out var nested))
                a = nested;

            var displayName = ResolveAgentName(a);
            var email = ResolveAgentEmail(a);
            var status = Str(a, "status");
            if (string.IsNullOrEmpty(status)) status = "active";
            var role = Str(a, "role");
            if (string.IsNullOrEmpty(role)) role = "agent";
            var model = ResolveModel(a);
            if (string.IsNullOrEmpty(model)) model = "-";
            var created = Str(a, "created_at");
            var description = Str(a, "description");

            // Avatar initial
            var initial = string.IsNullOrEmpty(displayName) ? "?" : displayName[..1].ToUpper();

            // Build header
            var emailHtml = string.IsNullOrEmpty(email) ? "" :
                $" <span style='color:var(--text-secondary);font-size:13px'>{Esc(email)}</span>";

            var html = $@"<div style='margin-bottom:24px'><a href='/agents' style='color:var(--accent);text-decoration:none;font-size:13px'>&larr; Back to Agents</a></div>
            <div style='display:flex;align-items:center;gap:16px;margin-bottom:24px'>
                <div style='width:56px;height:56px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700'>{Esc(initial)}</div>
                <div>
                    <h1 style='font-size:22px;font-weight:700;margin-bottom:4px'>{Esc(displayName)}</h1>
                    <div style='display:flex;gap:8px;align-items:center;flex-wrap:wrap'>
                        {StatusBadge(status)} {Badge(role, role.ToLower() switch {{ ""owner"" => ""owner"", ""admin"" => ""primary"", ""viewer"" => ""viewer"", _ => ""member"" }})}{emailHtml}
                    </div>
                </div>
            </div>";

            // Summary card
            html += $@"<div class='card'>
                <h3>Summary</h3>
                <div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px'>
                    <div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Status</div><div style='margin-top:4px'>{StatusBadge(status)}</div></div>
                    <div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Role</div><div style='margin-top:4px'>{Badge(role, "default")}</div></div>
                    <div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Model</div><div style='margin-top:4px'><code>{Esc(model)}</code></div></div>
                    <div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Created</div><div style='margin-top:4px;font-size:13px;color:var(--text-secondary)'>{Esc(created)}</div></div>
                </div>
            </div>";

            // Description
            if (!string.IsNullOrEmpty(description))
            {
                html += $@"<div class='card'>
                    <h3>Description</h3>
                    <p style='font-size:14px;color:var(--text-secondary);line-height:1.6'>{Esc(description)}</p>
                </div>";
            }

            // Personality traits
            JsonElement? traitsEl = null;
            if (a.Value.TryGetProperty("persona", out var persona) && persona.TryGetProperty("traits", out var pt))
                traitsEl = pt;
            else if (a.Value.TryGetProperty("config", out var config) && config.TryGetProperty("traits", out var ct))
                traitsEl = ct;

            if (traitsEl != null && traitsEl.Value.ValueKind == JsonValueKind.Object)
            {
                var chips = "";
                foreach (var prop in traitsEl.Value.EnumerateObject())
                {
                    var val = prop.Value.ToString();
                    if (!string.IsNullOrEmpty(val))
                        chips += $"<span style='display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;background:var(--bg-secondary,#f0f0f0);color:var(--text-primary,#333);margin:3px'>{Esc(prop.Name)}: {Esc(val)}</span>";
                }
                if (!string.IsNullOrEmpty(chips))
                {
                    html += $@"<div class='card'>
                        <h3>Personality Traits</h3>
                        <div style='display:flex;flex-wrap:wrap;gap:4px'>{chips}</div>
                    </div>";
                }
            }

            // Actions
            html += $@"<div class='card'>
                <h3>Actions</h3>
                <div style='display:flex;gap:8px;flex-wrap:wrap'>
                    <form method='POST' action='/agents/{Esc(id)}/deploy' style='display:inline'><button class='btn btn-primary btn-sm' type='submit'>Deploy</button></form>
                    <form method='POST' action='/agents/{Esc(id)}/stop' style='display:inline'><button class='btn btn-sm btn-warning' type='submit'>Stop</button></form>
                    <form method='POST' action='/agents/{Esc(id)}/restart' style='display:inline'><button class='btn btn-sm' type='submit'>Restart</button></form>
                </div>
            </div>";

            // Personal details
            var gender = "";
            var dob = "";
            var marital = "";
            var cultural = "";
            var language = "";
            if (a.Value.TryGetProperty("persona", out var personaEl))
            {
                gender = Str(personaEl, "gender");
                dob = Str(personaEl, "dateOfBirth");
                marital = Str(personaEl, "maritalStatus");
                cultural = Str(personaEl, "culturalBackground");
                language = Str(personaEl, "language");
            }

            if (!string.IsNullOrEmpty(gender) || !string.IsNullOrEmpty(dob) || !string.IsNullOrEmpty(marital) ||
                !string.IsNullOrEmpty(cultural) || !string.IsNullOrEmpty(language))
            {
                var details = "<div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px'>";
                if (!string.IsNullOrEmpty(gender))
                    details += $"<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Gender</div><div style='margin-top:4px;font-size:14px'>{Esc(gender)}</div></div>";
                if (!string.IsNullOrEmpty(dob))
                    details += $"<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Date of Birth</div><div style='margin-top:4px;font-size:14px'>{Esc(dob)}</div></div>";
                if (!string.IsNullOrEmpty(marital))
                    details += $"<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Marital Status</div><div style='margin-top:4px;font-size:14px'>{Esc(marital)}</div></div>";
                if (!string.IsNullOrEmpty(cultural))
                    details += $"<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Cultural Background</div><div style='margin-top:4px;font-size:14px'>{Esc(cultural)}</div></div>";
                if (!string.IsNullOrEmpty(language))
                    details += $"<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Language</div><div style='margin-top:4px;font-size:14px'>{Esc(language)}</div></div>";
                details += "</div>";

                html += $@"<div class='card'>
                    <h3>Personal Details</h3>
                    {details}
                </div>";
            }

            // Permission profile
            JsonElement? permsEl = null;
            if (a.Value.TryGetProperty("permissions", out var p))
                permsEl = p;
            else if (a.Value.TryGetProperty("config", out var cfg) && cfg.TryGetProperty("permissions", out var cp))
                permsEl = cp;

            if (permsEl != null && permsEl.Value.ValueKind == JsonValueKind.Object)
            {
                // Profile Name
                var profileName = Str(permsEl, "name");
                if (string.IsNullOrEmpty(profileName)) profileName = Str(permsEl, "preset");
                if (string.IsNullOrEmpty(profileName)) profileName = "Custom";

                // Max Risk Level
                var maxRisk = Str(permsEl, "maxRiskLevel");
                if (string.IsNullOrEmpty(maxRisk)) maxRisk = Str(permsEl, "max_risk_level");
                var riskColor = (maxRisk ?? "").ToLower() switch
                {
                    "low" => "#10b981",
                    "medium" => "#f59e0b",
                    "high" or "critical" => "#ef4444",
                    _ => "#64748b"
                };
                var riskBadge = string.IsNullOrEmpty(maxRisk)
                    ? "<span style='color:var(--text-secondary)'>-</span>"
                    : $"<span style='display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:{riskColor}20;color:{riskColor}'>{Esc(maxRisk)}</span>";

                // Sandbox Mode
                var sandboxMode = "Disabled";
                if (permsEl.Value.TryGetProperty("sandboxMode", out var sbEl) || permsEl.Value.TryGetProperty("sandbox_mode", out sbEl))
                {
                    if (sbEl.ValueKind == JsonValueKind.True) sandboxMode = "Enabled";
                }

                // Rate Limits
                var rateLimitsStr = "None set";
                JsonElement rlEl;
                if (permsEl.Value.TryGetProperty("rateLimits", out rlEl) || permsEl.Value.TryGetProperty("rate_limits", out rlEl))
                {
                    var cpm = Str(rlEl, "toolCallsPerMinute");
                    if (string.IsNullOrEmpty(cpm)) cpm = Str(rlEl, "calls_per_minute");
                    var cph = Str(rlEl, "toolCallsPerHour");
                    if (string.IsNullOrEmpty(cph)) cph = Str(rlEl, "calls_per_hour");
                    var parts = new List<string>();
                    if (!string.IsNullOrEmpty(cpm)) parts.Add($"{Esc(cpm)}/min");
                    if (!string.IsNullOrEmpty(cph)) parts.Add($"{Esc(cph)}/hr");
                    if (parts.Count > 0) rateLimitsStr = string.Join(", ", parts);
                }

                // Blocked Side Effects
                var blockedHtml = "";
                JsonElement bseEl;
                if (permsEl.Value.TryGetProperty("blockedSideEffects", out bseEl) || permsEl.Value.TryGetProperty("blocked_side_effects", out bseEl))
                {
                    if (bseEl.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var effect in bseEl.EnumerateArray())
                        {
                            var val = effect.GetString() ?? effect.ToString();
                            blockedHtml += $"<span style='display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:#ef4444;color:#fff;margin:2px'>{Esc(val)}</span>";
                        }
                    }
                }
                if (string.IsNullOrEmpty(blockedHtml))
                    blockedHtml = "<span style='color:var(--text-secondary)'>None</span>";

                html += $@"<div class='card'>
                    <h3>Permission Profile</h3>
                    <div style='display:grid;grid-template-columns:1fr 1fr;gap:16px'>
                        <div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Profile Name</div><div style='margin-top:4px;font-size:14px'>{Esc(profileName)}</div></div>
                        <div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Max Risk Level</div><div style='margin-top:4px'>{riskBadge}</div></div>
                        <div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Sandbox Mode</div><div style='margin-top:4px;font-size:14px'>{Esc(sandboxMode)}</div></div>
                        <div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Rate Limits</div><div style='margin-top:4px;font-size:14px'>{rateLimitsStr}</div></div>
                    </div>
                    <div style='margin-top:16px'>
                        <div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px'>Blocked Side Effects</div>
                        <div style='display:flex;flex-wrap:wrap;gap:4px'>{blockedHtml}</div>
                    </div>
                </div>";
            }

            // ── Tool Security Section ────────────────────────────
            JsonElement? tsData = null;
            try { tsData = await api.GetAsync(ctx, $"/engine/agents/{id}/tool-security"); } catch { }
            if (tsData != null)
            {
                JsonElement? toolSec = null, orgDefaults = null;
                if (tsData.Value.TryGetProperty("toolSecurity", out var tsEl)) toolSec = tsEl;
                if (tsData.Value.TryGetProperty("orgDefaults", out var odEl)) orgDefaults = odEl;

                JsonElement? securityEl2 = null, mwEl2 = null;
                if (toolSec != null && toolSec.Value.TryGetProperty("security", out var s2)) securityEl2 = s2;
                else if (orgDefaults != null && orgDefaults.Value.TryGetProperty("security", out var s3)) securityEl2 = s3;
                if (toolSec != null && toolSec.Value.TryGetProperty("middleware", out var m2)) mwEl2 = m2;
                else if (orgDefaults != null && orgDefaults.Value.TryGetProperty("middleware", out var m3)) mwEl2 = m3;

                JsonElement? psEl = null, ssEl = null, csEl = null;
                if (securityEl2 != null)
                {
                    if (securityEl2.Value.TryGetProperty("pathSandbox", out var ps2)) psEl = ps2;
                    if (securityEl2.Value.TryGetProperty("ssrf", out var ss2)) ssEl = ss2;
                    if (securityEl2.Value.TryGetProperty("commandSanitizer", out var cs2)) csEl = cs2;
                }

                JsonElement? auEl = null, rlEl2 = null, cbEl2 = null, teEl = null;
                if (mwEl2 != null)
                {
                    if (mwEl2.Value.TryGetProperty("audit", out var au2)) auEl = au2;
                    if (mwEl2.Value.TryGetProperty("rateLimit", out var rl2)) rlEl2 = rl2;
                    if (mwEl2.Value.TryGetProperty("circuitBreaker", out var cb2)) cbEl2 = cb2;
                    if (mwEl2.Value.TryGetProperty("telemetry", out var te2)) teEl = te2;
                }

                var tsCmdMode = Str(csEl, "mode");
                if (string.IsNullOrEmpty(tsCmdMode)) tsCmdMode = "blocklist";

                string TsEnabledBadge(JsonElement? el) {
                    if (el != null && el.Value.TryGetProperty("enabled", out var ev) && ev.ValueKind == JsonValueKind.True)
                        return "<span style='display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:#10b98120;color:#10b981'>Enabled</span>";
                    return "<span style='display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:#64748b20;color:#64748b'>Disabled</span>";
                }

                html += $@"<div class='card'>
                    <h3>Tool Security</h3>
                    <div style='display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px'>
                        <div style='padding:12px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                            <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'><strong style='font-size:13px'>Path Sandbox</strong>{TsEnabledBadge(psEl)}</div>
                            <div style='font-size:12px;color:var(--text-muted)'>Restricts file system access</div>
                        </div>
                        <div style='padding:12px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                            <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'><strong style='font-size:13px'>SSRF Protection</strong>{TsEnabledBadge(ssEl)}</div>
                            <div style='font-size:12px;color:var(--text-muted)'>Prevents server-side request forgery</div>
                        </div>
                        <div style='padding:12px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                            <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'><strong style='font-size:13px'>Command Sanitizer</strong>{TsEnabledBadge(csEl)}</div>
                            <div style='font-size:12px;color:var(--text-muted)'>Mode: {Esc(tsCmdMode)}</div>
                        </div>
                    </div>
                    <div style='display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:16px'>
                        <div style='padding:12px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                            <div style='display:flex;justify-content:space-between;align-items:center'><strong style='font-size:13px'>Audit</strong>{TsEnabledBadge(auEl)}</div>
                        </div>
                        <div style='padding:12px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                            <div style='display:flex;justify-content:space-between;align-items:center'><strong style='font-size:13px'>Rate Limit</strong>{TsEnabledBadge(rlEl2)}</div>
                        </div>
                        <div style='padding:12px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                            <div style='display:flex;justify-content:space-between;align-items:center'><strong style='font-size:13px'>Circuit Breaker</strong>{TsEnabledBadge(cbEl2)}</div>
                        </div>
                        <div style='padding:12px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>
                            <div style='display:flex;justify-content:space-between;align-items:center'><strong style='font-size:13px'>Telemetry</strong>{TsEnabledBadge(teEl)}</div>
                        </div>
                    </div>
                </div>";
            }

            // ── Activity Section ─────────────────────────────────
            // Fetch events, tool calls, and journal entries (failures are non-fatal)
            JsonElement? eventsData = null;
            JsonElement? toolCallsData = null;
            JsonElement? journalData = null;
            try { eventsData = await api.GetAsync(ctx, $"/engine/activity/events?agentId={id}&limit=50"); } catch { }
            try { toolCallsData = await api.GetAsync(ctx, $"/engine/activity/tool-calls?agentId={id}&limit=50"); } catch { }
            try { journalData = await api.GetAsync(ctx, $"/engine/journal?agentId={id}&orgId=default&limit=50"); } catch { }

            // Events rows
            var eventsRows = "";
            var eventsList = GetJsonArray(eventsData, "events") ?? GetJsonArray(eventsData, "items");
            if (eventsList != null)
            {
                foreach (var evt in eventsList.Value.EnumerateArray())
                {
                    var evJson = Esc(evt.GetRawText());
                    var evTime = Str(evt, "timestamp");
                    if (string.IsNullOrEmpty(evTime)) evTime = Str(evt, "createdAt");
                    if (string.IsNullOrEmpty(evTime)) evTime = Str(evt, "created_at");
                    var evType = Str(evt, "type");
                    if (string.IsNullOrEmpty(evType)) evType = Str(evt, "eventType");
                    var evDetails = Str(evt, "description");
                    if (string.IsNullOrEmpty(evDetails)) evDetails = Str(evt, "message");
                    if (string.IsNullOrEmpty(evDetails)) evDetails = Str(evt, "details");
                    eventsRows += $"<tr style='cursor:pointer' onclick=\"showActivityDetail('{evJson}','Event Detail')\">" +
                        $"<td style='white-space:nowrap;font-size:12px;color:var(--text-secondary)'>{Esc(evTime)}</td>" +
                        $"<td>{StatusBadge(evType)}</td>" +
                        $"<td style='font-size:13px;color:var(--text-secondary)'>{Esc(evDetails)}</td></tr>";
                }
            }
            if (string.IsNullOrEmpty(eventsRows))
                eventsRows = "<tr><td colspan='3' style='text-align:center;padding:24px;color:var(--text-secondary)'>No events for this agent</td></tr>";

            // Tool calls rows
            var toolCallsRows = "";
            var toolsList = GetJsonArray(toolCallsData, "toolCalls") ?? GetJsonArray(toolCallsData, "tool_calls") ?? GetJsonArray(toolCallsData, "items");
            if (toolsList != null)
            {
                foreach (var tc in toolsList.Value.EnumerateArray())
                {
                    var tcJson = Esc(tc.GetRawText());
                    var tcTime = Str(tc, "timestamp");
                    if (string.IsNullOrEmpty(tcTime)) tcTime = Str(tc, "createdAt");
                    if (string.IsNullOrEmpty(tcTime)) tcTime = Str(tc, "created_at");
                    var tcTool = Str(tc, "tool");
                    if (string.IsNullOrEmpty(tcTool)) tcTool = Str(tc, "toolName");
                    if (string.IsNullOrEmpty(tcTool)) tcTool = Str(tc, "tool_name");
                    var tcDuration = Str(tc, "duration");
                    if (string.IsNullOrEmpty(tcDuration)) tcDuration = Str(tc, "durationMs");
                    if (!string.IsNullOrEmpty(tcDuration)) tcDuration += "ms"; else tcDuration = "-";
                    var tcStatus = Str(tc, "status");
                    if (string.IsNullOrEmpty(tcStatus)) tcStatus = Str(tc, "result");
                    if (string.IsNullOrEmpty(tcStatus)) tcStatus = "unknown";
                    toolCallsRows += $"<tr style='cursor:pointer' onclick=\"showActivityDetail('{tcJson}','Tool Call Detail')\">" +
                        $"<td style='white-space:nowrap;font-size:12px;color:var(--text-secondary)'>{Esc(tcTime)}</td>" +
                        $"<td><code style='font-size:12px'>{Esc(tcTool)}</code></td>" +
                        $"<td style='font-size:13px;color:var(--text-secondary)'>{Esc(tcDuration)}</td>" +
                        $"<td>{StatusBadge(tcStatus)}</td></tr>";
                }
            }
            if (string.IsNullOrEmpty(toolCallsRows))
                toolCallsRows = "<tr><td colspan='4' style='text-align:center;padding:24px;color:var(--text-secondary)'>No tool calls for this agent</td></tr>";

            // Journal rows
            var journalRows = "";
            var journalList = GetJsonArray(journalData, "entries") ?? GetJsonArray(journalData, "journal") ?? GetJsonArray(journalData, "items");
            if (journalList != null)
            {
                foreach (var j in journalList.Value.EnumerateArray())
                {
                    var jJson = Esc(j.GetRawText());
                    var jTime = Str(j, "timestamp");
                    if (string.IsNullOrEmpty(jTime)) jTime = Str(j, "createdAt");
                    if (string.IsNullOrEmpty(jTime)) jTime = Str(j, "created_at");
                    var jTool = Str(j, "tool");
                    if (string.IsNullOrEmpty(jTool)) jTool = Str(j, "toolName");
                    if (string.IsNullOrEmpty(jTool)) jTool = Str(j, "tool_name");
                    var jAction = Str(j, "action");
                    if (string.IsNullOrEmpty(jAction)) jAction = Str(j, "actionType");
                    if (string.IsNullOrEmpty(jAction)) jAction = Str(j, "action_type");
                    var jReversible = j.TryGetProperty("reversible", out var revEl) && revEl.ValueKind == JsonValueKind.True;
                    var jReversed = j.TryGetProperty("reversed", out var revdEl) && revdEl.ValueKind == JsonValueKind.True;
                    var reversibleBadge = jReversible
                        ? "<span class='badge' style='background:#10b981;color:#fff;font-size:11px'>Yes</span>"
                        : "<span class='badge' style='background:#64748b;color:#fff;font-size:11px'>No</span>";
                    var jStatus = Str(j, "status");
                    if (string.IsNullOrEmpty(jStatus)) jStatus = "completed";
                    var jId = Str(j, "id");
                    var actionsCol = "";
                    if (jReversible && !jReversed)
                        actionsCol = $"<button class='btn btn-sm' style='font-size:11px' onclick=\"event.stopPropagation();rollbackJournal('{Esc(jId)}')\">&#8617; Rollback</button>";
                    journalRows += $"<tr style='cursor:pointer' onclick=\"showActivityDetail('{jJson}','Journal Detail')\">" +
                        $"<td style='white-space:nowrap;font-size:12px;color:var(--text-secondary)'>{Esc(jTime)}</td>" +
                        $"<td><code style='font-size:12px'>{Esc(jTool)}</code></td>" +
                        $"<td style='font-size:13px'>{Esc(jAction)}</td>" +
                        $"<td>{reversibleBadge}</td>" +
                        $"<td>{StatusBadge(jStatus)}</td>" +
                        $"<td>{actionsCol}</td></tr>";
                }
            }
            if (string.IsNullOrEmpty(journalRows))
                journalRows = "<tr><td colspan='6' style='text-align:center;padding:24px;color:var(--text-secondary)'>No journal entries for this agent</td></tr>";

            // Build activity card
            html += $@"<div class='card'>
                <h3>Activity</h3>
                <div style='border-bottom:1px solid var(--border)'>
                    <div class='tabs' style='padding:0 16px'>
                        <div class='tab active' data-activity-tab='events' onclick=""switchActivityTab('events')"">Events</div>
                        <div class='tab' data-activity-tab='tools' onclick=""switchActivityTab('tools')"">Tool Calls</div>
                        <div class='tab' data-activity-tab='journal' onclick=""switchActivityTab('journal')"">Journal</div>
                    </div>
                </div>
                <div id='panel-events' class='activity-panel'>
                    <table><thead><tr><th>Time</th><th>Type</th><th>Details</th></tr></thead>
                    <tbody>{eventsRows}</tbody></table>
                </div>
                <div id='panel-tools' class='activity-panel' style='display:none'>
                    <table><thead><tr><th>Time</th><th>Tool</th><th>Duration</th><th>Status</th></tr></thead>
                    <tbody>{toolCallsRows}</tbody></table>
                </div>
                <div id='panel-journal' class='activity-panel' style='display:none'>
                    <table><thead><tr><th>Time</th><th>Tool</th><th>Action</th><th>Reversible</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>{journalRows}</tbody></table>
                </div>
            </div>";

            // Detail modal
            html += @"<div id='activity-detail-modal' style='display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center' onclick='if(event.target===this)closeActivityModal()'>
                <div style='background:var(--card-bg,#fff);border-radius:12px;width:560px;max-height:80vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)'>
                    <div style='display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border)'>
                        <h2 id='activity-modal-title' style='margin:0;font-size:16px'>Detail</h2>
                        <button class='btn btn-sm' onclick='closeActivityModal()' style='border:none;font-size:18px;cursor:pointer'>&times;</button>
                    </div>
                    <div style='padding:20px'>
                        <div id='activity-modal-badge' style='margin-bottom:12px'></div>
                        <div id='activity-modal-body' style='display:grid;grid-template-columns:140px 1fr;gap:12px 16px;align-items:start'></div>
                    </div>
                </div>
            </div>";

            // Activity JavaScript
            html += @"<script>
function switchActivityTab(tab){document.querySelectorAll('.activity-panel').forEach(function(p){p.style.display='none'});document.querySelectorAll('[data-activity-tab]').forEach(function(t){t.classList.remove('active')});document.getElementById('panel-'+tab).style.display='block';document.querySelector('[data-activity-tab=""'+tab+'""]').classList.add('active')}
function showActivityDetail(jsonStr,title){var data=JSON.parse(jsonStr);var m=document.getElementById('activity-detail-modal');document.getElementById('activity-modal-title').textContent=title;var typeLabel=data.type||data.eventType||data.tool||data.toolName||data.actionType||'Detail';var typeColor=typeLabel==='error'?'var(--danger)':typeLabel==='deployed'||typeLabel==='started'?'var(--success)':typeLabel==='stopped'?'var(--warning)':'var(--accent)';document.getElementById('activity-modal-badge').innerHTML='<span class=""badge"" style=""background:'+typeColor+';color:#fff;font-size:11px"">'+typeLabel+'</span>';var html='';for(var key in data){if(key==='agentId')continue;var label=key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ');label=label.charAt(0).toUpperCase()+label.slice(1);var val=data[key];if(val===null||val===undefined||val==='')val='\u2014';else if(typeof val==='object')val='<pre style=""margin:0;font-size:11px;background:var(--bg-secondary);padding:6px;border-radius:4px;white-space:pre-wrap;max-height:150px;overflow:auto"">'+JSON.stringify(val,null,2)+'</pre>';else if(typeof val==='boolean')val='<span class=""badge"" style=""background:'+(val?'#10b981':'#64748b')+';color:#fff;font-size:11px"">'+(val?'Yes':'No')+'</span>';else if((key.toLowerCase().includes('at')||key.toLowerCase().includes('time')||key.toLowerCase().includes('date'))&&!isNaN(Date.parse(String(val))))val=new Date(val).toLocaleString();html+='<div style=""font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em"">'+label+'</div><div style=""font-size:13px;word-break:break-word"">'+val+'</div>'}document.getElementById('activity-modal-body').innerHTML=html;m.style.display='flex'}
function closeActivityModal(){document.getElementById('activity-detail-modal').style.display='none'}
function rollbackJournal(id){if(!confirm('Rollback this journal entry?'))return;fetch('/api/engine/journal/'+id+'/rollback',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(function(r){return r.json()}).then(function(d){if(d.success)location.reload();else alert('Failed: '+(d.error||'Unknown'))}).catch(function(e){alert(e.message)})}
</script>";

            return Results.Content(Page(ctx, "/agents", html), "text/html");
        });

        // POST /agents - create agent
        app.MapPost("/agents", async (HttpContext ctx, ApiClient api) =>
        {
            var form = await ctx.Request.ReadFormAsync();
            var soulId = form["soulId"].ToString();
            var provider = form["provider"].ToString();
            if (string.IsNullOrEmpty(provider)) provider = "anthropic";
            var payload = new Dictionary<string, object>
            {
                ["name"] = form["name"].ToString(),
                ["description"] = form["description"].ToString(),
                ["model"] = form["model"].ToString(),
                ["provider"] = provider,
                ["persona"] = new Dictionary<string, object>
                {
                    ["gender"] = form["gender"].ToString(),
                    ["dateOfBirth"] = form["date_of_birth"].ToString(),
                    ["maritalStatus"] = form["marital_status"].ToString(),
                    ["culturalBackground"] = form["cultural_background"].ToString(),
                    ["language"] = form["language"].ToString(),
                    ["traits"] = new Dictionary<string, string>
                    {
                        ["communication"] = string.IsNullOrEmpty(form["trait_communication"].ToString()) ? "direct" : form["trait_communication"].ToString(),
                        ["detail"] = string.IsNullOrEmpty(form["trait_detail"].ToString()) ? "detail-oriented" : form["trait_detail"].ToString(),
                        ["energy"] = string.IsNullOrEmpty(form["trait_energy"].ToString()) ? "calm" : form["trait_energy"].ToString(),
                        ["humor"] = form["humor"].ToString(),
                        ["formality"] = form["formality"].ToString(),
                        ["empathy"] = form["empathy"].ToString(),
                        ["patience"] = form["patience"].ToString(),
                        ["creativity"] = form["creativity"].ToString()
                    }
                }
            };
            if (!string.IsNullOrEmpty(soulId))
                payload["soulId"] = soulId;

            var (data, statusCode) = await api.PostAsync(ctx, "/api/agents", payload);

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Agent created", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to create agent";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/agents");
        });

        // POST /agents/{id}/archive - archive agent
        app.MapPost("/agents/{id}/archive", async (string id, HttpContext ctx, ApiClient api) =>
        {
            var (data, statusCode) = await api.PatchAsync(ctx, $"/api/agents/{id}", new { status = "archived" });

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Agent archived", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to archive agent";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/agents");
        });

        // POST /agents/{id}/deploy - deploy agent
        app.MapPost("/agents/{id}/deploy", async (string id, HttpContext ctx, ApiClient api) =>
        {
            await api.PostAsync(ctx, $"/engine/agents/{id}/deploy");
            return Results.Redirect($"/agents/{id}");
        });

        // POST /agents/{id}/stop - stop agent
        app.MapPost("/agents/{id}/stop", async (string id, HttpContext ctx, ApiClient api) =>
        {
            await api.PostAsync(ctx, $"/engine/agents/{id}/stop");
            return Results.Redirect($"/agents/{id}");
        });

        // POST /agents/{id}/restart - restart agent
        app.MapPost("/agents/{id}/restart", async (string id, HttpContext ctx, ApiClient api) =>
        {
            await api.PostAsync(ctx, $"/engine/agents/{id}/restart");
            return Results.Redirect($"/agents/{id}");
        });
    }
}
