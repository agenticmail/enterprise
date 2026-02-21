using System.Text.Json;
using System.Web;

namespace AgenticMailDashboard.Services;

/// <summary>
/// Static methods for generating all HTML fragments: Layout, LoginPage, badges,
/// stat cards, tables, modals, pagination, flash messages, and utilities.
/// </summary>
public static class HtmlBuilder
{
    // --- Escaping ---

    public static string Esc(string? s) => HttpUtility.HtmlEncode(s ?? "");

    // --- Time formatting ---

    public static string TimeAgo(string? iso)
    {
        if (string.IsNullOrEmpty(iso)) return "N/A";
        if (!DateTimeOffset.TryParse(iso, out var dt)) return iso;
        var diff = (int)(DateTimeOffset.UtcNow - dt).TotalSeconds;
        if (diff < 0) diff = 0;
        return diff switch
        {
            < 60 => $"{diff}s ago",
            < 3600 => $"{diff / 60}m ago",
            < 86400 => $"{diff / 3600}h ago",
            _ => $"{diff / 86400}d ago"
        };
    }

    // --- Badges ---

    public static string Badge(string? text, string variant = "default")
        => $"<span class='badge badge-{Esc(variant)}'>{Esc(text)}</span>";

    public static string StatusBadge(string? status)
    {
        var s = (status ?? "").ToLower();
        var variant = s switch
        {
            "active" or "enabled" or "running" or "success" => "success",
            "archived" or "disabled" or "revoked" => "danger",
            "pending" or "paused" => "warning",
            "admin" => "primary",
            "owner" => "owner",
            "member" => "member",
            "viewer" => "viewer",
            _ => "default"
        };
        return Badge(status, variant);
    }

    // --- Stat Card ---

    public static string StatCard(string label, object value, string extraClass = "")
        => $@"<div class='stat-card'>
            <div class='label'>{Esc(label)}</div>
            <div class='value {Esc(extraClass)}'>{Esc(value?.ToString())}</div>
        </div>";

    // --- Table ---

    public static string Table(string[] headers, string rowsHtml, string emptyIcon = "", string emptyText = "No data")
    {
        if (string.IsNullOrEmpty(rowsHtml))
            return $"<div class='empty'><span class='icon'>{emptyIcon}</span>{Esc(emptyText)}</div>";

        var ths = string.Join("", headers.Select(h => $"<th>{Esc(h)}</th>"));
        return $@"<div class='table-wrap'>
            <table>
                <thead><tr>{ths}</tr></thead>
                <tbody>{rowsHtml}</tbody>
            </table>
        </div>";
    }

    // --- Modal (confirmation dialog) ---

    public static string Modal(string id, string title, string bodyHtml, string confirmAction, string confirmLabel = "Confirm", string confirmClass = "btn-danger")
        => $@"<div class='modal-overlay' id='{Esc(id)}'>
            <div class='modal'>
                <h3>{Esc(title)}</h3>
                <div>{bodyHtml}</div>
                <div class='modal-actions'>
                    <button class='btn' onclick=""document.getElementById('{Esc(id)}').classList.remove('open')"">Cancel</button>
                    <form method='POST' action='{Esc(confirmAction)}' style='display:inline'>
                        <button class='btn {Esc(confirmClass)}' type='submit'>{Esc(confirmLabel)}</button>
                    </form>
                </div>
            </div>
        </div>";

    // --- Pagination ---

    public static string Pagination(int currentPage, int perPage, int total, string baseUrl)
    {
        var totalPages = total > 0 ? (int)Math.Ceiling((double)total / perPage) : 1;
        var prev = currentPage > 1
            ? $"<a href='{Esc(baseUrl)}?page={currentPage - 1}'>&laquo; Previous</a>"
            : "";
        var next = currentPage < totalPages
            ? $"<a href='{Esc(baseUrl)}?page={currentPage + 1}'>Next &raquo;</a>"
            : "";
        return $@"<div class='pagination'>
            {prev}
            <span class='current'>Page {currentPage}</span>
            {next}
            <span style='color:var(--text-muted);font-size:12px;margin-left:auto'>{total} total events</span>
        </div>";
    }

    // --- Flash messages ---

    public static string Flash(HttpContext ctx)
    {
        var msg = ctx.Session.GetString("flash");
        if (string.IsNullOrEmpty(msg)) return "";
        var type = ctx.Session.GetString("flash_type") ?? "info";
        ctx.Session.Remove("flash");
        ctx.Session.Remove("flash_type");
        return $"<div class='flash flash-{Esc(type)}'>{Esc(msg)}</div>";
    }

    public static void SetFlash(HttpContext ctx, string message, string type = "info")
    {
        ctx.Session.SetString("flash", message);
        ctx.Session.SetString("flash_type", type);
    }

    // --- Nav item ---

    private static string NavItem(string href, string icon, string label, string activePath)
    {
        var active = href == activePath ? "active" : "";
        return $"<a href='{Esc(href)}' class='{active}'>{icon} <span>{Esc(label)}</span></a>";
    }

