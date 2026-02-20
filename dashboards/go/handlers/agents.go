package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"strings"
)

// resolveAgentName returns the display name using the priority:
// identity.name > config.name > config.displayName > agent.name
func resolveAgentName(a map[string]interface{}) string {
	if identity, ok := a["identity"].(map[string]interface{}); ok {
		if v := templates.StrVal(identity, "name"); v != "" {
			return v
		}
	}
	if config, ok := a["config"].(map[string]interface{}); ok {
		if v := templates.StrVal(config, "name"); v != "" {
			return v
		}
		if v := templates.StrVal(config, "displayName"); v != "" {
			return v
		}
	}
	return templates.StrVal(a, "name")
}

// resolveAgentEmail returns the email using the priority:
// identity.email > config.email > agent.email, skipping UUIDs.
func resolveAgentEmail(a map[string]interface{}) string {
	if identity, ok := a["identity"].(map[string]interface{}); ok {
		if v := templates.StrVal(identity, "email"); v != "" && strings.Contains(v, "@") {
			return v
		}
	}
	if config, ok := a["config"].(map[string]interface{}); ok {
		if v := templates.StrVal(config, "email"); v != "" && strings.Contains(v, "@") {
			return v
		}
	}
	if v := templates.StrVal(a, "email"); v != "" && strings.Contains(v, "@") {
		return v
	}
	return ""
}

// resolveModel extracts a display-friendly model string. If config.model is a map,
// use its modelId or provider field instead of rendering the raw map.
func resolveModel(a map[string]interface{}) string {
	if config, ok := a["config"].(map[string]interface{}); ok {
		switch m := config["model"].(type) {
		case string:
			return m
		case map[string]interface{}:
			if v := templates.StrVal(m, "modelId"); v != "" {
				return v
			}
			if v := templates.StrVal(m, "provider"); v != "" {
				return v
			}
		}
	}
	return templates.StrVal(a, "model")
}

