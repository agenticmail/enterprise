package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleApprovals renders the approvals page for pending approval requests.
func HandleApprovals(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	content := `<h2 class="t">Approvals</h2><p class="desc">Review and manage pending approval requests</p>
<div style="margin-bottom: 20px;">
	<button class="btn btn-p">Pending</button>
	<button class="btn">Approved</button>
	<button class="btn">Rejected</button>
</div>
<div class="card">
	<div class="ct">Pending Approvals</div>
	<div class="empty"><div class="empty-i">✅</div>No pending approvals<br><small>Agent approval requests will appear here</small></div>
</div>
<div class="card">
	<div class="ct">Approval History</div>
	<div class="empty"><div class="empty-i">📋</div>No approval history<br><small>Past approvals and rejections will appear here</small></div>
</div>`

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("approvals", s.User, content))
}