package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleVault handles the vault secrets page (GET), and secret creation,
// deletion, and rotation (POST).
func HandleVault(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	if r.Method == "POST" {
		r.ParseForm()
		action := r.FormValue("action")
		switch action {
		case "add_secret":
			services.APICall("/api/engine/vault/secrets", "POST", s.Token, map[string]string{
				"orgId":    "default",
				"name":     r.FormValue("name"),
				"value":    r.FormValue("value"),
				"category": r.FormValue("category"),
			})
		case "delete_secret":
			services.APICall("/api/engine/vault/secrets/"+r.FormValue("id"), "DELETE", s.Token, nil)
		case "rotate_secret":
			services.APICall("/api/engine/vault/secrets/"+r.FormValue("id")+"/rotate", "POST", s.Token, nil)
		}
		http.Redirect(w, r, "/vault", http.StatusFound)
		return
	}

	data, _ := services.APICall("/api/engine/vault/secrets?orgId=default", "GET", s.Token, nil)

	var tableHTML string
	if secrets, ok := data["secrets"].([]interface{}); ok && len(secrets) > 0 {
		rows := ""
		for _, sec := range secrets {
			st := sec.(map[string]interface{})
			name := templates.StrVal(st, "name")
			category := templates.StrVal(st, "category")
			if category == "" {
				category = "general"
			}
			createdBy := templates.StrVal(st, "created_by")
			if createdBy == "" {
				createdBy = templates.StrVal(st, "createdBy")
			}
			created := templates.StrVal(st, "created_at")
			if created == "" {
				created = templates.StrVal(st, "createdAt")
			}
			id := templates.StrVal(st, "id")

			rows += fmt.Sprintf(`<tr>
<td style="font-weight:600">%s</td>
<td>%s</td>
<td style="color:var(--dim)">%s</td>
<td style="font-size:12px;color:var(--muted)">%s</td>
<td style="display:flex;gap:6px">
<form method="POST" action="/vault" style="display:inline"><input type="hidden" name="action" value="rotate_secret"><input type="hidden" name="id" value="%s"><button class="btn btn-sm" type="submit">Rotate</button></form>
<form method="POST" action="/vault" style="display:inline"><input type="hidden" name="action" value="delete_secret"><input type="hidden" name="id" value="%s"><button class="btn btn-sm btn-d" type="submit">Delete</button></form>
</td></tr>`,
				templates.Esc(name), templates.Badge(category), templates.Esc(createdBy), templates.Esc(created), templates.Esc(id), templates.Esc(id))
		}
		tableHTML = `<table><thead><tr><th>Name</th><th>Category</th><th>Created By</th><th>Created</th><th>Actions</th></tr></thead><tbody>` + rows + `</tbody></table>`
	} else {
		tableHTML = `<div class="empty"><div class="empty-i">🔐</div>No secrets stored yet</div>`
	}

	content := fmt.Sprintf(`<h2 class="t">Vault</h2><p class="desc">Manage secrets and sensitive credentials</p>
<div class="card" style="margin-bottom:16px"><div class="ct">Add Secret</div>
<form method="POST" action="/vault" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
<input type="hidden" name="action" value="add_secret">
<div class="fg" style="flex:1;min-width:160px;margin:0"><label class="fl">Name</label><input class="input" name="name" required placeholder="e.g. OPENAI_API_KEY"></div>
<div class="fg" style="flex:1;min-width:160px;margin:0"><label class="fl">Value</label><input class="input" name="value" type="password" required placeholder="Secret value"></div>
<div class="fg" style="margin:0"><label class="fl">Category</label><select class="input" name="category"><option value="api_key">API Key</option><option value="credential">Credential</option><option value="certificate">Certificate</option><option value="token">Token</option><option value="general">General</option></select></div>
<button class="btn btn-p" type="submit">Add Secret</button></form></div>
<div class="card">%s</div>`, tableHTML)

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("vault", s.User, content))
}
