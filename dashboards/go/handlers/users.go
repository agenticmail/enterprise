package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleUsers handles the users list page (GET) and user creation (POST).
func HandleUsers(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	if r.Method == "POST" {
		r.ParseForm()
		services.APICall("/api/users", "POST", s.Token, map[string]string{
			"name": r.FormValue("name"), "email": r.FormValue("email"),
			"role": r.FormValue("role"), "password": r.FormValue("password"),
		})
		http.Redirect(w, r, "/users", http.StatusFound)
		return
	}

	data, _ := services.APICall("/api/users", "GET", s.Token, nil)
	var tableHTML string
	if users, ok := data["users"].([]interface{}); ok && len(users) > 0 {
		rows := ""
		for _, us := range users {
			u := us.(map[string]interface{})
			lastLogin := "Never"
			if v := templates.StrVal(u, "lastLoginAt"); v != "" {
				lastLogin = v
			}
			rows += fmt.Sprintf(`<tr><td style="font-weight:600">%s</td><td style="color:var(--dim)">%s</td><td>%s</td><td style="color:var(--muted);font-size:12px">%s</td></tr>`,
				templates.Esc(u["name"]), templates.Esc(u["email"]), templates.Badge(templates.StrVal(u, "role")), templates.Esc(lastLogin))
		}
		tableHTML = `<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last Login</th></tr></thead><tbody>` + rows + `</tbody></table>`
	} else {
		tableHTML = `<div class="empty"><div class="empty-i">👥</div>No users yet</div>`
	}

	content := fmt.Sprintf(`<h2 class="t">Users</h2><p class="desc">Manage team members</p>
<div class="card" style="margin-bottom:16px"><div class="ct">Create User</div>
<form method="POST" action="/users" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
<div class="fg"><label class="fl">Name</label><input class="input" name="name" required></div>
<div class="fg"><label class="fl">Email</label><input class="input" type="email" name="email" required></div>
<div class="fg"><label class="fl">Role</label><select class="input" name="role"><option>member</option><option>admin</option><option>owner</option></select></div>
<div class="fg"><label class="fl">Password</label><input class="input" type="password" name="password" required minlength="8"></div>
<div><button class="btn btn-p" type="submit">Create</button></div></form></div>
<div class="card">%s</div>`, tableHTML)

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("users", s.User, content))
}
