using System.Text.Json;
using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;
using static AgenticMailDashboard.Services.ApiClient;

namespace AgenticMailDashboard.Routes;

public static class ComplianceRoutes
{
    public static void Map(WebApplication app)
    {
        // GET /compliance - list compliance reports
        app.MapGet("/compliance", async (HttpContext ctx, ApiClient api) =>
        {
            var data = await api.GetAsync(ctx, "/engine/compliance/reports?orgId=default");

            var rows = "";
            var count = 0;

            if (data?.TryGetProperty("reports", out var arr) == true)
            {
                foreach (var r in arr.EnumerateArray())
                {
                    count++;
                    var id = Str(r, "id");

                    var type = Str(r, "type");
                    if (string.IsNullOrEmpty(type)) type = Str(r, "report_type");
                    if (string.IsNullOrEmpty(type)) type = "-";

                    var status = Str(r, "status");
                    if (string.IsNullOrEmpty(status)) status = "completed";

                    var startDate = Str(r, "startDate");
                    if (string.IsNullOrEmpty(startDate)) startDate = Str(r, "start_date");
                    if (string.IsNullOrEmpty(startDate)) startDate = "-";

                    var endDate = Str(r, "endDate");
                    if (string.IsNullOrEmpty(endDate)) endDate = Str(r, "end_date");
                    if (string.IsNullOrEmpty(endDate)) endDate = "-";

                    var agentId = Str(r, "agentId");
                    if (string.IsNullOrEmpty(agentId)) agentId = Str(r, "agent_id");
                    if (string.IsNullOrEmpty(agentId)) agentId = "all";

                    var ts = Str(r, "created_at");
                    if (string.IsNullOrEmpty(ts)) ts = Str(r, "timestamp");

                    rows += $@"<tr>
                        <td>{Badge(type.ToUpper(), type == "soc2" ? "primary" : type == "gdpr" ? "warning" : "default")}</td>
                        <td>{StatusBadge(status)}</td>
                        <td>{Esc(startDate)}</td>
                        <td>{Esc(endDate)}</td>
                        <td><code>{Esc(agentId)}</code></td>
                        <td style='color:var(--text-muted)'>{TimeAgo(ts)}</td>
                    </tr>";
                }
            }

            var table = Table(
                new[] { "Type", "Status", "Start Date", "End Date", "Agent", "Generated" },
                rows,
                "&#128203;",
                "No compliance reports yet"
            );

            var html = $@"<div class='page-header'>
                <h1>Compliance</h1>
                <p>Generate and view compliance reports</p>
            </div>

            <div class='card'>
                <h3>Generate Report</h3>
                <form method='POST' action='/compliance'>
                    <div class='form-row'>
                        <div class='form-group'>
                            <label>Report Type</label>
                            <input type='text' name='type' required placeholder='soc2 / gdpr / audit' value='audit'>
                        </div>
                        <div class='form-group'>
                            <label>Agent ID (optional)</label>
                            <input type='text' name='agentId' placeholder='Leave blank for all agents'>
                        </div>
                    </div>
                    <div class='form-row'>
                        <div class='form-group'>
                            <label>Start Date</label>
                            <input type='date' name='startDate'>
                        </div>
                        <div class='form-group'>
                            <label>End Date</label>
                            <input type='date' name='endDate'>
                        </div>
                    </div>
                    <button class='btn btn-primary' type='submit'>Generate Report</button>
                </form>
            </div>

            <div class='card'>
                <h3>Reports ({count})</h3>
                {table}
            </div>";

            return Results.Content(Page(ctx, "/compliance", html), "text/html");
        });

        // POST /compliance - generate a compliance report
        app.MapPost("/compliance", async (HttpContext ctx, ApiClient api) =>
        {
            var form = await ctx.Request.ReadFormAsync();
            var reportType = form["type"].ToString();

            var typePaths = new Dictionary<string, string>
            {
                ["soc2"] = "/engine/compliance/reports/soc2",
                ["gdpr"] = "/engine/compliance/reports/gdpr",
                ["audit"] = "/engine/compliance/reports/audit"
            };

            var path = typePaths.ContainsKey(reportType)
                ? typePaths[reportType]
                : "/engine/compliance/reports/audit";

            var (data, statusCode) = await api.PostAsync(ctx, path, new
            {
                startDate = form["startDate"].ToString(),
                endDate = form["endDate"].ToString(),
                agentId = form["agentId"].ToString()
            });

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Report generated", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to generate report";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/compliance");
        });
    }
}
