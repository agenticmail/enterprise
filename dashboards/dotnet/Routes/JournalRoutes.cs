using System.Text.Json;
using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;
using static AgenticMailDashboard.Services.ApiClient;

namespace AgenticMailDashboard.Routes;

public static class JournalRoutes
{
    public static void Map(WebApplication app)
    {
        // GET /journal - list journal entries with stats
        app.MapGet("/journal", async (HttpContext ctx, ApiClient api) =>
        {
            var data = await api.GetAsync(ctx, "/engine/journal?orgId=default");
            var stats = await api.GetAsync(ctx, "/engine/journal/stats/default");

            // --- Stats cards ---
            var totalEntries = Int(stats, "total");
            if (totalEntries == 0) totalEntries = Int(stats, "totalEntries");
            var rollbacks = Int(stats, "rollbacks");
            var agents = Int(stats, "agents");
            if (agents == 0) agents = Int(stats, "uniqueAgents");

            var statsHtml = $@"<div class='stats-grid'>
                {StatCard("Total Entries", totalEntries, "")}
                {StatCard("Rollbacks", rollbacks, "")}
                {StatCard("Agents", agents, "")}
            </div>";

            // --- Journal entries table ---
            var rows = "";
            var modals = "";
            var count = 0;

            if (data?.TryGetProperty("entries", out var arr) == true)
            {
                foreach (var e in arr.EnumerateArray())
                {
                    count++;
                    var id = Str(e, "id");
                    var agentId = Str(e, "agent_id");
                    if (string.IsNullOrEmpty(agentId)) agentId = Str(e, "agentId");
                    if (string.IsNullOrEmpty(agentId)) agentId = "-";

                    var action = Str(e, "action");
                    if (string.IsNullOrEmpty(action)) action = Str(e, "type");
                    if (string.IsNullOrEmpty(action)) action = "-";

                    var detail = Str(e, "detail");
                    if (string.IsNullOrEmpty(detail)) detail = Str(e, "description");
                    if (string.IsNullOrEmpty(detail)) detail = Str(e, "summary");
                    if (string.IsNullOrEmpty(detail)) detail = "-";
                    if (detail.Length > 80) detail = detail[..80] + "...";

                    var status = Str(e, "status");
                    if (string.IsNullOrEmpty(status)) status = "completed";

                    var ts = Str(e, "created_at");
                    if (string.IsNullOrEmpty(ts)) ts = Str(e, "timestamp");

                    var modalId = $"rollback-{Esc(id)}";
                    var rollbackBtn = $"<button class='btn btn-sm btn-danger' onclick=\"document.getElementById('{modalId}').classList.add('open')\">Rollback</button>";
                    modals += Modal(modalId, "Rollback Action",
                        $"<p>Are you sure you want to rollback this action by agent <strong>{Esc(agentId)}</strong>?</p>",
                        $"/journal/{Esc(id)}/rollback",
                        "Rollback", "btn-danger");

                    rows += $@"<tr>
                        <td><code>{Esc(agentId)}</code></td>
                        <td>{Esc(action)}</td>
                        <td>{Esc(detail)}</td>
                        <td>{StatusBadge(status)}</td>
                        <td style='color:var(--text-muted)'>{TimeAgo(ts)}</td>
                        <td>{rollbackBtn}</td>
                    </tr>";
                }
            }

            var table = Table(
                new[] { "Agent", "Action", "Detail", "Status", "Time", "Actions" },
                rows,
                "&#128214;",
                "No journal entries recorded"
            );

            var html = $@"<div class='page-header'>
                <h1>Journal</h1>
                <p>Agent action journal and rollback operations</p>
            </div>
            {statsHtml}
            <div class='card'>
                <h3>Journal Entries ({count})</h3>
                {table}
            </div>
            {modals}";

            return Results.Content(Page(ctx, "/journal", html), "text/html");
        });

        // POST /journal/{id}/rollback - rollback a journal entry
        app.MapPost("/journal/{id}/rollback", async (string id, HttpContext ctx, ApiClient api) =>
        {
            var (data, statusCode) = await api.PostAsync(ctx, $"/engine/journal/{id}/rollback");

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Rollback successful", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to rollback action";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/journal");
        });
    }
}
