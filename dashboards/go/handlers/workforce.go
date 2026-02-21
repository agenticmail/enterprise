package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleWorkforce renders the workforce management page for agent scheduling and workloads.
func HandleWorkforce(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	content := `<h2 class="t">Workforce</h2><p class="desc">Monitor agent schedules, workloads, and availability</p>
<style>
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); padding: 20px; text-align: center; }
.stat-icon { font-size: 24px; margin-bottom: 8px; }
.stat-value { font-size: 24px; font-weight: 700; color: var(--primary); margin-bottom: 4px; }
.stat-label { font-size: 13px; color: var(--muted); }
</style>
<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px;">
	<div class="stat-card">
		<div class="stat-icon">🤖</div>
		<div class="stat-value">0</div>
		<div class="stat-label">Active Agents</div>
	</div>
	<div class="stat-card">
		<div class="stat-icon">⏳</div>
		<div class="stat-value">0</div>
		<div class="stat-label">Pending Tasks</div>
	</div>
	<div class="stat-card">
		<div class="stat-icon">📊</div>
		<div class="stat-value">0%</div>
		<div class="stat-label">Utilization</div>
	</div>
</div>
<div style="margin-bottom: 20px;">
	<button class="btn btn-p">Schedule</button>
	<button class="btn">Workload</button>
	<button class="btn">Analytics</button>
</div>
<div class="card">
	<div class="ct">Agent Schedule</div>
	<div class="empty"><div class="empty-i">🕐</div>No scheduled tasks<br><small>Agent schedules and time allocations will appear here</small></div>
</div>
<div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-top: 20px;">
	<div class="card">
		<div class="ct">Workload Distribution</div>
		<div class="empty"><div class="empty-i">⚖️</div>No workload data<br><small>Agent workload distribution will appear here</small></div>
	</div>
	<div class="card">
		<div class="ct">Performance Metrics</div>
		<div class="empty"><div class="empty-i">📈</div>No metrics available<br><small>Performance analytics will appear here</small></div>
	</div>
</div>`

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("workforce", s.User, content))
}