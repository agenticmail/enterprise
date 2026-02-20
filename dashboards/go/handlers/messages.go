package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleMessages handles the messages page (GET) for listing messages,
// and POST for sending new messages.
func HandleMessages(w http.ResponseWriter, r *http.Request) {
	s := services.GetSession(r)

	if r.Method == "POST" {
		r.ParseForm()
		action := r.FormValue("action")
		if action == "send" {
			services.APICall("/engine/messages", "POST", s.Token, map[string]string{
				"to": r.FormValue("to"), "subject": r.FormValue("subject"),
				"body": r.FormValue("body"),
			})
		}
		http.Redirect(w, r, "/messages", http.StatusFound)
		return
	}

	data, _ := services.APICall("/engine/messages", "GET", s.Token, nil)

	var tableHTML string
	if msgList, ok := data["messages"].([]interface{}); ok && len(msgList) > 0 {
		rows := ""
		for _, mg := range msgList {
			m := mg.(map[string]interface{})
			rows += fmt.Sprintf(`<tr><td style="font-weight:600">%s</td><td style="color:var(--dim)">%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td style="font-size:12px;color:var(--muted)">%s</td></tr>`,
				templates.Esc(m["from"]), templates.Esc(m["to"]), templates.Esc(m["subject"]),
				templates.DirectionBadge(templates.StrVal(m, "direction")),
				templates.ChannelBadge(templates.StrVal(m, "channel")),
				templates.Badge(templates.StrVal(m, "status")), templates.Esc(m["timestamp"]))
		}
		tableHTML = `<table><thead><tr><th>From</th><th>To</th><th>Subject</th><th>Direction</th><th>Channel</th><th>Status</th><th>Time</th></tr></thead><tbody>` + rows + `</tbody></table>`
	} else {
		tableHTML = `<div class="empty"><div class="empty-i">📬</div>No messages yet</div>`
	}

	content := fmt.Sprintf(`<h2 class="t">Messages</h2><p class="desc">View and send agent messages</p>
<div class="card" style="margin-bottom:16px"><div class="ct">Send Message</div>
<form method="POST" action="/messages">
<input type="hidden" name="action" value="send">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
<div class="fg"><label class="fl">To</label><input class="input" name="to" required placeholder="agent@example.com"></div>
<div class="fg"><label class="fl">Subject</label><input class="input" name="subject" required placeholder="Message subject"></div></div>
<div class="fg"><label class="fl">Body</label><textarea class="input" name="body" required rows="3" placeholder="Message content" style="resize:vertical"></textarea></div>
<button class="btn btn-p" type="submit">Send</button></form></div>
<div class="card"><div class="ct">Messages</div>%s</div>`, tableHTML)

	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, templates.Layout("messages", s.User, content))
}
