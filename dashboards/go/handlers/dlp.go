package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleDlp handles the DLP rules and violations page (GET), and rule creation,
// rule deletion, and scan triggering (POST).
func HandleDlp(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	if r.Method == "POST" {
		r.ParseForm()
		action := r.FormValue("action")
		switch action {
		case "create_rule":
			services.APICall("/engine/dlp/rules", "POST", s.Token, map[string]string{
				"name": r.FormValue("name"), "pattern": r.FormValue("pattern"),
				"severity": r.FormValue("severity"),
			})
		case "delete_rule":
			services.APICall("/engine/dlp/rules/"+r.FormValue("id"), "DELETE", s.Token, nil)
		case "scan":
			services.APICall("/engine/dlp/scan", "POST", s.Token, map[string]string{
				"orgId": "default",
			})
		}
		http.Redirect(w, r, "/dlp", http.StatusFound)
		return
	}

	rules, _ := services.APICall("/engine/dlp/rules?orgId=default", "GET", s.Token, nil)
	violations, _ := services.APICall("/engine/dlp/violations", "GET", s.Token, nil)

	var rulesHTML string
	if ruleList, ok := rules["rules"].([]interface{}); ok && len(ruleList) > 0 {
		rows := ""
		for _, rl := range ruleList {
			ru := rl.(map[string]interface{})
			rows += fmt.Sprintf(`<tr><td style="font-weight:600">%s</td><td><code style="font-size:12px">%s</code></td><td>%s</td><td><form method="POST" action="/dlp" style="display:inline"><input type="hidden" name="action" value="delete_rule"><input type="hidden" name="id" value="%s"><button class="btn btn-sm btn-d" type="submit">Delete</button></form></td></tr>`,
				templates.Esc(ru["name"]), templates.Esc(ru["pattern"]), templates.Badge(templates.StrVal(ru, "severity")), templates.Esc(ru["id"]))
		}
		rulesHTML = `<table><thead><tr><th>Name</th><th>Pattern</th><th>Severity</th><th></th></tr></thead><tbody>` + rows + `</tbody></table>`
	} else {
		rulesHTML = `<div class="empty"><div class="empty-i">🛡️</div>No DLP rules yet</div>`
	}

	var violationsHTML string
	if vList, ok := violations["violations"].([]interface{}); ok && len(vList) > 0 {
		rows := ""
		for _, vl := range vList {
			v := vl.(map[string]interface{})
			rows += fmt.Sprintf(`<tr><td style="font-weight:600">%s</td><td style="color:var(--dim)">%s</td><td>%s</td><td style="font-size:12px;color:var(--muted)">%s</td></tr>`,
				templates.Esc(v["rule"]), templates.Esc(v["message"]), templates.Badge(templates.StrVal(v, "severity")), templates.Esc(v["timestamp"]))
		}
		violationsHTML = `<table><thead><tr><th>Rule</th><th>Message</th><th>Severity</th><th>Time</th></tr></thead><tbody>` + rows + `</tbody></table>`
	} else {
		violationsHTML = `<div class="empty"><div class="empty-i">✅</div>No violations detected</div>`
	}

	content := fmt.Sprintf(`<h2 class="t">Data Loss Prevention</h2><p class="desc">Protect sensitive data in agent communications</p>
<div class="card" style="margin-bottom:16px"><div class="ct">Create Rule</div>
<form method="POST" action="/dlp" style="display:flex;gap:10px;align-items:end">
<input type="hidden" name="action" value="create_rule">
<div class="fg" style="flex:1;margin:0"><label class="fl">Name</label><input class="input" name="name" required placeholder="e.g. SSN Detection"></div>
<div class="fg" style="flex:1;margin:0"><label class="fl">Pattern</label><input class="input" name="pattern" required placeholder="e.g. \d{3}-\d{2}-\d{4}"></div>
<div class="fg" style="margin:0"><label class="fl">Severity</label><select class="input" name="severity"><option>high</option><option>medium</option><option>low</option></select></div>
<button class="btn btn-p" type="submit">Create</button></form></div>
<div style="display:flex;gap:16px;margin-bottom:16px"><form method="POST" action="/dlp"><input type="hidden" name="action" value="scan"><button class="btn" type="submit">Run Scan</button></form></div>
<div class="card" style="margin-bottom:16px"><div class="ct">Rules</div>%s</div>
<div class="card"><div class="ct">Violations</div>%s</div>`, rulesHTML, violationsHTML)

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("dlp", s.User, content))
}
