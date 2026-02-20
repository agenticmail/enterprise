package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleDashboard renders the main dashboard overview page with stats and recent activity.
func HandleDashboard(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)
	stats, _ := services.APICall("/api/stats", "GET", s.Token, nil)
	audit, _ := services.APICall("/api/audit?limit=8", "GET", s.Token, nil)

	var eventsHTML string
	if events, ok := audit["events"].([]interface{}); ok && len(events) > 0 {
		for _, ev := range events {
			e := ev.(map[string]interface{})
			eventsHTML += fmt.Sprintf(`<div style="padding:10px 0;border-bottom:1px solid var(--border);font-size:13px"><span style="color:var(--primary);font-weight:500">%s</span> on %s<div style="font-size:11px;color:var(--muted)">%s</div></div>`,
				templates.Esc(e["action"]), templates.Esc(e["resource"]), templates.Esc(e["timestamp"]))
		}
	} else {
		eventsHTML = `<div class="empty"><div class="empty-i">📋</div>No activity yet</div>`
	}

	if stats == nil {
		stats = map[string]interface{}{}
	}

	content := fmt.Sprintf(`<h2 class="t">Dashboard</h2><p class="desc">Overview of your AgenticMail instance</p>
<div class="stats">
<div class="stat"><div class="l">Total Agents</div><div class="v" style="color:var(--primary)">%d</div></div>
<div class="stat"><div class="l">Active Agents</div><div class="v" style="color:var(--success)">%d</div></div>
<div class="stat"><div class="l">Users</div><div class="v">%d</div></div>
<div class="stat"><div class="l">Audit Events</div><div class="v">%d</div></div></div>
<div class="card"><div class="ct">Recent Activity</div>%s</div>`,
		templates.IntVal(stats, "totalAgents"), templates.IntVal(stats, "activeAgents"),
		templates.IntVal(stats, "totalUsers"), templates.IntVal(stats, "totalAuditEvents"), eventsHTML)

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("dashboard", s.User, content))
}