// HandleAgents handles the agents list page (GET), agent creation (POST),
// and agent archiving (POST to /agents/{id}/archive).
func HandleAgents(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	// Handle archive
	if strings.Contains(r.URL.Path, "/archive") {
		parts := strings.Split(r.URL.Path, "/")
		if len(parts) >= 3 {
			services.APICall("/api/agents/"+parts[2]+"/archive", "POST", s.Token, nil)
		}
		http.Redirect(w, r, "/agents", http.StatusFound)
		return
	}

	// Handle engine actions: deploy, stop, restart
	if strings.HasSuffix(r.URL.Path, "/deploy") || strings.HasSuffix(r.URL.Path, "/stop") || strings.HasSuffix(r.URL.Path, "/restart") {
		parts := strings.Split(r.URL.Path, "/")
		if len(parts) >= 3 {
			action := parts[len(parts)-1]
			services.APICall("/engine/agents/"+parts[2]+"/"+action, "POST", s.Token, nil)
		}
		http.Redirect(w, r, r.Header.Get("Referer"), http.StatusFound)
		return
	}

	// Agent detail page: GET /agents/{id} (no trailing segments)
	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) == 2 && pathParts[0] == "agents" && pathParts[1] != "" {
		handleAgentDetail(w, r, s, pathParts[1])
		return
	}

	// Handle create
	if r.Method == "POST" {
		r.ParseForm()
		provider := r.FormValue("provider")
		if provider == "" {
			provider = "anthropic"
		}
		model := r.FormValue("model")
		body := map[string]interface{}{
			"name":     r.FormValue("name"),
			"role":     r.FormValue("role"),
			"provider": provider,
			"model":    model,
			"persona": map[string]interface{}{
				"gender":             r.FormValue("gender"),
				"dateOfBirth":        r.FormValue("date_of_birth"),
				"maritalStatus":      r.FormValue("marital_status"),
				"culturalBackground": r.FormValue("cultural_background"),
				"language":           r.FormValue("language"),
				"traits": map[string]string{
					"communication": r.FormValue("trait_communication"),
					"detail":        r.FormValue("trait_detail"),
					"energy":        r.FormValue("trait_energy"),
					"humor":         r.FormValue("humor"),
					"formality":     r.FormValue("formality"),
					"empathy":       r.FormValue("empathy"),
					"patience":      r.FormValue("patience"),
					"creativity":    r.FormValue("creativity"),
				},
			},
		}
		if email := r.FormValue("email"); email != "" {
			body["email"] = email
		}
		if soulID := r.FormValue("soul_id"); soulID != "" {
			body["soul_id"] = soulID
		}
		services.APICall("/api/agents", "POST", s.Token, body)
		http.Redirect(w, r, "/agents", http.StatusFound)
		return
	}

	data, _ := services.APICall("/api/agents", "GET", s.Token, nil)
	var tableHTML string
	if agents, ok := data["agents"].([]interface{}); ok && len(agents) > 0 {
		rows := ""
		for _, ag := range agents {
			a := ag.(map[string]interface{})
			archiveBtn := ""
			if templates.StrVal(a, "status") == "active" {
				archiveBtn = fmt.Sprintf(`<a class="btn btn-sm btn-d" href="/agents/%s/archive">Archive</a>`, templates.Esc(a["id"]))
			}
			displayName := resolveAgentName(a)
			displayEmail := resolveAgentEmail(a)
			rows += fmt.Sprintf(`<tr><td style="font-weight:600"><a href="/agents/%s" style="color:var(--primary);text-decoration:none">%s</a></td><td style="color:var(--dim)">%s</td><td>%s</td><td>%s</td><td>%s</td></tr>`,
				templates.Esc(a["id"]), templates.Esc(displayName), templates.Esc(displayEmail), templates.Esc(a["role"]), templates.Badge(templates.StrVal(a, "status")), archiveBtn)
		}
		tableHTML = `<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>` + rows + `</tbody></table>`
	} else {
		tableHTML = `<div class="empty"><div class="empty-i">🤖</div>No agents yet</div>`
	}

	content := fmt.Sprintf(`<h2 class="t">Agents</h2><p class="desc">Manage AI agent identities</p>
<div class="card" style="margin-bottom:16px"><div class="ct">Create Agent</div>
<form method="POST" action="/agents" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
<div class="fg" style="flex:1;min-width:160px;margin:0"><label class="fl">Name</label><input class="input" name="name" required placeholder="e.g. researcher"></div>
<div class="fg" style="margin:0"><label class="fl">Provider</label><select class="input" name="provider" id="agent-provider"><option value="anthropic">Anthropic</option><option value="openai">OpenAI</option><option value="google">Google</option><option value="deepseek">DeepSeek</option><option value="xai">xAI (Grok)</option><option value="mistral">Mistral</option><option value="groq">Groq</option><option value="together">Together</option><option value="fireworks">Fireworks</option><option value="moonshot">Moonshot (Kimi)</option><option value="cerebras">Cerebras</option><option value="openrouter">OpenRouter</option><option value="ollama">Ollama (Local)</option><option value="vllm">vLLM (Local)</option><option value="lmstudio">LM Studio (Local)</option><option value="litellm">LiteLLM (Local)</option></select></div>
<div class="fg" style="margin:0"><label class="fl">Model</label><select class="input" name="model" id="agent-model"><option value="">Loading models...</option></select></div>
<div class="fg" style="margin:0"><label class="fl">Role</label><select class="input" name="role"><option>assistant</option><option>researcher</option><option>writer</option><option>secretary</option></select></div>
<div class="fg" style="margin:0"><label class="fl">Role Template</label><select class="input" name="soul_id">
<option value="">Custom (no template)</option>
<optgroup label="Support">
<option value="customer-support-lead">Customer Support Lead</option>
<option value="technical-support-engineer">Technical Support Engineer</option>
<option value="customer-success-manager">Customer Success Manager</option>
</optgroup>
<optgroup label="Sales">
<option value="sales-development-rep">Sales Development Rep</option>
<option value="account-executive">Account Executive</option>
</optgroup>
<optgroup label="Engineering">
<option value="senior-software-engineer">Senior Software Engineer</option>
<option value="devops-engineer">DevOps Engineer</option>
<option value="qa-engineer">QA Engineer</option>
</optgroup>
<optgroup label="Operations">
<option value="executive-assistant">Executive Assistant</option>
<option value="project-coordinator">Project Coordinator</option>
</optgroup>
<optgroup label="Marketing">
<option value="content-writer">Content Writer</option>
<option value="social-media-manager">Social Media Manager</option>
</optgroup>
<optgroup label="Finance">
<option value="financial-controller">Financial Controller</option>
<option value="expense-auditor">Expense Auditor</option>
</optgroup>
<optgroup label="Legal">
<option value="legal-compliance-officer">Legal Compliance Officer</option>
<option value="contract-reviewer">Contract Reviewer</option>
</optgroup>
<optgroup label="Security">
<option value="security-analyst">Security Analyst</option>
<option value="compliance-auditor">Compliance Auditor</option>
</optgroup>
</select></div>
<fieldset class="persona-fieldset"><legend>Persona (optional)</legend>
<div class='form-row'><div class='form-group'><label>Date of Birth</label><input type='date' name='date_of_birth' id='date_of_birth'></div></div>
<div class="form-row"><div class="form-group"><label>Gender</label><select name="gender"><option value="">Not specified</option><option value="male">Male</option><option value="female">Female</option><option value="non-binary">Non-binary</option></select></div></div>
<div class="form-row"><div class="form-group"><label>Marital Status</label><select name="marital_status"><option value="">Not specified</option><option value="single">Single</option><option value="married">Married</option><option value="divorced">Divorced</option></select></div><div class="form-group"><label>Cultural Background</label><select name="cultural_background"><option value="">Not specified</option><option value="north-american">North American</option><option value="british-european">British / European</option><option value="latin-american">Latin American</option><option value="middle-eastern">Middle Eastern</option><option value="east-asian">East Asian</option><option value="south-asian">South Asian</option><option value="southeast-asian">Southeast Asian</option><option value="african">African</option><option value="caribbean">Caribbean</option><option value="australian-pacific">Australian / Pacific</option></select></div></div>
<div class="form-row"><div class="form-group"><label>Language</label><select name="language"><option value="en-us">English (American)</option><option value="en-gb">English (British)</option><option value="en-au">English (Australian)</option><option value="es">Spanish</option><option value="pt">Portuguese</option><option value="fr">French</option><option value="de">German</option><option value="ja">Japanese</option><option value="ko">Korean</option><option value="zh">Mandarin</option><option value="hi">Hindi</option><option value="ar">Arabic</option><option value='yo'>Yoruba</option><option value='ig'>Igbo</option><option value='sw'>Swahili</option><option value='it'>Italian</option><option value='nl'>Dutch</option><option value='ru'>Russian</option><option value='tr'>Turkish</option><option value='pl'>Polish</option><option value='th'>Thai</option><option value='vi'>Vietnamese</option><option value='id'>Indonesian</option><option value='ms'>Malay</option><option value='tl'>Filipino (Tagalog)</option></select></div><div class="form-group"><label>Communication Style</label><select name="trait_communication"><option value="direct">Direct</option><option value="diplomatic">Diplomatic</option></select></div></div>
<div class="form-row"><div class="form-group"><label>Detail Level</label><select name="trait_detail"><option value="detail-oriented">Detail-oriented</option><option value="big-picture">Big-picture</option></select></div><div class="form-group"><label>Energy</label><select name="trait_energy"><option value="calm">Calm &amp; measured</option><option value="enthusiastic">Enthusiastic</option></select></div></div>
<div class='form-group'><label>Humor</label><select name='humor' id='humor'><option value='witty'>Witty</option><option value='dry'>Dry</option><option value='warm' selected>Warm</option><option value='none'>None</option></select></div>
<div class='form-group'><label>Formality</label><select name='formality' id='formality'><option value='formal'>Formal</option><option value='casual'>Casual</option><option value='adaptive' selected>Adaptive</option></select></div>
<div class='form-group'><label>Empathy</label><select name='empathy' id='empathy'><option value='high'>High</option><option value='moderate' selected>Moderate</option><option value='reserved'>Reserved</option></select></div>
<div class='form-group'><label>Patience</label><select name='patience' id='patience'><option value='patient' selected>Patient</option><option value='efficient'>Efficient</option></select></div>
<div class='form-group'><label>Creativity</label><select name='creativity' id='creativity'><option value='creative' selected>Creative</option><option value='conventional'>Conventional</option></select></div>
</fieldset>
<button class="btn btn-p" type="submit">Create</button></form></div>
<script>
function loadModels(provider){var sel=document.getElementById('agent-model');if(!sel)return;fetch('/api/providers/'+provider+'/models').then(function(r){return r.json()}).then(function(d){sel.innerHTML='';(d.models||[]).forEach(function(m){var o=document.createElement('option');o.value=m.id;o.textContent=m.name||m.id;sel.appendChild(o)});var c=document.createElement('option');c.value='custom';c.textContent='Custom (enter manually)';sel.appendChild(c)}).catch(function(){sel.innerHTML='<option value="">Type model ID</option>'})}
var provSel=document.getElementById('agent-provider');if(provSel){provSel.addEventListener('change',function(){loadModels(this.value)});loadModels(provSel.value||'anthropic')}
</script>
<div class="card">%s</div>`, tableHTML)

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("agents", s.User, content))
}

