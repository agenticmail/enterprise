package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleActivity renders the activity page with real-time events and tool usage.
func HandleActivity(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	content := `<h2 class="t">Activity</h2><p class="desc">Real-time activity and tool usage across all agents</p>
<div style="margin-bottom: 20px;">
	<button class="btn btn-p" onclick="location.href='#events'">Events</button>
	<button class="btn" onclick="location.href='#tools'">Tool Calls</button>
</div>
<div class="card">
	<div class="ct">Recent Events</div>
	<div class="empty"><div class="empty-i">📋</div>No events recorded<br><small>Agent activity will appear here</small></div>
</div>
<div class="card">
	<div class="ct">Tool Usage</div>
	<div class="empty"><div class="empty-i">🛠️</div>No tool calls recorded<br><small>Tool usage statistics will appear here</small></div>
</div>`

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("activity", s.User, content))
}