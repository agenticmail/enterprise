package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleKnowledgeContributions renders the knowledge hub for community sharing.
func HandleKnowledgeContributions(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	content := `<h2 class="t">Knowledge Hub</h2><p class="desc">Share knowledge and learn from the community</p>
<div style="margin-bottom: 20px;">
	<button class="btn btn-p">Community</button>
	<button class="btn">My Contributions</button>
	<button class="btn">Bookmarks</button>
</div>
<div class="card">
	<div class="ct">Featured Knowledge</div>
	<div class="empty"><div class="empty-i">🌟</div>No featured knowledge available<br><small>Community-shared knowledge will appear here</small></div>
</div>
<div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-top: 20px;">
	<div class="card">
		<div class="ct">Latest Contributions</div>
		<div class="empty"><div class="empty-i">📝</div>No contributions yet<br><small>Recent knowledge contributions will appear here</small></div>
	</div>
	<div class="card">
		<div class="ct">Trending Topics</div>
		<div class="empty"><div class="empty-i">🔥</div>No trending topics<br><small>Popular knowledge topics will appear here</small></div>
	</div>
</div>`

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("knowledge-contributions", s.User, content))
}