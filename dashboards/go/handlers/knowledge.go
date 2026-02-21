package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleKnowledge renders the knowledge bases management page.
func HandleKnowledge(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	content := `<h2 class="t">Knowledge Bases</h2><p class="desc">Manage and organize knowledge bases for your agents</p>
<div style="margin-bottom: 20px;">
	<button class="btn btn-p">+ Create Knowledge Base</button>
</div>
<div class="card">
	<div class="ct">Active Knowledge Bases</div>
	<div class="empty"><div class="empty-i">📚</div>No knowledge bases created<br><small>Create your first knowledge base to get started</small></div>
</div>
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
	<div class="card">
		<div class="ct">Recent Activity</div>
		<div class="empty"><div class="empty-i">📈</div>No recent activity</div>
	</div>
	<div class="card">
		<div class="ct">Knowledge Stats</div>
		<div class="empty"><div class="empty-i">📊</div>No statistics available</div>
	</div>
</div>`

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("knowledge", s.User, content))
}