package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleGuardrails handles the guardrails page (GET) with interventions and rules,
// and POST actions for pause, resume, kill, create_rule, and delete_rule.
func HandleGuardrails(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	if r.Method == "POST" {
		r.ParseForm()
		action := r.FormValue("action")
		switch action {
		case "pause":
			services.APICall("/engine/guardrails/pause/"+r.FormValue("id"), "POST", s.Token, nil)
		case "resume":
			services.APICall("/engine/guardrails/resume/"+r.FormValue("id"), "POST", s.Token, nil)
		case "kill":
			services.APICall("/engine/guardrails/kill/"+r.FormValue("id"), "POST", s.Token, nil)
		case "create_rule":
			services.APICall("/engine/anomaly-rules", "POST", s.Token, map[string]string{
				"name": r.FormValue("name"), "condition": r.FormValue("condition"),
				"action": r.FormValue("rule_action"),
			})
		case "delete_rule":
			services.APICall("/engine/anomaly-rules/"+r.FormValue("id"), "DELETE", s.Token, nil)
		}
		http.Redirect(w, r, "/guardrails", http.StatusFound)
		return
	}

	interventions, _ := services.APICall("/engine/guardrails/interventions", "GET", s.Token, nil)
	rulesData, _ := services.APICall("/engine/anomaly-rules", "GET", s.Token, nil)

	var interventionsHTML string
	if iList, ok := interventions["interventions"].([]interface{}); ok && len(iList) > 0 {
		rows := ""
		for _, iv := range iList {
			i := iv.(map[string]interface{})
			actions := fmt.Sprintf(`<form method="POST" action="/guardrails" style="display:inline-flex;gap:4px"><input type="hidden" name="id" value="%s">`, templates.Esc(i["id"]))
			status := templates.StrVal(i, "status")
			if status == "active" {
				actions += `<button class="btn btn-sm" type="submit" name="action" value="pause">Pause</button>`
				actions += `<button class="btn btn-sm btn-d" type="submit" name="action" value="kill">Kill</button>`
			} else if status == "paused" {
				actions += `<button class="btn btn-sm" type="submit" name="action" value="resume">Resume</button>`
				actions += `<button class="btn btn-sm btn-d" type="submit" name="action" value="kill">Kill</button>`
			}
			actions += `</form>`
			rows += fmt.Sprintf(`<tr><td style="font-weight:600">%s</td><td style="color:var(--dim)">%s</td><td>%s</td><td style="font-size:12px;color:var(--muted)">%s</td><td>%s</td></tr>`,
				templates.Esc(i["agent"]), templates.Esc(i["reason"]), templates.Badge(status), templates.Esc(i["timestamp"]), actions)
		}
		interventionsHTML = `<table><thead><tr><th>Agent</th><th>Reason</th><th>Status</th><th>Time</th><th></th></tr></thead><tbody>` + rows + `</tbody></table>`
	} else {
		interventionsHTML = `<div class="empty"><div class="empty-i">🛡️</div>No active interventions</div>`
	}

	var rulesHTML string
	if ruleList, ok := rulesData["rules"].([]interface{}); ok && len(ruleList) > 0 {
		rows := ""
		for _, rl := range ruleList {
			ru := rl.(map[string]interface{})
			rows += fmt.Sprintf(`<tr><td style="font-weight:600">%s</td><td style="color:var(--dim)">%s</td><td>%s</td><td><form method="POST" action="/guardrails" style="display:inline"><input type="hidden" name="action" value="delete_rule"><input type="hidden" name="id" value="%s"><button class="btn btn-sm btn-d" type="submit">Delete</button></form></td></tr>`,
				templates.Esc(ru["name"]), templates.Esc(ru["condition"]), templates.Badge(templates.StrVal(ru, "action")), templates.Esc(ru["id"]))
		}
		rulesHTML = `<table><thead><tr><th>Name</th><th>Condition</th><th>Action</th><th></th></tr></thead><tbody>` + rows + `</tbody></table>`
	} else {
		rulesHTML = `<div class="empty"><div class="empty-i">📏</div>No anomaly rules yet</div>`
	}

	content := fmt.Sprintf(`<h2 class="t">Guardrails</h2><p class="desc">Monitor and control agent behavior</p>
<div class="card" style="margin-bottom:16px"><div class="ct">Create Anomaly Rule</div>
<form method="POST" action="/guardrails" style="display:flex;gap:10px;align-items:end">
<input type="hidden" name="action" value="create_rule">
<div class="fg" style="flex:1;margin:0"><label class="fl">Name</label><input class="input" name="name" required placeholder="e.g. Rate limit exceeded"></div>
<div class="fg" style="flex:1;margin:0"><label class="fl">Condition</label><input class="input" name="condition" required placeholder="e.g. messages > 100/min"></div>
<div class="fg" style="margin:0"><label class="fl">Action</label><select class="input" name="rule_action"><option>pause</option><option>alert</option><option>kill</option></select></div>
<button class="btn btn-p" type="submit">Create</button></form></div>
<div class="card" style="margin-bottom:16px"><div class="ct">Active Interventions</div>%s</div>
<div class="card"><div class="ct">Anomaly Rules</div>%s</div>`, interventionsHTML, rulesHTML)

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("guardrails", s.User, content))
}
