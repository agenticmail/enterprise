package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleSkills handles the skills page (GET), and skill enable/disable/uninstall (POST).
func HandleSkills(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	if r.Method == "POST" {
		r.ParseForm()
		action := r.FormValue("action")
		skillID := r.FormValue("id")
		body := map[string]string{"orgId": "default"}
		switch action {
		case "enable":
			services.APICall("/api/engine/community/skills/"+skillID+"/enable", "PUT", s.Token, body)
		case "disable":
			services.APICall("/api/engine/community/skills/"+skillID+"/disable", "PUT", s.Token, body)
		case "uninstall":
			services.APICall("/api/engine/community/skills/"+skillID+"/uninstall", "DELETE", s.Token, body)
		}
		http.Redirect(w, r, "/skills", http.StatusFound)
		return
	}

	builtinData, _ := services.APICall("/api/engine/skills/by-category", "GET", s.Token, nil)
	installedData, _ := services.APICall("/api/engine/community/installed?orgId=default", "GET", s.Token, nil)

	// Builtin skills grid
	var builtinHTML string
	if categories, ok := builtinData["categories"].(map[string]interface{}); ok && len(categories) > 0 {
		cards := ""
		for catName, catSkills := range categories {
			if skills, ok := catSkills.([]interface{}); ok {
				for _, sk := range skills {
					skill := sk.(map[string]interface{})
					name := templates.StrVal(skill, "name")
					desc := templates.StrVal(skill, "description")
					if desc == "" {
						desc = "No description"
					}
					cards += fmt.Sprintf(`<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px">
<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
<strong style="font-size:13px">%s</strong>%s</div>
<div style="font-size:12px;color:var(--dim);line-height:1.5">%s</div></div>`,
						templates.Esc(name), templates.Badge(catName), templates.Esc(desc))
				}
			}
		}
		builtinHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">` + cards + `</div>`
	} else if skills, ok := builtinData["skills"].([]interface{}); ok && len(skills) > 0 {
		cards := ""
		for _, sk := range skills {
			skill := sk.(map[string]interface{})
			name := templates.StrVal(skill, "name")
			desc := templates.StrVal(skill, "description")
			category := templates.StrVal(skill, "category")
			if desc == "" {
				desc = "No description"
			}
			if category == "" {
				category = "general"
			}
			cards += fmt.Sprintf(`<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px">
<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
<strong style="font-size:13px">%s</strong>%s</div>
<div style="font-size:12px;color:var(--dim);line-height:1.5">%s</div></div>`,
				templates.Esc(name), templates.Badge(category), templates.Esc(desc))
		}
		builtinHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">` + cards + `</div>`
	} else {
		builtinHTML = `<div class="empty"><div class="empty-i">⚡</div>No builtin skills available</div>`
	}

	// Installed community skills table
	var installedHTML string
	var installedList []interface{}
	if skills, ok := installedData["skills"].([]interface{}); ok {
		installedList = skills
	} else if skills, ok := installedData["installed"].([]interface{}); ok {
		installedList = skills
	}

	if len(installedList) > 0 {
		rows := ""
		for _, sk := range installedList {
			skill := sk.(map[string]interface{})
			name := templates.StrVal(skill, "name")
			desc := templates.StrVal(skill, "description")
			status := templates.StrVal(skill, "status")
			if status == "" {
				status = "enabled"
			}
			id := templates.StrVal(skill, "id")

			toggleAction := "disable"
			toggleLabel := "Disable"
			if status == "disabled" {
				toggleAction = "enable"
				toggleLabel = "Enable"
			}

			rows += fmt.Sprintf(`<tr>
<td style="font-weight:600">%s</td>
<td style="font-size:12px;color:var(--dim)">%s</td>
<td>%s</td>
<td style="display:flex;gap:6px">
<form method="POST" action="/skills" style="display:inline"><input type="hidden" name="action" value="%s"><input type="hidden" name="id" value="%s"><button class="btn btn-sm" type="submit">%s</button></form>
<form method="POST" action="/skills" style="display:inline"><input type="hidden" name="action" value="uninstall"><input type="hidden" name="id" value="%s"><button class="btn btn-sm btn-d" type="submit">Uninstall</button></form>
</td></tr>`,
				templates.Esc(name), templates.Esc(desc), templates.Badge(status), toggleAction, templates.Esc(id), toggleLabel, templates.Esc(id))
		}
		installedHTML = `<table><thead><tr><th>Name</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead><tbody>` + rows + `</tbody></table>`
	} else {
		installedHTML = `<div class="empty"><div class="empty-i">📦</div>No community skills installed</div>`
	}

	content := fmt.Sprintf(`<h2 class="t">Skills</h2><p class="desc">Manage builtin and community skills for your agents</p>
<div class="card" style="margin-bottom:16px"><div class="ct">Builtin Skills</div>%s</div>
<div class="card"><div class="ct">Installed Community Skills</div>%s</div>`, builtinHTML, installedHTML)

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("skills", s.User, content))
}
