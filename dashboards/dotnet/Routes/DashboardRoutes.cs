using System.Text.Json;
using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;
using static AgenticMailDashboard.Services.ApiClient;

namespace AgenticMailDashboard.Routes;

public static class DashboardRoutes
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/", async (HttpContext ctx, ApiClient api) =>
        {
            var stats = await api.GetAsync(ctx, "/api/stats");
            var audit = await api.GetAsync(ctx, "/api/audit?limit=8");

            // Build stat cards
            var totalAgents = Int(stats, "agents") > 0 ? Int(stats, "agents") : Int(stats, "totalAgents");
            var totalUsers = Int(stats, "users") > 0 ? Int(stats, "users") : Int(stats, "totalUsers");
            var messagesToday = Int(stats, "messages_today") > 0 ? Int(stats, "messages_today") : Int(stats, "messages");
            var apiKeys = Int(stats, "api_keys") > 0 ? Int(stats, "api_keys") : Int(stats, "totalApiKeys");

            var statsHtml = $@"<div class='stats-grid'>
                {StatCard("Total Agents", totalAgents, "pink")}
                {StatCard("Total Users", totalUsers, "")}
                {StatCard("Messages Today", messagesToday, "")}
                {StatCard("API Keys", apiKeys, "")}
            </div>";

            // Build recent events table
            var rows = "";
            if (audit?.TryGetProperty("events", out var evArr) == true)
            {
                foreach (var e in evArr.EnumerateArray())
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

                    var ts = Str(e, "created_at");
                    if (string.IsNullOrEmpty(ts)) ts = Str(e, "timestamp");

                    rows += $@"<tr>
                        <td>{Esc(action)}</td>
                        <td>{Esc(actor)}</td>
                        <td>{Esc(resource)}</td>
                        <td style='color:var(--text-muted)'>{TimeAgo(ts)}</td>
                    </tr>";
                }
            }

            var eventsTable = Table(
                new[] { "Event", "Actor", "Resource", "Time" },
                rows,
                "&#128220;",
                "No recent audit events"
            );

            var html = $@"<div class='page-header'>
                <h1>Dashboard</h1>
                <p>Overview of your AgenticMail Enterprise instance</p>
            </div>
            {statsHtml}
            <div class='card'>
                <h3>Recent Audit Events</h3>
                {eventsTable}
            </div>";

            return Results.Content(Page(ctx, "/", html), "text/html");
        });
    }
}
