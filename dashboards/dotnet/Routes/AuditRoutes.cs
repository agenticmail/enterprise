using System.Text.Json;
using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;
using static AgenticMailDashboard.Services.ApiClient;

namespace AgenticMailDashboard.Routes;

public static class AuditRoutes
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/audit", async (HttpContext ctx, ApiClient api) =>
        {
            // Parse page from query string
            var pageStr = ctx.Request.Query["page"].FirstOrDefault();
            var page = 1;
            if (int.TryParse(pageStr, out var p) && p > 0)
                page = p;

            var limit = 25;
            var offset = (page - 1) * limit;

            var data = await api.GetAsync(ctx, $"/api/audit?limit={limit}&offset={offset}");

            var total = Int(data, "total");
            var rows = "";

            if (data?.TryGetProperty("events", out var arr) == true)
            {
                foreach (var e in arr.EnumerateArray())
                {
                    var action = Str(e, "action");
                    if (string.IsNullOrEmpty(action)) action = Str(e, "event");
                    if (string.IsNullOrEmpty(action)) action = "unknown";

                    var actor = Str(e, "actor");
                    if (string.IsNullOrEmpty(actor)) actor = Str(e, "user");
                    if (string.IsNullOrEmpty(actor)) actor = Str(e, "email");
                    if (string.IsNullOrEmpty(actor)) actor = "-";

                    var resource = Str(e, "resource");
                    if (string.IsNullOrEmpty(resource)) resource = Str(e, "target");
                    if (string.IsNullOrEmpty(resource)) resource = "-";

                    var ip = Str(e, "ip");
                    if (string.IsNullOrEmpty(ip)) ip = Str(e, "ip_address");
                    if (string.IsNullOrEmpty(ip)) ip = "-";

                    var ts = Str(e, "created_at");
                    if (string.IsNullOrEmpty(ts)) ts = Str(e, "timestamp");

                    rows += $@"<tr>
                        <td>{Esc(action)}</td>
                        <td>{Esc(actor)}</td>
                        <td>{Esc(resource)}</td>
                        <td style='color:var(--text-muted)'><code>{Esc(ip)}</code></td>
                        <td style='color:var(--text-muted)'>{TimeAgo(ts)}</td>
                    </tr>";
                }
            }

            var table = Table(
                new[] { "Event", "Actor", "Resource", "IP Address", "Time" },
                rows,
                "&#128220;",
                "No audit events recorded"
            );

            var pagination = !string.IsNullOrEmpty(rows)
                ? Pagination(page, limit, total, "/audit")
                : "";

            var html = $@"<div class='page-header'>
                <h1>Audit Log</h1>
                <p>Security and activity event history</p>
            </div>

            <div class='card'>
                {table}
                {pagination}
            </div>";

            return Results.Content(Page(ctx, "/audit", html), "text/html");
        });
    }
}