    // --- Login Page ---

    public static string LoginPage(string? error = null)
    {
        var errorHtml = string.IsNullOrEmpty(error)
            ? ""
            : $"<div class='login-error'>{Esc(error)}</div>";

        return $@"<!DOCTYPE html>
<html lang='en'>
<head>
<meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<title>Sign In - AgenticMail Enterprise</title>
<link rel='stylesheet' href='/styles.css'>
</head>
<body class='login-screen'>
<div class='login-box'>
    <h1>&#127970; AgenticMail Enterprise</h1>
    <p class='subtitle'>Admin Dashboard &middot; .NET</p>
    <div class='login-card'>
        {errorHtml}
        <form method='POST' action='/login'>
            <div class='form-group'>
                <label>Email</label>
                <input type='email' name='email' required autofocus placeholder='admin@company.com'>
            </div>
            <div class='form-group'>
                <label>Password</label>
                <input type='password' name='password' required placeholder='Enter password'>
            </div>
            <button class='btn btn-primary btn-block' type='submit'>Sign In</button>
        </form>
    </div>
</div>
</body>
</html>";
    }

    // --- Layout (main chrome with sidebar) ---

    public static string Layout(string activePath, string userName, string userEmail, string content, HttpContext ctx)
    {
        var flash = Flash(ctx);

        return $@"<!DOCTYPE html>
<html lang='en'>
<head>
<meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<title>AgenticMail Enterprise - .NET</title>
<link rel='stylesheet' href='/styles.css'>
</head>
<body style='display:flex;min-height:100vh'>
<aside class='sidebar'>
    <div class='sidebar-brand'>
        &#127970; AgenticMail Enterprise
        <small>Admin Dashboard &middot; .NET</small>
    </div>
    <nav class='sidebar-nav'>
        {NavItem("/", "&#128202;", "Dashboard", activePath)}
        {NavItem("/agents", "&#129302;", "Agents", activePath)}
        {NavItem("/skills", "&#9889;", "Skills", activePath)}
        {NavItem("/community-skills", "&#127978;", "Community Skills", activePath)}
        {NavItem("/skill-connections", "&#128279;", "Skill Connections", activePath)}
        {NavItem("/knowledge", "&#128218;", "Knowledge Bases", activePath)}
        {NavItem("/knowledge-contributions", "&#128218;", "Knowledge Hub", activePath)}
        {NavItem("/approvals", "&#9989;", "Approvals", activePath)}
        <div style='padding:12px 16px 4px;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)'>Management</div>
        {NavItem("/workforce", "&#128336;", "Workforce", activePath)}
        {NavItem("/messages", "&#9993;&#65039;", "Messages", activePath)}
        {NavItem("/guardrails", "&#128737;", "Guardrails", activePath)}
        {NavItem("/journal", "&#128214;", "Journal", activePath)}
        <div style='padding:12px 16px 4px;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)'>Security</div>
        {NavItem("/dlp", "&#128737;", "DLP", activePath)}
        {NavItem("/compliance", "&#128203;", "Compliance", activePath)}
        {NavItem("/domain-status", "&#128737;", "Domain", activePath)}
        <div style='padding:12px 16px 4px;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)'>Administration</div>
        {NavItem("/users", "&#128101;", "Users", activePath)}
        {NavItem("/vault", "&#128272;", "Vault", activePath)}
        {NavItem("/api-keys", "&#128273;", "API Keys", activePath)}
        {NavItem("/audit", "&#128220;", "Audit Log", activePath)}
        {NavItem("/settings", "&#9881;&#65039;", "Settings", activePath)}
        {NavItem("/activity", "&#128203;", "Activity", activePath)}
    </nav>
    <div class='sidebar-footer'>
        <div style='margin-bottom:6px'>{Esc(string.IsNullOrEmpty(userName) ? "Admin" : userName)}</div>
        <div style='font-size:11px;color:var(--text-muted);margin-bottom:6px'>{Esc(userEmail)}</div>
        <a href='/logout'>Sign out</a>
        &nbsp;&middot;&nbsp;
        <button class='theme-toggle' onclick=""toggleTheme()"" title='Toggle dark mode'>&#127763;</button>
    </div>
</aside>
<main class='main'>
    {flash}
    {content}
</main>
<script>
if(localStorage.getItem('dark')==='1') document.documentElement.setAttribute('data-theme','dark');
function toggleTheme(){{
    const d=document.documentElement.hasAttribute('data-theme');
    if(d){{document.documentElement.removeAttribute('data-theme');localStorage.removeItem('dark')}}
    else{{document.documentElement.setAttribute('data-theme','dark');localStorage.setItem('dark','1')}}
}}
</script>
</body>
</html>";
    }

    /// <summary>
    /// Renders a full page within the Layout. Reads session for user info.
    /// </summary>
    public static string Page(HttpContext ctx, string activePath, string content)
    {
        var name = ctx.Session.GetString("userName") ?? "";
        var email = ctx.Session.GetString("userEmail") ?? "";
        return Layout(activePath, name, email, content, ctx);
    }
}
