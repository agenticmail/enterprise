package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleSkillConnections renders the skill connections page for managing relationships between skills.
func HandleSkillConnections(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	content := `<h2 class="t">Skill Connections</h2><p class="desc">Visualize and manage relationships between skills</p>
<style>
.connection-type { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
.connection-type:last-child { border-bottom: none; }
.connection-indicator { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
.connection-depends { background: #06b6d4; }
.connection-enhances { background: var(--success); }
.connection-conflicts { background: var(--warning); }
.badge { margin-left: auto; background: var(--bg); color: var(--muted); padding: 2px 8px; border-radius: 12px; font-size: 12px; }
</style>
<div style="margin-bottom: 20px;">
	<button class="btn btn-p">+ Create Connection</button>
	<button class="btn" style="margin-left: 10px;">View Network</button>
</div>
<div class="card">
	<div class="ct">Skill Network Overview</div>
	<div class="empty"><div class="empty-i">🔗</div>No skill connections configured<br><small>Create connections between skills to enable complex workflows</small></div>
</div>
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
	<div class="card">
		<div class="ct">Connection Types</div>
		<div class="connection-type">
			<span class="connection-indicator connection-depends"></span>
			<span>Dependencies</span>
			<span class="badge">0</span>
		</div>
		<div class="connection-type">
			<span class="connection-indicator connection-enhances"></span>
			<span>Enhancements</span>
			<span class="badge">0</span>
		</div>
		<div class="connection-type">
			<span class="connection-indicator connection-conflicts"></span>
			<span>Conflicts</span>
			<span class="badge">0</span>
		</div>
	</div>
	<div class="card">
		<div class="ct">Recent Changes</div>
		<div class="empty"><div class="empty-i">📋</div>No recent changes<br><small>Connection updates will appear here</small></div>
	</div>
</div>`

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("skill-connections", s.User, content))
}