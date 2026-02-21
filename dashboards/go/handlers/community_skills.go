package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleCommunitySkills renders the community skills page for browsing and installing shared skills.
func HandleCommunitySkills(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	content := `<h2 class="t">Community Skills</h2><p class="desc">Browse and install skills shared by the community</p>
<div class="card">
	<div class="ct">Featured Skills</div>
	<div class="empty"><div class="empty-i">🏪</div>No community skills available<br><small>Community-shared skills will appear here</small></div>
</div>
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
	<div class="card">
		<div class="ct">Popular Categories</div>
		<div class="empty"><div class="empty-i">🏷️</div>No categories</div>
	</div>
	<div class="card">
		<div class="ct">My Contributions</div>
		<div class="empty"><div class="empty-i">📤</div>No contributions</div>
	</div>
</div>`

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("community-skills", s.User, content))
}