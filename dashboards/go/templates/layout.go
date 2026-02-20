package templates

import "fmt"

// NavItem renders a sidebar navigation link, marking it active if it matches the current page.
func NavItem(href, icon, label, key, page string) string {
	cls := ""
	if page == key {
		cls = " on"
	}
	return fmt.Sprintf(`<a href="%s" class="%s">%s <span>%s</span></a>`, href, cls, icon, label)
}

// Layout wraps page content in the full dashboard HTML shell with sidebar navigation.
func Layout(page string, user map[string]interface{}, content string) string {
	userName := ""
	userEmail := ""
	if user != nil {
		userName = StrVal(user, "name")
		userEmail = StrVal(user, "email")
	}

	return fmt.Sprintf(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>🎀 AgenticMail Enterprise — Go</title>
<style>*{box-sizing:border-box;margin:0;padding:0}:root,[data-theme=light]{--bg:#f8f9fa;--surface:#fff;--border:#dee2e6;--text:#212529;--dim:#495057;--muted:#868e96;--primary:#e84393;--success:#2b8a3e;--danger:#c92a2a;--warning:#e67700;--r:6px;color-scheme:light dark}[data-theme=dark]{--bg:#0f1114;--surface:#16181d;--border:#2c3038;--text:#e1e4e8;--dim:#b0b8c4;--muted:#6b7280;--primary:#f06595;--success:#37b24d;--danger:#f03e3e;--warning:#f08c00}@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0f1114;--surface:#16181d;--border:#2c3038;--text:#e1e4e8;--dim:#b0b8c4;--muted:#6b7280;--primary:#f06595;--success:#37b24d;--danger:#f03e3e;--warning:#f08c00}}body{font-family:-apple-system,sans-serif;background:var(--bg);color:var(--text)}.layout{display:flex;min-height:100vh}.sidebar{width:240px;background:var(--surface);border-right:1px solid var(--border);position:fixed;top:0;left:0;bottom:0;display:flex;flex-direction:column}.sh{padding:20px;border-bottom:1px solid var(--border)}.sh h2{font-size:16px}.sh h2 em{font-style:normal;color:var(--primary)}.sh small{font-size:11px;color:var(--muted);display:block;margin-top:2px}.nav{flex:1;padding:8px 0}.ns{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);padding:12px 20px 4px}.nav a{display:flex;align-items:center;gap:10px;padding:10px 20px;color:var(--dim);text-decoration:none;font-size:13px}.nav a:hover{color:var(--text);background:rgba(255,255,255,0.03)}.nav a.on{color:var(--primary);background:rgba(232,67,147,0.12);border-right:2px solid var(--primary)}.sf{padding:16px 20px;border-top:1px solid var(--border);font-size:12px}.content{flex:1;margin-left:240px;padding:32px;max-width:1100px}h2.t{font-size:22px;font-weight:700;margin-bottom:4px}.desc{font-size:13px;color:var(--dim);margin-bottom:24px}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px}.stat{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px}.stat .l{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em}.stat .v{font-size:30px;font-weight:700;margin-top:4px}.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px}.ct{font-size:13px;color:var(--dim);text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:12px}table{width:100%%;border-collapse:collapse;font-size:13px}th{text-align:left;padding:10px 12px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid var(--border)}td{padding:12px;border-bottom:1px solid var(--border)}tr:hover td{background:rgba(255,255,255,0.015)}.btn{display:inline-flex;align-items:center;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:var(--surface);color:var(--text);text-decoration:none}.btn:hover{background:rgba(255,255,255,0.05)}.btn-p{background:var(--primary);border-color:var(--primary);color:#fff}.btn-d{color:var(--danger);border-color:var(--danger)}.btn-sm{padding:4px 10px;font-size:12px}.input{width:100%%;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px}.fg{margin-bottom:14px}.fl{display:block;font-size:12px;color:var(--dim);margin-bottom:4px}.empty{text-align:center;padding:48px 20px;color:var(--muted)}.empty-i{font-size:36px;margin-bottom:10px}select.input{appearance:auto}@media(max-width:768px){.sidebar{width:56px}.sh h2,.sh small,.nav a span,.ns,.sf{display:none}.nav a{justify-content:center;padding:14px 0;font-size:18px}.content{margin-left:56px;padding:16px}}</style></head>
<body><div class="layout">
<div class="sidebar"><div class="sh"><h2>🏢 <em>Agentic</em>Mail</h2><small>Enterprise · Go</small></div>
<div class="nav"><div class="ns">Overview</div>%s
<div class="ns">Manage</div>%s%s%s
<div class="ns">Management</div>%s%s%s
<div class="ns">Security</div>%s%s
<div class="ns">System</div>%s%s%s%s</div>
<div class="sf"><div style="color:var(--dim)">%s</div><div style="color:var(--muted);font-size:11px">%s</div><a href="/logout" style="color:var(--muted);font-size:11px;margin-top:6px;display:inline-block">Sign out</a></div></div>
<div class="content">%s</div></div></body></html>`,
		NavItem("/", "📊", "Dashboard", "dashboard", page),
		NavItem("/agents", "🤖", "Agents", "agents", page),
		NavItem("/users", "👥", "Users", "users", page),
		NavItem("/api-keys", "🔑", "API Keys", "keys", page),
		NavItem("/messages", "📬", "Messages", "messages", page),
		NavItem("/guardrails", "🛡️", "Guardrails", "guardrails", page),
		NavItem("/journal", "📓", "Journal", "journal", page),
		NavItem("/dlp", "🔒", "DLP", "dlp", page),
		NavItem("/compliance", "📊", "Compliance", "compliance", page),
		NavItem("/audit", "📋", "Audit Log", "audit", page),
		NavItem("/settings", "⚙️", "Settings", "settings", page),
		NavItem("/vault", "🔐", "Vault", "vault", page),
		NavItem("/skills", "⚡", "Skills", "skills", page),
		Esc(userName), Esc(userEmail), content)
}

// LoginPage returns the full HTML for the login screen.
func LoginPage() string {
	return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>🎀 AgenticMail Enterprise</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f8f9fa;color:#212529;display:flex;align-items:center;justify-content:center;min-height:100vh}.box{width:380px}h1{text-align:center;font-size:22px;margin-bottom:4px}h1 em{font-style:normal;color:#e84393}.sub{text-align:center;color:#868e96;font-size:13px;margin-bottom:32px}.fg{margin-bottom:14px}.fl{display:block;font-size:12px;color:#868e96;margin-bottom:4px}.input{width:100%;padding:10px 14px;background:#ffffff;border:1px solid #dee2e6;border-radius:8px;color:#212529;font-size:14px;outline:none}.input:focus{border-color:#e84393}.btn{width:100%;padding:10px;background:#e84393;border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:600;cursor:pointer}.btn:hover{background:#f06595}</style></head>
<body><div class="box"><h1>🏢 <em>AgenticMail</em> Enterprise</h1><p class="sub">Sign in · Go Dashboard</p>
<form method="POST" action="/login"><div class="fg"><label class="fl">Email</label><input class="input" type="email" name="email" required autofocus></div>
<div class="fg"><label class="fl">Password</label><input class="input" type="password" name="password" required></div>
<button class="btn" type="submit">Sign In</button></form></div></body></html>`
}
