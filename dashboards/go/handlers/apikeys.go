package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleAPIKeys handles the API keys list page (GET).
func HandleAPIKeys(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)
	data, _ := services.APICall("/api/api-keys", "GET", s.Token, nil)
	var tableHTML string
	if keys, ok := data["keys"].([]interface{}); ok && len(keys) > 0 {
		rows := ""
		for _, ky := range keys {
			k := ky.(map[string]interface{})
			status := "active"
			if revoked, ok := k["revoked"].(bool); ok && revoked {
				status = "revoked"
			}
			lastUsed := "Never"
			if v := templates.StrVal(k, "lastUsedAt"); v != "" {
				lastUsed = v
			}
			rows += fmt.Sprintf(`<tr><td style="font-weight:600">%s</td><td><code style="font-size:12px">%s...</code></td><td style="color:var(--muted);font-size:12px">%s</td><td>%s</td></tr>`,
				templates.Esc(k["name"]), templates.Esc(k["keyPrefix"]), templates.Esc(lastUsed), templates.Badge(status))
		}
		tableHTML = `<table><thead><tr><th>Name</th><th>Key</th><th>Last Used</th><th>Status</th></tr></thead><tbody>` + rows + `</tbody></table>`
	} else {
		tableHTML = `<div class="empty"><div class="empty-i">🔑</div>No API keys</div>`
	}

	content := fmt.Sprintf(`<h2 class="t">API Keys</h2><p class="desc">Manage programmatic access</p><div class="card">%s</div>`, tableHTML)
	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("keys", s.User, content))
}
