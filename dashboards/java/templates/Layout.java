/**
 * Layout — Full page layout, login page, sidebar navigation, CSS link.
 */

import java.util.*;

public class Layout {

    // ─── Sidebar Nav Item ───────────────────────────────

    private static String navItem(String href, String icon, String label, String activePage) {
        String cls = activePage.equals(href) ? " active" : "";
        return String.format(
            "<a href='%s' class='%s'>%s <span>%s</span></a>",
            href, cls, icon, Helpers.esc(label)
        );
    }

    // ─── Main Layout ────────────────────────────────────

    public static String layout(String activePage, Map<String, Object> user, String flash, String content) {
        String userName = user != null ? Helpers.esc(user.getOrDefault("name", user.getOrDefault("email", "Admin"))) : "Admin";
        String userEmail = user != null ? Helpers.esc(user.getOrDefault("email", "")) : "";

        return "<!DOCTYPE html><html lang='en'><head>" +
            "<meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" +
            "<title>AgenticMail Enterprise - Java</title>" +
            "<link rel='stylesheet' href='/static/styles.css'>" +
            "</head><body>" +
            "<aside class='sidebar'>" +
            "<div class='sidebar-brand'>&#127970; AgenticMail Enterprise<small>Admin Dashboard &middot; Java</small></div>" +
            "<nav class='sidebar-nav'>" +
            navItem("/", "&#128202;", "Dashboard", activePage) +
            navItem("/agents", "&#129302;", "Agents", activePage) +
            navItem("/skills", "&#9889;", "Skills", activePage) +
            navItem("/community-skills", "&#127978;", "Community Skills", activePage) +
            navItem("/skill-connections", "&#128279;", "Skill Connections", activePage) +
            navItem("/knowledge", "&#128218;", "Knowledge Bases", activePage) +
            navItem("/knowledge-contributions", "&#128218;", "Knowledge Hub", activePage) +
            navItem("/approvals", "&#9989;", "Approvals", activePage) +
            "<div class='sidebar-section'>Management</div>" +
            navItem("/workforce", "&#128336;", "Workforce", activePage) +
            navItem("/messages", "&#128231;", "Messages", activePage) +
            navItem("/guardrails", "&#128737;", "Guardrails", activePage) +
            navItem("/journal", "&#128214;", "Journal", activePage) +
            "<div class='sidebar-section'>Security</div>" +
            navItem("/dlp", "&#128274;", "DLP", activePage) +
            navItem("/compliance", "&#128203;", "Compliance", activePage) +
            navItem("/domain-status", "&#128737;", "Domain", activePage) +
            "<div class='sidebar-section'>Administration</div>" +
            navItem("/users", "&#128101;", "Users", activePage) +
            navItem("/vault", "&#128272;", "Vault", activePage) +
            navItem("/api-keys", "&#128273;", "API Keys", activePage) +
            navItem("/audit", "&#128220;", "Audit Log", activePage) +
            navItem("/settings", "&#9881;&#65039;", "Settings", activePage) +
            navItem("/activity", "&#128203;", "Activity", activePage) +
            "</nav>" +
            "<div class='sidebar-footer'>" +
            "<div style='margin-bottom:4px'>" + userName + "</div>" +
            "<div style='font-size:11px;color:var(--text-muted);margin-bottom:6px'>" + userEmail + "</div>" +
            "<a href='/logout'>Sign out</a>" +
            " &middot; " +
            "<button class='theme-toggle' onclick=\"toggleTheme()\" title='Toggle dark mode'>&#127763;</button>" +
            "</div>" +
            "</aside>" +
            "<main class='main'>" +
            flash +
            content +
            "</main>" +
            "<script>" +
            "if(localStorage.getItem('dark')==='1')document.documentElement.setAttribute('data-theme','dark');" +
            "function toggleTheme(){var d=document.documentElement;if(d.getAttribute('data-theme')==='dark'){d.removeAttribute('data-theme');localStorage.removeItem('dark')}else{d.setAttribute('data-theme','dark');localStorage.setItem('dark','1')}}" +
            "</script>" +
            "</body></html>";
    }

    // ─── Login Page ─────────────────────────────────────

    public static String loginPage(String error) {
        String errorHtml = "";
        if (error != null && !error.isEmpty()) {
            errorHtml = "<div class='login-error'>" + Helpers.esc(error) + "</div>";
        }

        return "<!DOCTYPE html><html lang='en'><head>" +
            "<meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" +
            "<title>Sign In - AgenticMail Enterprise</title>" +
            "<link rel='stylesheet' href='/static/styles.css'>" +
            "</head><body class='login-screen'>" +
            "<div class='login-box'>" +
            "<h1>&#127970; AgenticMail Enterprise</h1>" +
            "<p class='subtitle'>Admin Dashboard &middot; Java</p>" +
            "<div class='login-card'>" +
            errorHtml +
            "<form method='POST' action='/login'>" +
            "<div class='form-group'><label>Email</label>" +
            "<input type='email' name='email' required autofocus placeholder='admin@company.com'></div>" +
            "<div class='form-group'><label>Password</label>" +
            "<input type='password' name='password' required placeholder='Enter password'></div>" +
            "<button class='btn btn-primary btn-block' type='submit'>Sign In</button>" +
            "</form>" +
            "</div></div>" +
            "<script>if(localStorage.getItem('dark')==='1')document.documentElement.setAttribute('data-theme','dark');</script>" +
            "</body></html>";
    }
}
