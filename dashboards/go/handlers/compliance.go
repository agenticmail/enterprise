package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleCompliance handles the compliance reports page (GET) and report
// generation (POST).
func HandleCompliance(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	if r.Method == "POST" {
		r.ParseForm()
		action := r.FormValue("action")
		if action == "generate" {
			reportType := r.FormValue("type")
			switch reportType {
			case "soc2":
				services.APICall("/engine/compliance/reports/soc2", "POST", s.Token, nil)
			case "gdpr":
				services.APICall("/gdpr", "POST", s.Token, nil)
			case "audit":
				services.APICall("/audit", "POST", s.Token, nil)
			}
		}
		http.Redirect(w, r, "/compliance", http.StatusFound)
		return
	}

	data, _ := services.APICall("/engine/compliance/reports", "GET", s.Token, nil)

	var tableHTML string
	if reports, ok := data["reports"].([]interface{}); ok && len(reports) > 0 {
		rows := ""
		for _, rp := range reports {
			re := rp.(map[string]interface{})
			rows += fmt.Sprintf(`<tr><td style="font-weight:600">%s</td><td>%s</td><td>%s</td><td style="font-size:12px;color:var(--muted)">%s</td></tr>`,
				templates.Esc(re["name"]), templates.Badge(templates.StrVal(re, "type")), templates.Badge(templates.StrVal(re, "status")), templates.Esc(re["generatedAt"]))
		}
		tableHTML = `<table><thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Generated</th></tr></thead><tbody>` + rows + `</tbody></table>`
	} else {
		tableHTML = `<div class="empty"><div class="empty-i">📊</div>No compliance reports yet</div>`
	}

	content := fmt.Sprintf(`<h2 class="t">Compliance</h2><p class="desc">Generate and review compliance reports</p>
<div class="card" style="margin-bottom:16px"><div class="ct">Generate Report</div>
<form method="POST" action="/compliance" style="display:flex;gap:10px;align-items:end">
<input type="hidden" name="action" value="generate">
<div class="fg" style="margin:0"><label class="fl">Report Type</label><select class="input" name="type"><option value="soc2">SOC 2</option><option value="gdpr">GDPR</option><option value="audit">Audit</option></select></div>
<button class="btn btn-p" type="submit">Generate</button></form></div>
<div class="card"><div class="ct">Reports</div>%s</div>`, tableHTML)

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("compliance", s.User, content))
}
