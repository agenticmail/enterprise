package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleJournal handles the journal page (GET) with entries and stats,
// and POST for rollback actions.
func HandleJournal(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	if r.Method == "POST" {
		r.ParseForm()
		action := r.FormValue("action")
		if action == "rollback" {
			services.APICall("/engine/journal/"+r.FormValue("id")+"/rollback", "POST", s.Token, nil)
		}
		http.Redirect(w, r, "/journal", http.StatusFound)
		return
	}

	entries, _ := services.APICall("/engine/journal", "GET", s.Token, nil)
	stats, _ := services.APICall("/engine/journal/stats/default", "GET", s.Token, nil)
	if stats == nil {
		stats = map[string]interface{}{}
	}

	var statsHTML string
	statsHTML = fmt.Sprintf(`<div class="stats">
<div class="stat"><div class="l">Total Entries</div><div class="v" style="color:var(--primary)">%d</div></div>
<div class="stat"><div class="l">Actions Logged</div><div class="v" style="color:var(--success)">%d</div></div>
<div class="stat"><div class="l">Rollbacks</div><div class="v" style="color:var(--warning)">%d</div></div></div>`,
		templates.IntVal(stats, "totalEntries"), templates.IntVal(stats, "totalActions"), templates.IntVal(stats, "totalRollbacks"))

	var tableHTML string
	if entryList, ok := entries["entries"].([]interface{}); ok && len(entryList) > 0 {
		rows := ""
		for _, en := range entryList {
			e := en.(map[string]interface{})
			rollbackBtn := ""
			if templates.StrVal(e, "status") != "rolled_back" {
				rollbackBtn = fmt.Sprintf(`<form method="POST" action="/journal" style="display:inline"><input type="hidden" name="action" value="rollback"><input type="hidden" name="id" value="%s"><button class="btn btn-sm btn-d" type="submit">Rollback</button></form>`, templates.Esc(e["id"]))
			}
			rows += fmt.Sprintf(`<tr><td style="font-weight:600">%s</td><td style="color:var(--dim)">%s</td><td>%s</td><td style="font-size:12px;color:var(--muted)">%s</td><td>%s</td></tr>`,
				templates.Esc(e["action"]), templates.Esc(e["agent"]), templates.Badge(templates.StrVal(e, "status")), templates.Esc(e["timestamp"]), rollbackBtn)
		}
		tableHTML = `<table><thead><tr><th>Action</th><th>Agent</th><th>Status</th><th>Time</th><th></th></tr></thead><tbody>` + rows + `</tbody></table>`
	} else {
		tableHTML = `<div class="empty"><div class="empty-i">📓</div>No journal entries yet</div>`
	}

	content := fmt.Sprintf(`<h2 class="t">Journal</h2><p class="desc">Immutable action log with rollback capability</p>
%s<div class="card"><div class="ct">Journal Entries</div>%s</div>`, statsHTML, tableHTML)

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("journal", s.User, content))
}
