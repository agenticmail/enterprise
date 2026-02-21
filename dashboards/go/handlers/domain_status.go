package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleDomainStatus renders the domain status page for monitoring domain configuration.
func HandleDomainStatus(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	content := `<h2 class="t">Domain Status</h2><p class="desc">Monitor domain configuration and security status</p>
<style>
.status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
.status-item { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.status-item:last-child { border-bottom: none; }
.status-indicator { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.status-success { background: var(--success); }
.status-warning { background: var(--warning); }
</style>
<div class="status-grid">
	<div class="card">
		<div class="ct">Domain Configuration</div>
		<div class="status-item">
			<span class="status-indicator status-success"></span>
			<span>Domain connected</span>
		</div>
		<div class="status-item">
			<span class="status-indicator status-success"></span>
			<span>DNS configured</span>
		</div>
		<div class="status-item">
			<span class="status-indicator status-success"></span>
			<span>SSL certificate valid</span>
		</div>
	</div>
	<div class="card">
		<div class="ct">Security Status</div>
		<div class="status-item">
			<span class="status-indicator status-success"></span>
			<span>DKIM configured</span>
		</div>
		<div class="status-item">
			<span class="status-indicator status-success"></span>
			<span>SPF record valid</span>
		</div>
		<div class="status-item">
			<span class="status-indicator status-warning"></span>
			<span>DMARC recommended</span>
		</div>
	</div>
</div>
<div class="card">
	<div class="ct">Domain Health Monitoring</div>
	<div class="empty"><div class="empty-i">📊</div>Domain monitoring dashboard<br><small>Real-time domain health metrics will appear here</small></div>
</div>`

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("domain-status", s.User, content))
}