// handleAgentDetail renders the agent detail page for GET /agents/{id}.
func handleAgentDetail(w http.ResponseWriter, r *http.Request, s *services.Session, id string) {
	data, _ := services.APICall("/api/agents/"+id, "GET", s.Token, nil)
	if data == nil {
		http.Redirect(w, r, "/agents", http.StatusFound)
		return
	}

	// The API may return the agent at top level or nested under "agent"
	a := data
	if agent, ok := data["agent"].(map[string]interface{}); ok {
		a = agent
	}

	displayName := resolveAgentName(a)
	if displayName == "" {
		displayName = "Unnamed Agent"
	}
	email := resolveAgentEmail(a)
	status := templates.StrVal(a, "status")
	if status == "" {
		status = "active"
	}
	role := templates.StrVal(a, "role")
	if role == "" {
		role = "agent"
	}
	model := resolveModel(a)
	if model == "" {
		model = "-"
	}
	created := templates.StrVal(a, "created_at")
	description := templates.StrVal(a, "description")

	// Avatar initial
	initial := strings.ToUpper(string([]rune(displayName)[0]))

	// Persona / config
	persona := map[string]interface{}{}
	if p, ok := a["persona"].(map[string]interface{}); ok {
		persona = p
	}
	config := map[string]interface{}{}
	if c, ok := a["config"].(map[string]interface{}); ok {
		config = c
	}

	// Build header
	content := fmt.Sprintf(`<div style="margin-bottom:24px"><a href="/agents" style="color:var(--primary);text-decoration:none;font-size:13px">&larr; Back to Agents</a></div>
<div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
<div style="width:56px;height:56px;border-radius:50%%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700">%s</div>
<div><h2 class="t" style="margin-bottom:4px">%s</h2>
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">%s %s`,
		templates.Esc(initial), templates.Esc(displayName), templates.Badge(status), templates.Badge(role))

	if email != "" {
		content += fmt.Sprintf(` <span style="color:var(--dim);font-size:13px">%s</span>`, templates.Esc(email))
	}
	content += `</div></div></div>`

	// Summary card
	content += fmt.Sprintf(`<div class="card" style="margin-bottom:16px"><div class="ct">Summary</div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px">
<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Status</div><div style="margin-top:4px">%s</div></div>
<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Role</div><div style="margin-top:4px">%s</div></div>
<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Model</div><div style="margin-top:4px"><code>%s</code></div></div>
<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Created</div><div style="margin-top:4px;font-size:13px;color:var(--dim)">%s</div></div>
</div></div>`,
		templates.Badge(status), templates.Badge(role), templates.Esc(model), templates.Esc(created))

	// Description
	if description != "" {
		content += fmt.Sprintf(`<div class="card" style="margin-bottom:16px"><div class="ct">Description</div><p style="font-size:14px;color:var(--dim);line-height:1.6">%s</p></div>`, templates.Esc(description))
	}

	// Personality traits
	traits := map[string]interface{}{}
	if t, ok := persona["traits"].(map[string]interface{}); ok {
		traits = t
	} else if t, ok := config["traits"].(map[string]interface{}); ok {
		traits = t
	}
	if len(traits) > 0 {
		chips := ""
		for k, v := range traits {
			val := fmt.Sprintf("%v", v)
			if val != "" {
				chips += fmt.Sprintf(`<span style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;background:var(--border);color:var(--text);margin:3px">%s: %s</span>`, templates.Esc(k), templates.Esc(val))
			}
		}
		if chips != "" {
			content += fmt.Sprintf(`<div class="card" style="margin-bottom:16px"><div class="ct">Personality Traits</div><div style="display:flex;flex-wrap:wrap;gap:4px">%s</div></div>`, chips)
		}
	}

	// Actions
	agentID := templates.StrVal(a, "id")
	content += fmt.Sprintf(`<div class="card" style="margin-bottom:16px"><div class="ct">Actions</div>
<div style="display:flex;gap:8px;flex-wrap:wrap">
<form method="POST" action="/agents/%s/deploy" style="display:inline"><button class="btn btn-p btn-sm" type="submit">Deploy</button></form>
<form method="POST" action="/agents/%s/stop" style="display:inline"><button class="btn btn-sm" type="submit" style="border-color:var(--warning);color:var(--warning)">Stop</button></form>
<form method="POST" action="/agents/%s/restart" style="display:inline"><button class="btn btn-sm" type="submit">Restart</button></form>
</div></div>`, templates.Esc(agentID), templates.Esc(agentID), templates.Esc(agentID))

	// Personal details
	gender := templates.StrVal(persona, "gender")
	dob := templates.StrVal(persona, "dateOfBirth")
	marital := templates.StrVal(persona, "maritalStatus")
	cultural := templates.StrVal(persona, "culturalBackground")
	language := templates.StrVal(persona, "language")
	hasPersonal := gender != "" || dob != "" || marital != "" || cultural != "" || language != ""
	if hasPersonal {
		content += `<div class="card" style="margin-bottom:16px"><div class="ct">Personal Details</div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px">`
		if gender != "" {
			content += fmt.Sprintf(`<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Gender</div><div style="margin-top:4px;font-size:14px">%s</div></div>`, templates.Esc(gender))
		}
		if dob != "" {
			content += fmt.Sprintf(`<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Date of Birth</div><div style="margin-top:4px;font-size:14px">%s</div></div>`, templates.Esc(dob))
		}
		if marital != "" {
			content += fmt.Sprintf(`<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Marital Status</div><div style="margin-top:4px;font-size:14px">%s</div></div>`, templates.Esc(marital))
		}
		if cultural != "" {
			content += fmt.Sprintf(`<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Cultural Background</div><div style="margin-top:4px;font-size:14px">%s</div></div>`, templates.Esc(cultural))
		}
		if language != "" {
			content += fmt.Sprintf(`<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Language</div><div style="margin-top:4px;font-size:14px">%s</div></div>`, templates.Esc(language))
		}
		content += `</div></div>`
	}

	// Permission profile
	permissions := map[string]interface{}{}
	if p, ok := a["permissions"].(map[string]interface{}); ok {
		permissions = p
	} else if p, ok := config["permissions"].(map[string]interface{}); ok {
		permissions = p
	}
	if len(permissions) > 0 {
		// Profile Name
		profileName := templates.StrVal(permissions, "name")
		if profileName == "" {
			profileName = templates.StrVal(permissions, "preset")
		}
		if profileName == "" {
			profileName = "Custom"
		}

		// Max Risk Level
		maxRisk := templates.StrVal(permissions, "maxRiskLevel")
		if maxRisk == "" {
			maxRisk = templates.StrVal(permissions, "max_risk_level")
		}
		riskColor := "#64748b"
		switch maxRisk {
		case "low":
			riskColor = "#10b981"
		case "medium":
			riskColor = "#f59e0b"
		case "high", "critical":
			riskColor = "#ef4444"
		}
		riskBadge := ""
		if maxRisk != "" {
			riskBadge = fmt.Sprintf(`<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:%s20;color:%s">%s</span>`, riskColor, riskColor, templates.Esc(maxRisk))
		} else {
			riskBadge = `<span style="color:var(--dim)">-</span>`
		}

		// Sandbox Mode
		sandboxMode := "Disabled"
		if sb, ok := permissions["sandboxMode"]; ok {
			if sb == true {
				sandboxMode = "Enabled"
			}
		} else if sb, ok := permissions["sandbox_mode"]; ok {
			if sb == true {
				sandboxMode = "Enabled"
			}
		}

		// Rate Limits
		rateLimits := ""
		rl := map[string]interface{}{}
		if r, ok := permissions["rateLimits"].(map[string]interface{}); ok {
			rl = r
		} else if r, ok := permissions["rate_limits"].(map[string]interface{}); ok {
			rl = r
		}
		cpm := templates.StrVal(rl, "toolCallsPerMinute")
		if cpm == "" {
			cpm = templates.StrVal(rl, "calls_per_minute")
		}
		cph := templates.StrVal(rl, "toolCallsPerHour")
		if cph == "" {
			cph = templates.StrVal(rl, "calls_per_hour")
		}
		if cpm != "" || cph != "" {
			if cpm != "" {
				rateLimits += fmt.Sprintf(`%s/min`, templates.Esc(cpm))
			}
			if cph != "" {
				if rateLimits != "" {
					rateLimits += ", "
				}
				rateLimits += fmt.Sprintf(`%s/hr`, templates.Esc(cph))
			}
		} else {
			rateLimits = "None set"
		}

		// Blocked Side Effects
		blockedHTML := ""
		if bse, ok := permissions["blockedSideEffects"].([]interface{}); ok && len(bse) > 0 {
			for _, effect := range bse {
				blockedHTML += fmt.Sprintf(`<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:#ef4444;color:#fff;margin:2px">%s</span>`, templates.Esc(effect))
			}
		} else if bse, ok := permissions["blocked_side_effects"].([]interface{}); ok && len(bse) > 0 {
			for _, effect := range bse {
				blockedHTML += fmt.Sprintf(`<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:#ef4444;color:#fff;margin:2px">%s</span>`, templates.Esc(effect))
			}
		}
		if blockedHTML == "" {
			blockedHTML = `<span style="color:var(--dim)">None</span>`
		}

		content += fmt.Sprintf(`<div class="card" style="margin-bottom:16px"><div class="ct">Permission Profile</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Profile Name</div><div style="margin-top:4px;font-size:14px">%s</div></div>
<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Max Risk Level</div><div style="margin-top:4px">%s</div></div>
<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Sandbox Mode</div><div style="margin-top:4px;font-size:14px">%s</div></div>
<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">Rate Limits</div><div style="margin-top:4px;font-size:14px">%s</div></div>
</div>
<div style="margin-top:16px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Blocked Side Effects</div><div style="display:flex;flex-wrap:wrap;gap:4px">%s</div></div>
</div>`, templates.Esc(profileName), riskBadge, templates.Esc(sandboxMode), rateLimits, blockedHTML)
	}

	// ── Tool Security Section ────────────────────────────
	tsData, _ := services.APICall("/engine/agents/"+id+"/tool-security", "GET", s.Token, nil)
	if tsData != nil {
		toolSec := map[string]interface{}{}
		if ts, ok := tsData["toolSecurity"].(map[string]interface{}); ok {
			toolSec = ts
		}
		orgDefaults := map[string]interface{}{}
		if od, ok := tsData["orgDefaults"].(map[string]interface{}); ok {
			orgDefaults = od
		}

		security := map[string]interface{}{}
		if sec, ok := toolSec["security"].(map[string]interface{}); ok {
			security = sec
		} else if sec, ok := orgDefaults["security"].(map[string]interface{}); ok {
			security = sec
		}
		mw := map[string]interface{}{}
		if m, ok := toolSec["middleware"].(map[string]interface{}); ok {
			mw = m
		} else if m, ok := orgDefaults["middleware"].(map[string]interface{}); ok {
			mw = m
		}

		enabledBadge := func(m map[string]interface{}, key string) string {
			if v, ok := m[key].(bool); ok && v {
				return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:#10b98120;color:#10b981">Enabled</span>`
			}
			return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:#64748b20;color:#64748b">Disabled</span>`
		}

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
		auditMw := map[string]interface{}{}
		if a, ok := mw["audit"].(map[string]interface{}); ok {
			auditMw = a
		}
		rateLimitMw := map[string]interface{}{}
		if rl, ok := mw["rateLimit"].(map[string]interface{}); ok {
			rateLimitMw = rl
		}
		cbMw := map[string]interface{}{}
		if cb, ok := mw["circuitBreaker"].(map[string]interface{}); ok {
			cbMw = cb
		}
		telMw := map[string]interface{}{}
		if t, ok := mw["telemetry"].(map[string]interface{}); ok {
			telMw = t
		}

		cmdMode := templates.StrVal(cmdSanitizer, "mode")
		if cmdMode == "" {
			cmdMode = "blocklist"
		}

		content += fmt.Sprintf(`<div class="card" style="margin-bottom:16px"><div class="ct">Tool Security</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px">
<div style="padding:12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong style="font-size:13px">Path Sandbox</strong>%s</div>
<div style="font-size:12px;color:var(--dim)">Restricts file system access</div>
</div>
<div style="padding:12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong style="font-size:13px">SSRF Protection</strong>%s</div>
<div style="font-size:12px;color:var(--dim)">Prevents server-side request forgery</div>
</div>
<div style="padding:12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong style="font-size:13px">Command Sanitizer</strong>%s</div>
<div style="font-size:12px;color:var(--dim)">Mode: %s</div>
</div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:16px">
<div style="padding:12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:13px">Audit</strong>%s</div>
</div>
<div style="padding:12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:13px">Rate Limit</strong>%s</div>
</div>
<div style="padding:12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:13px">Circuit Breaker</strong>%s</div>
</div>
<div style="padding:12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
<div style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:13px">Telemetry</strong>%s</div>
</div>
</div>
</div>`,
			enabledBadge(pathSandbox, "enabled"),
			enabledBadge(ssrf, "enabled"),
			enabledBadge(cmdSanitizer, "enabled"),
			templates.Esc(cmdMode),
			enabledBadge(auditMw, "enabled"),
			enabledBadge(rateLimitMw, "enabled"),
			enabledBadge(cbMw, "enabled"),
			enabledBadge(telMw, "enabled"),
		)
	}

	// ── Activity Section ─────────────────────────────────
	// Fetch events, tool calls, and journal entries (failures are non-fatal)
	eventsData, _ := services.APICall("/engine/activity/events?agentId="+id+"&limit=50", "GET", s.Token, nil)
	toolCallsData, _ := services.APICall("/engine/activity/tool-calls?agentId="+id+"&limit=50", "GET", s.Token, nil)
	journalData, _ := services.APICall("/engine/journal?agentId="+id+"&orgId=default&limit=50", "GET", s.Token, nil)

	// Events rows
	eventsRows := ""
	if eventsData != nil {
		var eventsList []interface{}
		if ev, ok := eventsData["events"].([]interface{}); ok {
			eventsList = ev
		} else if ev, ok := eventsData["items"].([]interface{}); ok {
			eventsList = ev
		}
		if len(eventsList) > 0 {
			for _, item := range eventsList {
				if e, ok := item.(map[string]interface{}); ok {
					jsonBytes, _ := json.Marshal(e)
					jsonStr := html.EscapeString(string(jsonBytes))
					evTime := templates.StrVal(e, "timestamp")
					if evTime == "" {
						evTime = templates.StrVal(e, "createdAt")
					}
					if evTime == "" {
						evTime = templates.StrVal(e, "created_at")
					}
					evType := templates.StrVal(e, "type")
					if evType == "" {
						evType = templates.StrVal(e, "eventType")
					}
					evDetails := templates.StrVal(e, "description")
					if evDetails == "" {
						evDetails = templates.StrVal(e, "message")
					}
					if evDetails == "" {
						evDetails = templates.StrVal(e, "details")
					}
					eventsRows += fmt.Sprintf(`<tr style="cursor:pointer" onclick="showActivityDetail('%s','Event Detail')"><td style="white-space:nowrap;font-size:12px;color:var(--dim)">%s</td><td>%s</td><td style="font-size:13px;color:var(--dim)">%s</td></tr>`,
						jsonStr, templates.Esc(evTime), templates.Badge(evType), templates.Esc(evDetails))
				}
			}
		}
	}
	if eventsRows == "" {
		eventsRows = `<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--dim)">No events for this agent</td></tr>`
	}

	// Tool calls rows
	toolCallsRows := ""
	if toolCallsData != nil {
		var toolsList []interface{}
		if tc, ok := toolCallsData["toolCalls"].([]interface{}); ok {
			toolsList = tc
		} else if tc, ok := toolCallsData["tool_calls"].([]interface{}); ok {
			toolsList = tc
		} else if tc, ok := toolCallsData["items"].([]interface{}); ok {
			toolsList = tc
		}
		if len(toolsList) > 0 {
			for _, item := range toolsList {
				if t, ok := item.(map[string]interface{}); ok {
					jsonBytes, _ := json.Marshal(t)
					jsonStr := html.EscapeString(string(jsonBytes))
					tcTime := templates.StrVal(t, "timestamp")
					if tcTime == "" {
						tcTime = templates.StrVal(t, "createdAt")
					}
					if tcTime == "" {
						tcTime = templates.StrVal(t, "created_at")
					}
					tcTool := templates.StrVal(t, "tool")
					if tcTool == "" {
						tcTool = templates.StrVal(t, "toolName")
					}
					if tcTool == "" {
						tcTool = templates.StrVal(t, "tool_name")
					}
					tcDuration := templates.StrVal(t, "duration")
					if tcDuration == "" {
						tcDuration = templates.StrVal(t, "durationMs")
					}
					if tcDuration != "" {
						tcDuration += "ms"
					} else {
						tcDuration = "-"
					}
					tcStatus := templates.StrVal(t, "status")
					if tcStatus == "" {
						tcStatus = templates.StrVal(t, "result")
					}
					if tcStatus == "" {
						tcStatus = "unknown"
					}
					toolCallsRows += fmt.Sprintf(`<tr style="cursor:pointer" onclick="showActivityDetail('%s','Tool Call Detail')"><td style="white-space:nowrap;font-size:12px;color:var(--dim)">%s</td><td><code style="font-size:12px">%s</code></td><td style="font-size:13px;color:var(--dim)">%s</td><td>%s</td></tr>`,
						jsonStr, templates.Esc(tcTime), templates.Esc(tcTool), templates.Esc(tcDuration), templates.Badge(tcStatus))
				}
			}
		}
	}
	if toolCallsRows == "" {
		toolCallsRows = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--dim)">No tool calls for this agent</td></tr>`
	}

	// Journal rows
	journalRows := ""
	if journalData != nil {
		var journalList []interface{}
		if j, ok := journalData["entries"].([]interface{}); ok {
			journalList = j
		} else if j, ok := journalData["journal"].([]interface{}); ok {
			journalList = j
		} else if j, ok := journalData["items"].([]interface{}); ok {
			journalList = j
		}
		if len(journalList) > 0 {
			for _, item := range journalList {
				if j, ok := item.(map[string]interface{}); ok {
					jsonBytes, _ := json.Marshal(j)
					jsonStr := html.EscapeString(string(jsonBytes))
					jTime := templates.StrVal(j, "timestamp")
					if jTime == "" {
						jTime = templates.StrVal(j, "createdAt")
					}
					if jTime == "" {
						jTime = templates.StrVal(j, "created_at")
					}
					jTool := templates.StrVal(j, "tool")
					if jTool == "" {
						jTool = templates.StrVal(j, "toolName")
					}
					if jTool == "" {
						jTool = templates.StrVal(j, "tool_name")
					}
					jAction := templates.StrVal(j, "action")
					if jAction == "" {
						jAction = templates.StrVal(j, "actionType")
					}
					if jAction == "" {
						jAction = templates.StrVal(j, "action_type")
					}
					jReversible := j["reversible"] == true
					jReversed := j["reversed"] == true
					reversibleBadge := `<span class="badge" style="background:var(--dim);color:#fff;font-size:11px">No</span>`
					if jReversible {
						reversibleBadge = `<span class="badge" style="background:#10b981;color:#fff;font-size:11px">Yes</span>`
					}
					jStatus := templates.StrVal(j, "status")
					if jStatus == "" {
						jStatus = "completed"
					}
					jID := templates.StrVal(j, "id")
					actionsCol := ""
					if jReversible && !jReversed {
						actionsCol = fmt.Sprintf(`<button class="btn btn-sm" style="font-size:11px" onclick="event.stopPropagation();rollbackJournal('%s')">&#8617; Rollback</button>`, templates.Esc(jID))
					}
					journalRows += fmt.Sprintf(`<tr style="cursor:pointer" onclick="showActivityDetail('%s','Journal Detail')"><td style="white-space:nowrap;font-size:12px;color:var(--dim)">%s</td><td><code style="font-size:12px">%s</code></td><td style="font-size:13px">%s</td><td>%s</td><td>%s</td><td>%s</td></tr>`,
						jsonStr, templates.Esc(jTime), templates.Esc(jTool), templates.Esc(jAction), reversibleBadge, templates.Badge(jStatus), actionsCol)
				}
			}
		}
	}
	if journalRows == "" {
		journalRows = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--dim)">No journal entries for this agent</td></tr>`
	}

	// Build the activity card
	content += fmt.Sprintf(`<div class="card" style="margin-bottom:16px">
<div class="ct">Activity</div>
<div style="border-bottom:1px solid var(--border)">
<div class="tabs" style="padding:0 16px">
<div class="tab active" data-activity-tab="events" onclick="switchActivityTab('events')">Events</div>
<div class="tab" data-activity-tab="tools" onclick="switchActivityTab('tools')">Tool Calls</div>
<div class="tab" data-activity-tab="journal" onclick="switchActivityTab('journal')">Journal</div>
</div>
</div>
<div>
<div id="panel-events" class="activity-panel">
<table><thead><tr><th>Time</th><th>Type</th><th>Details</th></tr></thead><tbody>%s</tbody></table>
</div>
<div id="panel-tools" class="activity-panel" style="display:none">
<table><thead><tr><th>Time</th><th>Tool</th><th>Duration</th><th>Status</th></tr></thead><tbody>%s</tbody></table>
</div>
<div id="panel-journal" class="activity-panel" style="display:none">
<table><thead><tr><th>Time</th><th>Tool</th><th>Action</th><th>Reversible</th><th>Status</th><th>Actions</th></tr></thead><tbody>%s</tbody></table>
</div>
</div>
</div>`, eventsRows, toolCallsRows, journalRows)

	// Detail modal
	content += `<div id="activity-detail-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center" onclick="if(event.target===this)closeActivityModal()">
<div style="background:var(--card-bg,#fff);border-radius:12px;width:560px;max-height:80vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border)">
<h2 id="activity-modal-title" style="margin:0;font-size:16px">Detail</h2>
<button class="btn btn-sm" onclick="closeActivityModal()" style="border:none;font-size:18px;cursor:pointer">&times;</button>
</div>
<div style="padding:20px">
<div id="activity-modal-badge" style="margin-bottom:12px"></div>
<div id="activity-modal-body" style="display:grid;grid-template-columns:140px 1fr;gap:12px 16px;align-items:start"></div>
</div>
</div>
</div>`

	// Activity JavaScript
	content += `<script>
function switchActivityTab(tab){document.querySelectorAll('.activity-panel').forEach(function(p){p.style.display='none'});document.querySelectorAll('[data-activity-tab]').forEach(function(t){t.classList.remove('active')});document.getElementById('panel-'+tab).style.display='block';document.querySelector('[data-activity-tab="'+tab+'"]').classList.add('active')}
function showActivityDetail(jsonStr,title){var data=JSON.parse(jsonStr);var m=document.getElementById('activity-detail-modal');document.getElementById('activity-modal-title').textContent=title;var typeLabel=data.type||data.eventType||data.tool||data.toolName||data.actionType||'Detail';var typeColor=typeLabel==='error'?'var(--danger)':typeLabel==='deployed'||typeLabel==='started'?'var(--success)':typeLabel==='stopped'?'var(--warning)':'var(--accent)';document.getElementById('activity-modal-badge').innerHTML='<span class="badge" style="background:'+typeColor+';color:#fff;font-size:11px">'+typeLabel+'</span>';var html='';for(var key in data){if(key==='agentId')continue;var label=key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ');label=label.charAt(0).toUpperCase()+label.slice(1);var val=data[key];if(val===null||val===undefined||val==='')val='\u2014';else if(typeof val==='object')val='<pre style="margin:0;font-size:11px;background:var(--bg-secondary);padding:6px;border-radius:4px;white-space:pre-wrap;max-height:150px;overflow:auto">'+JSON.stringify(val,null,2)+'</pre>';else if(typeof val==='boolean')val='<span class="badge" style="background:'+(val?'#10b981':'#64748b')+';color:#fff;font-size:11px">'+(val?'Yes':'No')+'</span>';else if((key.toLowerCase().includes('at')||key.toLowerCase().includes('time')||key.toLowerCase().includes('date'))&&!isNaN(Date.parse(String(val))))val=new Date(val).toLocaleString();html+='<div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">'+label+'</div><div style="font-size:13px;word-break:break-word">'+val+'</div>'}document.getElementById('activity-modal-body').innerHTML=html;m.style.display='flex'}
function closeActivityModal(){document.getElementById('activity-detail-modal').style.display='none'}
function rollbackJournal(id){if(!confirm('Rollback this journal entry?'))return;fetch('/api/engine/journal/'+id+'/rollback',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(function(r){return r.json()}).then(function(d){if(d.success)location.reload();else alert('Failed: '+(d.error||'Unknown'))}).catch(function(e){alert(e.message)})}
</script>`

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("agents", s.User, content))
}
