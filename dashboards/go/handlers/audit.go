package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleAudit handles the paginated audit log page (GET).
func HandleAudit(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)
	p := 0
	fmt.Sscanf(r.URL.Query().Get("p"), "%d", &p)
	if p < 0 {
		p = 0
	}

	data, _ := services.APICall(fmt.Sprintf("/api/audit?limit=25&offset=%d", p*25), "GET", s.Token, nil)
	total := templates.IntVal(data, "total")
	var tableHTML string
	if events, ok := data["events"].([]interface{}); ok && len(events) > 0 {
		rows := ""
		for _, ev := range events {
			e := ev.(map[string]interface{})
			ip := templates.StrVal(e, "ip")
			if ip == "" {
				ip = "-"
			}
			rows += fmt.Sprintf(`<tr><td style="font-size:12px;color:var(--muted);white-space:nowrap">%s</td><td>%s</td><td style="color:var(--primary);font-weight:500">%s</td><td style="font-size:12px">%s</td><td style="font-size:12px;color:var(--muted)">%s</td></tr>`,
				templates.Esc(e["timestamp"]), templates.Esc(e["actor"]), templates.Esc(e["action"]), templates.Esc(e["resource"]), templates.Esc(ip))
		}
		pages := (total + 24) / 25
		nav := fmt.Sprintf(`<div style="display:flex;gap:8px;justify-content:center;margin-top:16px"><span style="padding:6px 12px;font-size:12px;color:var(--muted)">Page %d of %d</span></div>`, p+1, pages)
		if p > 0 {
			nav = fmt.Sprintf(`<div style="display:flex;gap:8px;justify-content:center;margin-top:16px"><a class="btn btn-sm" href="/audit?p=%d">← Prev</a><span style="padding:6px 12px;font-size:12px;color:var(--muted)">Page %d of %d</span>`, p-1, p+1, pages)
			if (p+1)*25 < total {
				nav += fmt.Sprintf(`<a class="btn btn-sm" href="/audit?p=%d">Next →</a>`, p+1)
			}
			nav += `</div>`
		} else if (p+1)*25 < total {
			nav = fmt.Sprintf(`<div style="display:flex;gap:8px;justify-content:center;margin-top:16px"><span style="padding:6px 12px;font-size:12px;color:var(--muted)">Page %d of %d</span><a class="btn btn-sm" href="/audit?p=%d">Next →</a></div>`, p+1, pages, p+1)
		}
		tableHTML = `<table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>IP</th></tr></thead><tbody>` + rows + `</tbody></table>` + nav
	} else {
		tableHTML = `<div class="empty"><div class="empty-i">📋</div>No audit events yet</div>`
	}

	content := fmt.Sprintf(`<h2 class="t">Audit Log</h2><p class="desc">%d total events</p><div class="card">%s</div>`, total, tableHTML)
	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("audit", s.User, content))
}
