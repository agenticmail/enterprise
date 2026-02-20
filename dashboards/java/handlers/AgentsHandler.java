/**
 * AgentsHandler — List agents, create agent, archive agent, agent detail.
 * Routes: GET /agents, GET /agents/{id}, POST /agents, POST /agents/{id}/archive,
 *         POST /agents/{id}/deploy, POST /agents/{id}/stop, POST /agents/{id}/restart
 */

import com.sun.net.httpserver.*;
import java.io.*;
import java.util.*;

public class AgentsHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            String path = ex.getRequestURI().getPath();
            String method = ex.getRequestMethod();

            // POST /agents/{id}/archive
            if ("POST".equals(method) && path.matches("/agents/[^/]+/archive")) {
                handleArchive(ex, path);
                return;
            }

            // POST /agents/{id}/deploy|stop|restart
            if ("POST".equals(method) && path.matches("/agents/[^/]+/(deploy|stop|restart)")) {
                handleEngineAction(ex, path);
                return;
            }

            // POST /agents (create)
            if ("POST".equals(method)) {
                handleCreate(ex);
                return;
            }

            // GET /agents/{id} (detail) — must come before list
            if ("GET".equals(method) && path.matches("/agents/[^/]+") && !path.equals("/agents")) {
                handleDetail(ex, path);
                return;
            }

            // GET /agents (list)
            handleList(ex);

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }

    // ─── Name / Email / Model Resolution ─────────────────

    @SuppressWarnings("unchecked")
    private String resolveAgentName(Map<String, Object> a) {
        Map<String, Object> identity = Helpers.mapVal(a, "identity");
        if (!identity.isEmpty()) {
            String v = Helpers.strVal(identity, "name");
            if (!v.isEmpty()) return v;
        }
        Map<String, Object> config = Helpers.mapVal(a, "config");
        if (!config.isEmpty()) {
            String v = Helpers.strVal(config, "name");
            if (!v.isEmpty()) return v;
            v = Helpers.strVal(config, "displayName");
            if (!v.isEmpty()) return v;
        }
        String v = Helpers.strVal(a, "name");
        return v.isEmpty() ? "Unnamed Agent" : v;
    }

    @SuppressWarnings("unchecked")
    private String resolveAgentEmail(Map<String, Object> a) {
        Map<String, Object> identity = Helpers.mapVal(a, "identity");
        if (!identity.isEmpty()) {
            String v = Helpers.strVal(identity, "email");
            if (!v.isEmpty() && v.contains("@")) return v;
        }
        Map<String, Object> config = Helpers.mapVal(a, "config");
        if (!config.isEmpty()) {
            String v = Helpers.strVal(config, "email");
            if (!v.isEmpty() && v.contains("@")) return v;
        }
        String v = Helpers.strVal(a, "email");
        return (!v.isEmpty() && v.contains("@")) ? v : "";
    }

    @SuppressWarnings("unchecked")
    private String resolveModel(Map<String, Object> a) {
        Map<String, Object> config = Helpers.mapVal(a, "config");
        if (!config.isEmpty()) {
            Object modelObj = config.get("model");
            if (modelObj instanceof String) return (String) modelObj;
            if (modelObj instanceof Map) {
                Map<String, Object> modelMap = (Map<String, Object>) modelObj;
                String v = Helpers.strVal(modelMap, "modelId");
                if (!v.isEmpty()) return v;
                v = Helpers.strVal(modelMap, "provider");
                if (!v.isEmpty()) return v;
            }
        }
        return Helpers.strVal(a, "model");
    }

    // ─── Handlers ────────────────────────────────────────

    private void handleCreate(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);
        Map<String, String> form = SessionManager.parseForm(ex);

        String provider = form.getOrDefault("provider", "anthropic");
        if (provider.isEmpty()) provider = "anthropic";

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", form.getOrDefault("name", ""));
        body.put("model", form.getOrDefault("model", "gpt-4o"));
        body.put("provider", provider);
        body.put("description", form.getOrDefault("description", ""));

        String soulId = form.getOrDefault("soulId", "");
        if (!soulId.isEmpty()) {
            body.put("soulId", soulId);
        }

        Map<String, Object> persona = new LinkedHashMap<>();
        persona.put("gender", form.getOrDefault("gender", ""));
        persona.put("dateOfBirth", form.getOrDefault("date_of_birth", ""));
        persona.put("maritalStatus", form.getOrDefault("marital_status", ""));
        persona.put("culturalBackground", form.getOrDefault("cultural_background", ""));
        persona.put("language", form.getOrDefault("language", ""));
        Map<String, String> traits = new LinkedHashMap<>();
        traits.put("communication", form.getOrDefault("trait_communication", "direct"));
        traits.put("detail", form.getOrDefault("trait_detail", "detail-oriented"));
        traits.put("energy", form.getOrDefault("trait_energy", "calm"));
        traits.put("humor", form.getOrDefault("humor", "warm"));
        traits.put("formality", form.getOrDefault("formality", "adaptive"));
        traits.put("empathy", form.getOrDefault("empathy", "moderate"));
        traits.put("patience", form.getOrDefault("patience", "patient"));
        traits.put("creativity", form.getOrDefault("creativity", "creative"));
        persona.put("traits", traits);
        body.put("persona", persona);

        var result = ApiClient.post("/api/agents", token, ApiClient.toJsonMixed(body));
        int status = Helpers.intVal(result, "_status");

        if (status > 0 && status < 300) {
            SessionManager.setFlash(ex, "Agent created successfully", "success");
        } else {
            String err = Helpers.strVal(result, "error");
            if (err.isEmpty()) err = "Failed to create agent";
            SessionManager.setFlash(ex, err, "danger");
        }

        SessionManager.redirect(ex, "/agents");
    }

    private void handleArchive(HttpExchange ex, String path) throws IOException {
        String token = SessionManager.getToken(ex);
        // Consume POST body even if we don't use it
        SessionManager.parseForm(ex);

        // Extract ID from /agents/{id}/archive
        String[] parts = path.split("/");
        String id = parts.length >= 3 ? parts[2] : "";

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "archived");

        var result = ApiClient.patch("/api/agents/" + id, token, ApiClient.toJsonMixed(body));
        int status = Helpers.intVal(result, "_status");

        if (status > 0 && status < 300) {
            SessionManager.setFlash(ex, "Agent archived", "success");
        } else {
            String err = Helpers.strVal(result, "error");
            if (err.isEmpty()) err = "Failed to archive agent";
            SessionManager.setFlash(ex, err, "danger");
        }

        SessionManager.redirect(ex, "/agents");
    }

    private void handleEngineAction(HttpExchange ex, String path) throws IOException {
        String token = SessionManager.getToken(ex);
        SessionManager.parseForm(ex);

        String[] parts = path.split("/");
        String id = parts.length >= 3 ? parts[2] : "";
        String action = parts.length >= 4 ? parts[3] : "";

        ApiClient.post("/engine/agents/" + id + "/" + action, token, "{}");

        String referer = ex.getRequestHeaders().getFirst("Referer");
        SessionManager.redirect(ex, referer != null ? referer : "/agents/" + id);
    }

    private void handleList(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);
        var data = ApiClient.get("/api/agents", token);

        List<Map<String, Object>> agents = Helpers.listVal(data, "agents");
        if (agents.isEmpty()) {
            // Try top-level array
            agents = Helpers.listVal(data, "_raw");
        }

        StringBuilder html = new StringBuilder();
        html.append(Components.pageHeader("Agents", "Manage AI agents in your organization"));

        // Create form
        html.append(Components.cardStart("Create Agent"));
        html.append("<form method='POST' action='/agents'>");
        html.append("<div class='form-row'>");
        html.append("<div class='form-group'><label>Name</label>");
        html.append("<input type='text' name='name' required placeholder='e.g. Support Agent'></div>");
        html.append("<div class='form-group'><label>Model</label>");
        html.append("<select name='model' id='agent-model'><option value=''>Loading models...</option></select></div>");
        html.append("</div>");
        html.append("<div class='form-group'><label>Provider</label>");
        html.append("<select name='provider' id='agent-provider'><option value='anthropic'>Anthropic</option><option value='openai'>OpenAI</option><option value='google'>Google</option><option value='deepseek'>DeepSeek</option><option value='xai'>xAI (Grok)</option><option value='mistral'>Mistral</option><option value='groq'>Groq</option><option value='together'>Together</option><option value='fireworks'>Fireworks</option><option value='moonshot'>Moonshot (Kimi)</option><option value='cerebras'>Cerebras</option><option value='openrouter'>OpenRouter</option><option value='ollama'>Ollama (Local)</option><option value='vllm'>vLLM (Local)</option><option value='lmstudio'>LM Studio (Local)</option><option value='litellm'>LiteLLM (Local)</option></select></div>");
        html.append("<div class='form-group'><label>Description</label>");
        html.append("<input type='text' name='description' placeholder='What does this agent do?'></div>");
        html.append("<div class='form-group'><label>Role Template</label>");
        html.append("<select name='soulId'>");
        html.append("<option value=''>Custom (no template)</option>");
        html.append("<optgroup label='Support'>");
        html.append("<option value='customer-support-lead'>Customer Support Lead</option>");
        html.append("<option value='technical-support-engineer'>Technical Support Engineer</option>");
        html.append("<option value='customer-success-manager'>Customer Success Manager</option>");
        html.append("</optgroup>");
        html.append("<optgroup label='Sales'>");
        html.append("<option value='sales-development-rep'>Sales Development Rep</option>");
        html.append("<option value='account-executive'>Account Executive</option>");
        html.append("</optgroup>");
        html.append("<optgroup label='Engineering'>");
        html.append("<option value='senior-software-engineer'>Senior Software Engineer</option>");
        html.append("<option value='devops-engineer'>DevOps Engineer</option>");
        html.append("<option value='qa-engineer'>QA Engineer</option>");
        html.append("</optgroup>");
        html.append("<optgroup label='Operations'>");
        html.append("<option value='executive-assistant'>Executive Assistant</option>");
        html.append("<option value='project-coordinator'>Project Coordinator</option>");
        html.append("</optgroup>");
        html.append("<optgroup label='Marketing'>");
        html.append("<option value='content-writer'>Content Writer</option>");
        html.append("<option value='social-media-manager'>Social Media Manager</option>");
        html.append("</optgroup>");
        html.append("<optgroup label='Finance'>");
        html.append("<option value='financial-controller'>Financial Controller</option>");
        html.append("<option value='expense-auditor'>Expense Auditor</option>");
        html.append("</optgroup>");
        html.append("<optgroup label='Legal'>");
        html.append("<option value='legal-compliance-officer'>Legal Compliance Officer</option>");
        html.append("<option value='contract-reviewer'>Contract Reviewer</option>");
        html.append("</optgroup>");
        html.append("<optgroup label='Security'>");
        html.append("<option value='security-analyst'>Security Analyst</option>");
        html.append("<option value='compliance-auditor'>Compliance Auditor</option>");
        html.append("</optgroup>");
        html.append("</select></div>");
        html.append("<fieldset class='persona-fieldset'><legend>Persona (optional)</legend>");
        html.append("<div class='form-row'><div class='form-group'><label>Date of Birth</label><input type='date' name='date_of_birth' id='date_of_birth'></div></div>");
        html.append("<div class='form-row'><div class='form-group'><label>Gender</label><select name='gender'><option value=''>Not specified</option><option value='male'>Male</option><option value='female'>Female</option><option value='non-binary'>Non-binary</option></select></div></div>");
        html.append("<div class='form-row'><div class='form-group'><label>Marital Status</label><select name='marital_status'><option value=''>Not specified</option><option value='single'>Single</option><option value='married'>Married</option><option value='divorced'>Divorced</option></select></div><div class='form-group'><label>Cultural Background</label><select name='cultural_background'><option value=''>Not specified</option><option value='north-american'>North American</option><option value='british-european'>British / European</option><option value='latin-american'>Latin American</option><option value='middle-eastern'>Middle Eastern</option><option value='east-asian'>East Asian</option><option value='south-asian'>South Asian</option><option value='southeast-asian'>Southeast Asian</option><option value='african'>African</option><option value='caribbean'>Caribbean</option><option value='australian-pacific'>Australian / Pacific</option></select></div></div>");
        html.append("<div class='form-row'><div class='form-group'><label>Language</label><select name='language'><option value='en-us'>English (American)</option><option value='en-gb'>English (British)</option><option value='en-au'>English (Australian)</option><option value='es'>Spanish</option><option value='pt'>Portuguese</option><option value='fr'>French</option><option value='de'>German</option><option value='ja'>Japanese</option><option value='ko'>Korean</option><option value='zh'>Mandarin</option><option value='hi'>Hindi</option><option value='ar'>Arabic</option><option value='yo'>Yoruba</option><option value='ig'>Igbo</option><option value='sw'>Swahili</option><option value='it'>Italian</option><option value='nl'>Dutch</option><option value='ru'>Russian</option><option value='tr'>Turkish</option><option value='pl'>Polish</option><option value='th'>Thai</option><option value='vi'>Vietnamese</option><option value='id'>Indonesian</option><option value='ms'>Malay</option><option value='tl'>Filipino (Tagalog)</option></select></div><div class='form-group'><label>Communication Style</label><select name='trait_communication'><option value='direct'>Direct</option><option value='diplomatic'>Diplomatic</option></select></div></div>");
        html.append("<div class='form-row'><div class='form-group'><label>Detail Level</label><select name='trait_detail'><option value='detail-oriented'>Detail-oriented</option><option value='big-picture'>Big-picture</option></select></div><div class='form-group'><label>Energy</label><select name='trait_energy'><option value='calm'>Calm &amp; measured</option><option value='enthusiastic'>Enthusiastic</option></select></div></div>");
        html.append("<div class='form-group'><label>Humor</label><select name='humor' id='humor'><option value='witty'>Witty</option><option value='dry'>Dry</option><option value='warm' selected>Warm</option><option value='none'>None</option></select></div>");
        html.append("<div class='form-group'><label>Formality</label><select name='formality' id='formality'><option value='formal'>Formal</option><option value='casual'>Casual</option><option value='adaptive' selected>Adaptive</option></select></div>");
        html.append("<div class='form-group'><label>Empathy</label><select name='empathy' id='empathy'><option value='high'>High</option><option value='moderate' selected>Moderate</option><option value='reserved'>Reserved</option></select></div>");
        html.append("<div class='form-group'><label>Patience</label><select name='patience' id='patience'><option value='patient' selected>Patient</option><option value='efficient'>Efficient</option></select></div>");
        html.append("<div class='form-group'><label>Creativity</label><select name='creativity' id='creativity'><option value='creative' selected>Creative</option><option value='conventional'>Conventional</option></select></div>");
        html.append("</fieldset>");
        html.append("<button class='btn btn-primary' type='submit'>Create Agent</button>");
        html.append("</form>");
        html.append("<script>");
        html.append("function loadModels(provider){var sel=document.getElementById('agent-model');if(!sel)return;fetch('/api/providers/'+provider+'/models').then(function(r){return r.json()}).then(function(d){sel.innerHTML='';(d.models||[]).forEach(function(m){var o=document.createElement('option');o.value=m.id;o.textContent=m.name||m.id;sel.appendChild(o)});var c=document.createElement('option');c.value='custom';c.textContent='Custom (enter manually)';sel.appendChild(c)}).catch(function(){sel.innerHTML='<option value=\"\">Type model ID</option>'})}");
        html.append("var provSel=document.getElementById('agent-provider');if(provSel){provSel.addEventListener('change',function(){loadModels(this.value)});loadModels(provSel.value||'anthropic')}");
        html.append("</script>");
        html.append(Components.cardEnd());

        // Agent list
        html.append(Components.cardStart("All Agents (" + agents.size() + ")"));
        if (agents.isEmpty()) {
            html.append(Components.empty("&#129302;", "No agents yet. Create one above."));
        } else {
            html.append(Components.tableStart("Name", "Model", "Status", "Created", "Actions"));
            for (var a : agents) {
                String displayName = resolveAgentName(a);
                String model = resolveModel(a);
                if (model.isEmpty()) model = Helpers.strVal(a, "role");
                if (model.isEmpty()) model = "-";
                String agentStatus = Helpers.strVal(a, "status");
                if (agentStatus.isEmpty()) agentStatus = "active";
                String created = Helpers.strVal(a, "created_at");
                String id = Helpers.strVal(a, "id");

                html.append("<tr>");
                html.append("<td><a href='/agents/").append(Helpers.esc(id))
                    .append("' style='color:var(--accent);text-decoration:none;font-weight:600'>")
                    .append(Helpers.esc(displayName)).append("</a></td>");
                html.append("<td><code>").append(Helpers.esc(model)).append("</code></td>");
                html.append("<td>").append(Components.statusBadge(agentStatus)).append("</td>");
                html.append("<td style='color:var(--text-muted)'>").append(Helpers.timeAgo(created)).append("</td>");
                html.append("<td>");
                if (!"archived".equalsIgnoreCase(agentStatus)) {
                    html.append(Components.confirmForm("/agents/" + Helpers.esc(id) + "/archive", "Archive", "Archive this agent?"));
                }
                html.append("</td>");
                html.append("</tr>");
            }
            html.append(Components.tableEnd());
        }
        html.append(Components.cardEnd());

        String flash = SessionManager.consumeFlash(ex);
        SessionManager.respond(ex, 200, Layout.layout("/agents", SessionManager.getUser(ex), flash, html.toString()));
    }

    // ─── Agent Detail ────────────────────────────────────

    @SuppressWarnings("unchecked")
    private void handleDetail(HttpExchange ex, String path) throws IOException {
        String token = SessionManager.getToken(ex);
        String[] parts = path.split("/");
        String id = parts.length >= 3 ? parts[2] : "";

        var data = ApiClient.get("/api/agents/" + id, token);
        if (data == null || data.containsKey("error")) {
            SessionManager.redirect(ex, "/agents");
            return;
        }

        // The API may return the agent at top level or nested under "agent"
        Map<String, Object> a = data;
        Map<String, Object> nested = Helpers.mapVal(data, "agent");
        if (!nested.isEmpty()) a = nested;

        String displayName = resolveAgentName(a);
        String email = resolveAgentEmail(a);
        String status = Helpers.strVal(a, "status");
        if (status.isEmpty()) status = "active";
        String role = Helpers.strVal(a, "role");
        if (role.isEmpty()) role = "agent";
        String model = resolveModel(a);
        if (model.isEmpty()) model = "-";
        String created = Helpers.strVal(a, "created_at");
        String description = Helpers.strVal(a, "description");

        // Avatar initial
        String initial = displayName.isEmpty() ? "?" : displayName.substring(0, 1).toUpperCase();

        Map<String, Object> persona = Helpers.mapVal(a, "persona");
        Map<String, Object> config = Helpers.mapVal(a, "config");

        StringBuilder html = new StringBuilder();

        // Back link
        html.append("<div style='margin-bottom:24px'><a href='/agents' style='color:var(--accent);text-decoration:none;font-size:13px'>&larr; Back to Agents</a></div>");

        // Header: avatar + name + badges + email
        html.append("<div style='display:flex;align-items:center;gap:16px;margin-bottom:24px'>");
        html.append("<div style='width:56px;height:56px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700'>")
            .append(Helpers.esc(initial)).append("</div>");
        html.append("<div>");
        html.append("<h1 style='font-size:22px;font-weight:700;margin-bottom:4px'>").append(Helpers.esc(displayName)).append("</h1>");
        html.append("<div style='display:flex;gap:8px;align-items:center;flex-wrap:wrap'>");
        html.append(Components.statusBadge(status)).append(" ").append(Components.roleBadge(role));
        if (!email.isEmpty()) {
            html.append(" <span style='color:var(--text-secondary);font-size:13px'>").append(Helpers.esc(email)).append("</span>");
        }
        html.append("</div></div></div>");

        // Summary card
        html.append(Components.cardStart("Summary"));
        html.append("<div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px'>");
        html.append("<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Status</div><div style='margin-top:4px'>").append(Components.statusBadge(status)).append("</div></div>");
        html.append("<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Role</div><div style='margin-top:4px'>").append(Components.roleBadge(role)).append("</div></div>");
        html.append("<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Model</div><div style='margin-top:4px'><code>").append(Helpers.esc(model)).append("</code></div></div>");
        html.append("<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Created</div><div style='margin-top:4px;font-size:13px;color:var(--text-secondary)'>").append(Helpers.esc(created)).append("</div></div>");
        html.append("</div>");
        html.append(Components.cardEnd());

        // Description
        if (!description.isEmpty()) {
            html.append(Components.cardStart("Description"));
            html.append("<p style='font-size:14px;color:var(--text-secondary);line-height:1.6'>").append(Helpers.esc(description)).append("</p>");
            html.append(Components.cardEnd());
        }

        // Personality traits
        Map<String, Object> traits = Helpers.mapVal(persona, "traits");
        if (traits.isEmpty()) traits = Helpers.mapVal(config, "traits");
        if (!traits.isEmpty()) {
            html.append(Components.cardStart("Personality Traits"));
            html.append("<div style='display:flex;flex-wrap:wrap;gap:4px'>");
            for (var entry : traits.entrySet()) {
                String val = entry.getValue() != null ? entry.getValue().toString() : "";
                if (!val.isEmpty()) {
                    html.append("<span style='display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;background:var(--bg-secondary,#f0f0f0);color:var(--text-primary,#333);margin:3px'>")
                        .append(Helpers.esc(entry.getKey())).append(": ").append(Helpers.esc(val)).append("</span>");
                }
            }
            html.append("</div>");
            html.append(Components.cardEnd());
        }

        // Actions
        html.append(Components.cardStart("Actions"));
        html.append("<div style='display:flex;gap:8px;flex-wrap:wrap'>");
        html.append("<form method='POST' action='/agents/").append(Helpers.esc(id)).append("/deploy' style='display:inline'><button class='btn btn-primary btn-sm' type='submit'>Deploy</button></form>");
        html.append("<form method='POST' action='/agents/").append(Helpers.esc(id)).append("/stop' style='display:inline'><button class='btn btn-sm btn-warning' type='submit'>Stop</button></form>");
        html.append("<form method='POST' action='/agents/").append(Helpers.esc(id)).append("/restart' style='display:inline'><button class='btn btn-sm' type='submit'>Restart</button></form>");
        html.append("</div>");
        html.append(Components.cardEnd());

        // Personal details
        String gender = Helpers.strVal(persona, "gender");
        String dob = Helpers.strVal(persona, "dateOfBirth");
        String marital = Helpers.strVal(persona, "maritalStatus");
        String cultural = Helpers.strVal(persona, "culturalBackground");
        String language = Helpers.strVal(persona, "language");
        boolean hasPersonal = !gender.isEmpty() || !dob.isEmpty() || !marital.isEmpty() || !cultural.isEmpty() || !language.isEmpty();

        if (hasPersonal) {
            html.append(Components.cardStart("Personal Details"));
            html.append("<div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px'>");
            if (!gender.isEmpty()) {
                html.append("<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Gender</div><div style='margin-top:4px;font-size:14px'>").append(Helpers.esc(gender)).append("</div></div>");
            }
            if (!dob.isEmpty()) {
                html.append("<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Date of Birth</div><div style='margin-top:4px;font-size:14px'>").append(Helpers.esc(dob)).append("</div></div>");
            }
            if (!marital.isEmpty()) {
                html.append("<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Marital Status</div><div style='margin-top:4px;font-size:14px'>").append(Helpers.esc(marital)).append("</div></div>");
            }
            if (!cultural.isEmpty()) {
                html.append("<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Cultural Background</div><div style='margin-top:4px;font-size:14px'>").append(Helpers.esc(cultural)).append("</div></div>");
            }
            if (!language.isEmpty()) {
                html.append("<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Language</div><div style='margin-top:4px;font-size:14px'>").append(Helpers.esc(language)).append("</div></div>");
            }
            html.append("</div>");
            html.append(Components.cardEnd());
        }

        // Permission profile
        Map<String, Object> permissions = Helpers.mapVal(a, "permissions");
        if (permissions.isEmpty()) permissions = Helpers.mapVal(config, "permissions");
        if (!permissions.isEmpty()) {
            // Profile Name
            String profileName = Helpers.strVal(permissions, "name");
            if (profileName.isEmpty()) profileName = Helpers.strVal(permissions, "preset");
            if (profileName.isEmpty()) profileName = "Custom";

            // Max Risk Level
            String maxRisk = Helpers.strVal(permissions, "maxRiskLevel");
            if (maxRisk.isEmpty()) maxRisk = Helpers.strVal(permissions, "max_risk_level");
            String riskColor;
            switch (maxRisk.toLowerCase()) {
                case "low": riskColor = "#10b981"; break;
                case "medium": riskColor = "#f59e0b"; break;
                case "high": case "critical": riskColor = "#ef4444"; break;
                default: riskColor = "#64748b"; break;
            }
            String riskBadge = maxRisk.isEmpty()
                ? "<span style='color:var(--text-secondary)'>-</span>"
                : "<span style='display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:" + riskColor + "20;color:" + riskColor + "'>" + Helpers.esc(maxRisk) + "</span>";

            // Sandbox Mode
            String sandboxMode = "Disabled";
            Object sbVal = permissions.get("sandboxMode");
            if (sbVal == null) sbVal = permissions.get("sandbox_mode");
            if (Boolean.TRUE.equals(sbVal)) sandboxMode = "Enabled";

            // Rate Limits
            Map<String, Object> rl = Helpers.mapVal(permissions, "rateLimits");
            if (rl.isEmpty()) rl = Helpers.mapVal(permissions, "rate_limits");
            String cpm = Helpers.strVal(rl, "toolCallsPerMinute");
            if (cpm.isEmpty()) cpm = Helpers.strVal(rl, "calls_per_minute");
            String cph = Helpers.strVal(rl, "toolCallsPerHour");
            if (cph.isEmpty()) cph = Helpers.strVal(rl, "calls_per_hour");
            String rateLimits;
            if (!cpm.isEmpty() || !cph.isEmpty()) {
                StringBuilder rlBuf = new StringBuilder();
                if (!cpm.isEmpty()) rlBuf.append(Helpers.esc(cpm)).append("/min");
                if (!cph.isEmpty()) {
                    if (rlBuf.length() > 0) rlBuf.append(", ");
                    rlBuf.append(Helpers.esc(cph)).append("/hr");
                }
                rateLimits = rlBuf.toString();
            } else {
                rateLimits = "None set";
            }

            // Blocked Side Effects
            StringBuilder blockedBuf = new StringBuilder();
            Object bseObj = permissions.get("blockedSideEffects");
            if (bseObj == null) bseObj = permissions.get("blocked_side_effects");
            if (bseObj instanceof List) {
                for (Object effect : (List<?>) bseObj) {
                    blockedBuf.append("<span style='display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:#ef4444;color:#fff;margin:2px'>")
                        .append(Helpers.esc(effect)).append("</span>");
                }
            }
            String blockedHTML = blockedBuf.length() > 0
                ? blockedBuf.toString()
                : "<span style='color:var(--text-secondary)'>None</span>";

            html.append(Components.cardStart("Permission Profile"));
            html.append("<div style='display:grid;grid-template-columns:1fr 1fr;gap:16px'>");
            html.append("<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Profile Name</div><div style='margin-top:4px;font-size:14px'>").append(Helpers.esc(profileName)).append("</div></div>");
            html.append("<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Max Risk Level</div><div style='margin-top:4px'>").append(riskBadge).append("</div></div>");
            html.append("<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Sandbox Mode</div><div style='margin-top:4px;font-size:14px'>").append(Helpers.esc(sandboxMode)).append("</div></div>");
            html.append("<div><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em'>Rate Limits</div><div style='margin-top:4px;font-size:14px'>").append(rateLimits).append("</div></div>");
            html.append("</div>");
            html.append("<div style='margin-top:16px'><div style='font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px'>Blocked Side Effects</div><div style='display:flex;flex-wrap:wrap;gap:4px'>").append(blockedHTML).append("</div></div>");
            html.append(Components.cardEnd());
        }

        // ── Tool Security Section ────────────────────────────
        Map<String, Object> tsData = new HashMap<>();
        try { tsData = ApiClient.get("/engine/agents/" + id + "/tool-security", token); } catch (Exception ignored) {}
        if (tsData != null && !tsData.isEmpty()) {
            Map<String, Object> toolSec = Helpers.mapVal(tsData, "toolSecurity");
            Map<String, Object> orgDefaults = Helpers.mapVal(tsData, "orgDefaults");

            Map<String, Object> securityMap = Helpers.mapVal(toolSec, "security");
            if (securityMap.isEmpty()) securityMap = Helpers.mapVal(orgDefaults, "security");
            Map<String, Object> mwMap = Helpers.mapVal(toolSec, "middleware");
            if (mwMap.isEmpty()) mwMap = Helpers.mapVal(orgDefaults, "middleware");

            Map<String, Object> pathSandbox = Helpers.mapVal(securityMap, "pathSandbox");
            Map<String, Object> ssrfMap = Helpers.mapVal(securityMap, "ssrf");
            Map<String, Object> cmdSanitizer = Helpers.mapVal(securityMap, "commandSanitizer");
            Map<String, Object> auditMap = Helpers.mapVal(mwMap, "audit");
            Map<String, Object> rateLimitMap = Helpers.mapVal(mwMap, "rateLimit");
            Map<String, Object> cbMap = Helpers.mapVal(mwMap, "circuitBreaker");
            Map<String, Object> telMap = Helpers.mapVal(mwMap, "telemetry");

            String cmdMode = Helpers.strVal(cmdSanitizer, "mode");
            if (cmdMode.isEmpty()) cmdMode = "blocklist";

            html.append(Components.cardStart("Tool Security"));
            html.append("<div style='display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px'>");

            html.append("<div style='padding:12px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
            html.append("<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'><strong style='font-size:13px'>Path Sandbox</strong>").append(enabledBadge(pathSandbox)).append("</div>");
            html.append("<div style='font-size:12px;color:var(--text-muted)'>Restricts file system access</div>");
            html.append("</div>");

            html.append("<div style='padding:12px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
            html.append("<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'><strong style='font-size:13px'>SSRF Protection</strong>").append(enabledBadge(ssrfMap)).append("</div>");
            html.append("<div style='font-size:12px;color:var(--text-muted)'>Prevents server-side request forgery</div>");
            html.append("</div>");

            html.append("<div style='padding:12px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
            html.append("<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'><strong style='font-size:13px'>Command Sanitizer</strong>").append(enabledBadge(cmdSanitizer)).append("</div>");
            html.append("<div style='font-size:12px;color:var(--text-muted)'>Mode: ").append(Helpers.esc(cmdMode)).append("</div>");
            html.append("</div>");

            html.append("</div>");

            html.append("<div style='display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:16px'>");

            html.append("<div style='padding:12px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
            html.append("<div style='display:flex;justify-content:space-between;align-items:center'><strong style='font-size:13px'>Audit</strong>").append(enabledBadge(auditMap)).append("</div>");
            html.append("</div>");

            html.append("<div style='padding:12px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
            html.append("<div style='display:flex;justify-content:space-between;align-items:center'><strong style='font-size:13px'>Rate Limit</strong>").append(enabledBadge(rateLimitMap)).append("</div>");
            html.append("</div>");

            html.append("<div style='padding:12px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
            html.append("<div style='display:flex;justify-content:space-between;align-items:center'><strong style='font-size:13px'>Circuit Breaker</strong>").append(enabledBadge(cbMap)).append("</div>");
            html.append("</div>");

            html.append("<div style='padding:12px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border)'>");
            html.append("<div style='display:flex;justify-content:space-between;align-items:center'><strong style='font-size:13px'>Telemetry</strong>").append(enabledBadge(telMap)).append("</div>");
            html.append("</div>");

            html.append("</div>");
            html.append(Components.cardEnd());
        }

        // ── Activity Section ─────────────────────────────────
        // Fetch events, tool calls, and journal entries (failures are non-fatal)
        Map<String, Object> eventsData = new HashMap<>();
        Map<String, Object> toolCallsData = new HashMap<>();
        Map<String, Object> journalData = new HashMap<>();
        try { eventsData = ApiClient.get("/engine/activity/events?agentId=" + id + "&limit=50", token); } catch (Exception ignored) {}
        try { toolCallsData = ApiClient.get("/engine/activity/tool-calls?agentId=" + id + "&limit=50", token); } catch (Exception ignored) {}
        try { journalData = ApiClient.get("/engine/journal?agentId=" + id + "&orgId=default&limit=50", token); } catch (Exception ignored) {}

        // Events rows
        StringBuilder eventsRows = new StringBuilder();
        List<Map<String, Object>> eventsList = Helpers.listVal(eventsData, "events");
        if (eventsList.isEmpty()) eventsList = Helpers.listVal(eventsData, "items");
        for (var evt : eventsList) {
            String evJson = escapeJsonForAttr(evt);
            String evTime = Helpers.strVal(evt, "timestamp");
            if (evTime.isEmpty()) evTime = Helpers.strVal(evt, "createdAt");
            if (evTime.isEmpty()) evTime = Helpers.strVal(evt, "created_at");
            String evType = Helpers.strVal(evt, "type");
            if (evType.isEmpty()) evType = Helpers.strVal(evt, "eventType");
            String evDetails = Helpers.strVal(evt, "description");
            if (evDetails.isEmpty()) evDetails = Helpers.strVal(evt, "message");
            if (evDetails.isEmpty()) evDetails = Helpers.strVal(evt, "details");
            eventsRows.append("<tr style='cursor:pointer' onclick=\"showActivityDetail('")
                .append(evJson).append("','Event Detail')\">");
            eventsRows.append("<td style='white-space:nowrap;font-size:12px;color:var(--text-secondary)'>").append(Helpers.esc(evTime)).append("</td>");
            eventsRows.append("<td>").append(Components.statusBadge(evType)).append("</td>");
            eventsRows.append("<td style='font-size:13px;color:var(--text-secondary)'>").append(Helpers.esc(evDetails)).append("</td>");
            eventsRows.append("</tr>");
        }
        if (eventsRows.length() == 0) {
            eventsRows.append("<tr><td colspan='3' style='text-align:center;padding:24px;color:var(--text-secondary)'>No events for this agent</td></tr>");
        }

        // Tool calls rows
        StringBuilder toolCallsRows = new StringBuilder();
        List<Map<String, Object>> toolsList = Helpers.listVal(toolCallsData, "toolCalls");
        if (toolsList.isEmpty()) toolsList = Helpers.listVal(toolCallsData, "tool_calls");
        if (toolsList.isEmpty()) toolsList = Helpers.listVal(toolCallsData, "items");
        for (var tc : toolsList) {
            String tcJson = escapeJsonForAttr(tc);
            String tcTime = Helpers.strVal(tc, "timestamp");
            if (tcTime.isEmpty()) tcTime = Helpers.strVal(tc, "createdAt");
            if (tcTime.isEmpty()) tcTime = Helpers.strVal(tc, "created_at");
            String tcTool = Helpers.strVal(tc, "tool");
            if (tcTool.isEmpty()) tcTool = Helpers.strVal(tc, "toolName");
            if (tcTool.isEmpty()) tcTool = Helpers.strVal(tc, "tool_name");
            String tcDuration = Helpers.strVal(tc, "duration");
            if (tcDuration.isEmpty()) tcDuration = Helpers.strVal(tc, "durationMs");
            if (!tcDuration.isEmpty()) tcDuration += "ms"; else tcDuration = "-";
            String tcStatus = Helpers.strVal(tc, "status");
            if (tcStatus.isEmpty()) tcStatus = Helpers.strVal(tc, "result");
            if (tcStatus.isEmpty()) tcStatus = "unknown";
            toolCallsRows.append("<tr style='cursor:pointer' onclick=\"showActivityDetail('")
                .append(tcJson).append("','Tool Call Detail')\">");
            toolCallsRows.append("<td style='white-space:nowrap;font-size:12px;color:var(--text-secondary)'>").append(Helpers.esc(tcTime)).append("</td>");
            toolCallsRows.append("<td><code style='font-size:12px'>").append(Helpers.esc(tcTool)).append("</code></td>");
            toolCallsRows.append("<td style='font-size:13px;color:var(--text-secondary)'>").append(Helpers.esc(tcDuration)).append("</td>");
            toolCallsRows.append("<td>").append(Components.statusBadge(tcStatus)).append("</td>");
            toolCallsRows.append("</tr>");
        }
        if (toolCallsRows.length() == 0) {
            toolCallsRows.append("<tr><td colspan='4' style='text-align:center;padding:24px;color:var(--text-secondary)'>No tool calls for this agent</td></tr>");
        }

        // Journal rows
        StringBuilder journalRows = new StringBuilder();
        List<Map<String, Object>> journalList = Helpers.listVal(journalData, "entries");
        if (journalList.isEmpty()) journalList = Helpers.listVal(journalData, "journal");
        if (journalList.isEmpty()) journalList = Helpers.listVal(journalData, "items");
        for (var j : journalList) {
            String jJson = escapeJsonForAttr(j);
            String jTime = Helpers.strVal(j, "timestamp");
            if (jTime.isEmpty()) jTime = Helpers.strVal(j, "createdAt");
            if (jTime.isEmpty()) jTime = Helpers.strVal(j, "created_at");
            String jTool = Helpers.strVal(j, "tool");
            if (jTool.isEmpty()) jTool = Helpers.strVal(j, "toolName");
            if (jTool.isEmpty()) jTool = Helpers.strVal(j, "tool_name");
            String jAction = Helpers.strVal(j, "action");
            if (jAction.isEmpty()) jAction = Helpers.strVal(j, "actionType");
            if (jAction.isEmpty()) jAction = Helpers.strVal(j, "action_type");
            boolean jReversible = Boolean.TRUE.equals(j.get("reversible"));
            boolean jReversed = Boolean.TRUE.equals(j.get("reversed"));
            String reversibleBadge = jReversible
                ? "<span class='badge' style='background:#10b981;color:#fff;font-size:11px'>Yes</span>"
                : "<span class='badge' style='background:#64748b;color:#fff;font-size:11px'>No</span>";
            String jStatus = Helpers.strVal(j, "status");
            if (jStatus.isEmpty()) jStatus = "completed";
            String jId = Helpers.strVal(j, "id");
            String actionsCol = "";
            if (jReversible && !jReversed) {
                actionsCol = "<button class='btn btn-sm' style='font-size:11px' onclick=\"event.stopPropagation();rollbackJournal('" + Helpers.esc(jId) + "')\">&#8617; Rollback</button>";
            }
            journalRows.append("<tr style='cursor:pointer' onclick=\"showActivityDetail('")
                .append(jJson).append("','Journal Detail')\">");
            journalRows.append("<td style='white-space:nowrap;font-size:12px;color:var(--text-secondary)'>").append(Helpers.esc(jTime)).append("</td>");
            journalRows.append("<td><code style='font-size:12px'>").append(Helpers.esc(jTool)).append("</code></td>");
            journalRows.append("<td style='font-size:13px'>").append(Helpers.esc(jAction)).append("</td>");
            journalRows.append("<td>").append(reversibleBadge).append("</td>");
            journalRows.append("<td>").append(Components.statusBadge(jStatus)).append("</td>");
            journalRows.append("<td>").append(actionsCol).append("</td>");
            journalRows.append("</tr>");
        }
        if (journalRows.length() == 0) {
            journalRows.append("<tr><td colspan='6' style='text-align:center;padding:24px;color:var(--text-secondary)'>No journal entries for this agent</td></tr>");
        }

        // Build activity card
        html.append(Components.cardStart("Activity"));
        html.append("<div style='border-bottom:1px solid var(--border)'>");
        html.append("<div class='tabs' style='padding:0 16px'>");
        html.append("<div class='tab active' data-activity-tab='events' onclick=\"switchActivityTab('events')\">Events</div>");
        html.append("<div class='tab' data-activity-tab='tools' onclick=\"switchActivityTab('tools')\">Tool Calls</div>");
        html.append("<div class='tab' data-activity-tab='journal' onclick=\"switchActivityTab('journal')\">Journal</div>");
        html.append("</div></div>");

        html.append("<div id='panel-events' class='activity-panel'>");
        html.append("<table><thead><tr><th>Time</th><th>Type</th><th>Details</th></tr></thead><tbody>");
        html.append(eventsRows);
        html.append("</tbody></table></div>");

        html.append("<div id='panel-tools' class='activity-panel' style='display:none'>");
        html.append("<table><thead><tr><th>Time</th><th>Tool</th><th>Duration</th><th>Status</th></tr></thead><tbody>");
        html.append(toolCallsRows);
        html.append("</tbody></table></div>");

        html.append("<div id='panel-journal' class='activity-panel' style='display:none'>");
        html.append("<table><thead><tr><th>Time</th><th>Tool</th><th>Action</th><th>Reversible</th><th>Status</th><th>Actions</th></tr></thead><tbody>");
        html.append(journalRows);
        html.append("</tbody></table></div>");
        html.append(Components.cardEnd());

        // Detail modal
        html.append("<div id='activity-detail-modal' style='display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center' onclick='if(event.target===this)closeActivityModal()'>");
        html.append("<div style='background:var(--card-bg,#fff);border-radius:12px;width:560px;max-height:80vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)'>");
        html.append("<div style='display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border)'>");
        html.append("<h2 id='activity-modal-title' style='margin:0;font-size:16px'>Detail</h2>");
        html.append("<button class='btn btn-sm' onclick='closeActivityModal()' style='border:none;font-size:18px;cursor:pointer'>&times;</button>");
        html.append("</div>");
        html.append("<div style='padding:20px'>");
        html.append("<div id='activity-modal-badge' style='margin-bottom:12px'></div>");
        html.append("<div id='activity-modal-body' style='display:grid;grid-template-columns:140px 1fr;gap:12px 16px;align-items:start'></div>");
        html.append("</div></div></div>");

        // Activity JavaScript
        html.append("<script>");
        html.append("function switchActivityTab(tab){document.querySelectorAll('.activity-panel').forEach(function(p){p.style.display='none'});document.querySelectorAll('[data-activity-tab]').forEach(function(t){t.classList.remove('active')});document.getElementById('panel-'+tab).style.display='block';document.querySelector('[data-activity-tab=\"'+tab+'\"]').classList.add('active')}");
        html.append("function showActivityDetail(jsonStr,title){var data=JSON.parse(jsonStr);var m=document.getElementById('activity-detail-modal');document.getElementById('activity-modal-title').textContent=title;var typeLabel=data.type||data.eventType||data.tool||data.toolName||data.actionType||'Detail';var typeColor=typeLabel==='error'?'var(--danger)':typeLabel==='deployed'||typeLabel==='started'?'var(--success)':typeLabel==='stopped'?'var(--warning)':'var(--accent)';document.getElementById('activity-modal-badge').innerHTML='<span class=\"badge\" style=\"background:'+typeColor+';color:#fff;font-size:11px\">'+typeLabel+'</span>';var html='';for(var key in data){if(key==='agentId')continue;var label=key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ');label=label.charAt(0).toUpperCase()+label.slice(1);var val=data[key];if(val===null||val===undefined||val==='')val='\\u2014';else if(typeof val==='object')val='<pre style=\"margin:0;font-size:11px;background:var(--bg-secondary);padding:6px;border-radius:4px;white-space:pre-wrap;max-height:150px;overflow:auto\">'+JSON.stringify(val,null,2)+'</pre>';else if(typeof val==='boolean')val='<span class=\"badge\" style=\"background:'+(val?'#10b981':'#64748b')+';color:#fff;font-size:11px\">'+(val?'Yes':'No')+'</span>';else if((key.toLowerCase().includes('at')||key.toLowerCase().includes('time')||key.toLowerCase().includes('date'))&&!isNaN(Date.parse(String(val))))val=new Date(val).toLocaleString();html+='<div style=\"font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em\">'+label+'</div><div style=\"font-size:13px;word-break:break-word\">'+val+'</div>'}document.getElementById('activity-modal-body').innerHTML=html;m.style.display='flex'}");
        html.append("function closeActivityModal(){document.getElementById('activity-detail-modal').style.display='none'}");
        html.append("function rollbackJournal(id){if(!confirm('Rollback this journal entry?'))return;fetch('/api/engine/journal/'+id+'/rollback',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(function(r){return r.json()}).then(function(d){if(d.success)location.reload();else alert('Failed: '+(d.error||'Unknown'))}).catch(function(e){alert(e.message)})}");
        html.append("</script>");

        String flash = SessionManager.consumeFlash(ex);
        SessionManager.respond(ex, 200, Layout.layout("/agents", SessionManager.getUser(ex), flash, html.toString()));
    }

    // ─── Tool Security Helpers ─────────────────────────────

    private String enabledBadge(Map<String, Object> m) {
        Object v = m.get("enabled");
        if (Boolean.TRUE.equals(v)) {
            return "<span style='display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:#10b98120;color:#10b981'>Enabled</span>";
        }
        return "<span style='display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:#64748b20;color:#64748b'>Disabled</span>";
    }

    // ─── JSON escaping for HTML attributes ───────────────

    @SuppressWarnings("unchecked")
    private String escapeJsonForAttr(Map<String, Object> map) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (var entry : map.entrySet()) {
            if (!first) sb.append(",");
            first = false;
            sb.append("\"").append(escJsonKey(entry.getKey())).append("\":");
            appendJsonValue(sb, entry.getValue());
        }
        sb.append("}");
        return Helpers.esc(sb.toString());
    }

    @SuppressWarnings("unchecked")
    private void appendJsonValue(StringBuilder sb, Object v) {
        if (v == null) {
            sb.append("null");
        } else if (v instanceof Number) {
            sb.append(v);
        } else if (v instanceof Boolean) {
            sb.append(v);
        } else if (v instanceof Map) {
            sb.append("{");
            boolean f = true;
            for (var e : ((Map<String, Object>) v).entrySet()) {
                if (!f) sb.append(",");
                f = false;
                sb.append("\"").append(escJsonKey(e.getKey())).append("\":");
                appendJsonValue(sb, e.getValue());
            }
            sb.append("}");
        } else if (v instanceof List) {
            sb.append("[");
            boolean f = true;
            for (Object item : (List<?>) v) {
                if (!f) sb.append(",");
                f = false;
                appendJsonValue(sb, item);
            }
            sb.append("]");
        } else {
            sb.append("\"").append(escJsonKey(v.toString())).append("\"");
        }
    }

    private String escJsonKey(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
    }
}
