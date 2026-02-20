using System.Text.Json;
using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;
using static AgenticMailDashboard.Services.ApiClient;

namespace AgenticMailDashboard.Routes;

public static class GuardrailRoutes
{
    public static void Map(WebApplication app)
    {
        // GET /guardrails - list interventions and anomaly rules
        app.MapGet("/guardrails", async (HttpContext ctx, ApiClient api) =>
        {
            var interventionsData = await api.GetAsync(ctx, "/engine/guardrails/interventions?orgId=default");
            var anomalyData = await api.GetAsync(ctx, "/engine/anomaly-rules?orgId=default");

            // --- Interventions table ---
            var interventionRows = "";
            var interventionModals = "";
            var interventionCount = 0;

            if (interventionsData?.TryGetProperty("interventions", out var intArr) == true)
            {
                foreach (var i in intArr.EnumerateArray())
                {
                    interventionCount++;
                    var id = Str(i, "id");
                    var agentId = Str(i, "agent_id");
                    if (string.IsNullOrEmpty(agentId)) agentId = Str(i, "agentId");
                    if (string.IsNullOrEmpty(agentId)) agentId = "-";

                    var type = Str(i, "type");
                    if (string.IsNullOrEmpty(type)) type = Str(i, "action");
                    if (string.IsNullOrEmpty(type)) type = "-";

                    var reason = Str(i, "reason");
                    if (string.IsNullOrEmpty(reason)) reason = "-";

                    var status = Str(i, "status");
                    if (string.IsNullOrEmpty(status)) status = "active";

                    var ts = Str(i, "created_at");
                    if (string.IsNullOrEmpty(ts)) ts = Str(i, "timestamp");

                    var actions = "";
                    if (status.ToLower() == "paused" || status.ToLower() == "active")
                    {
                        var resumeId = $"resume-{Esc(id)}";
                        actions += $"<button class='btn btn-sm btn-primary' onclick=\"document.getElementById('{resumeId}').classList.add('open')\">Resume</button> ";
                        interventionModals += Modal(resumeId, "Resume Agent",
                            $"<p>Resume agent <strong>{Esc(agentId)}</strong>?</p>",
                            $"/guardrails/resume/{Esc(agentId)}",
                            "Resume", "btn-primary");

                        var killId = $"kill-{Esc(id)}";
                        actions += $"<button class='btn btn-sm btn-danger' onclick=\"document.getElementById('{killId}').classList.add('open')\">Kill</button>";
                        interventionModals += Modal(killId, "Kill Agent",
                            $"<p>Are you sure you want to kill agent <strong>{Esc(agentId)}</strong>? This cannot be undone.</p>",
                            $"/guardrails/kill/{Esc(agentId)}",
                            "Kill", "btn-danger");
                    }

                    interventionRows += $@"<tr>
                        <td><code>{Esc(agentId)}</code></td>
                        <td>{Esc(type)}</td>
                        <td>{Esc(reason)}</td>
                        <td>{StatusBadge(status)}</td>
                        <td style='color:var(--text-muted)'>{TimeAgo(ts)}</td>
                        <td>{actions}</td>
                    </tr>";
                }
            }

            var interventionsTable = Table(
                new[] { "Agent", "Type", "Reason", "Status", "Time", "Actions" },
                interventionRows,
                "&#128737;",
                "No interventions recorded"
            );

            // --- Anomaly rules table ---
            var ruleRows = "";
            var ruleModals = "";
            var ruleCount = 0;

            if (anomalyData?.TryGetProperty("rules", out var rulesArr) == true)
            {
                foreach (var r in rulesArr.EnumerateArray())
                {
                    ruleCount++;
                    var id = Str(r, "id");
                    var name = Str(r, "name");
                    var condition = Str(r, "condition");
                    var action = Str(r, "action");
                    if (string.IsNullOrEmpty(action)) action = "alert";
                    var threshold = Str(r, "threshold");

                    var modalId = $"delete-anomaly-{Esc(id)}";
                    var deleteBtn = $"<button class='btn btn-sm btn-danger' onclick=\"document.getElementById('{modalId}').classList.add('open')\">Delete</button>";
                    ruleModals += Modal(modalId, "Delete Anomaly Rule",
                        $"<p>Are you sure you want to delete rule <strong>{Esc(name)}</strong>?</p>",
                        $"/anomaly-rules/{Esc(id)}/delete",
                        "Delete", "btn-danger");

                    ruleRows += $@"<tr>
                        <td><strong>{Esc(name)}</strong></td>
                        <td>{Esc(condition)}</td>
                        <td>{StatusBadge(action)}</td>
                        <td>{Esc(string.IsNullOrEmpty(threshold) ? "-" : threshold)}</td>
                        <td>{deleteBtn}</td>
                    </tr>";
                }
            }

            var anomalyTable = Table(
                new[] { "Name", "Condition", "Action", "Threshold", "Actions" },
                ruleRows,
                "&#128270;",
                "No anomaly rules configured"
            );

            var html = $@"<div class='page-header'>
                <h1>Guardrails</h1>
                <p>Agent interventions and anomaly detection rules</p>
            </div>

            <div class='card'>
                <h3>Pause Agent</h3>
                <form method='POST' action='/guardrails'>
                    <div class='form-row'>
                        <div class='form-group'>
                            <label>Agent ID</label>
                            <input type='text' name='agentId' required placeholder='e.g. agent-abc123'>
                        </div>
                        <div class='form-group'>
                            <label>Reason</label>
                            <input type='text' name='reason' placeholder='e.g. Suspicious activity detected'>
                        </div>
                    </div>
                    <button class='btn btn-primary' type='submit'>Pause Agent</button>
                </form>
            </div>

            <div class='card'>
                <h3>Create Anomaly Rule</h3>
                <form method='POST' action='/anomaly-rules/create'>
                    <div class='form-row'>
                        <div class='form-group'>
                            <label>Name</label>
                            <input type='text' name='name' required placeholder='e.g. High volume alert'>
                        </div>
                        <div class='form-group'>
                            <label>Condition</label>
                            <input type='text' name='condition' required placeholder='e.g. messages_per_hour > 100'>
                        </div>
                    </div>
                    <div class='form-row'>
                        <div class='form-group'>
                            <label>Action</label>
                            <input type='text' name='action' value='alert' placeholder='alert / pause / kill'>
                        </div>
                        <div class='form-group'>
                            <label>Threshold</label>
                            <input type='text' name='threshold' placeholder='e.g. 100'>
                        </div>
                    </div>
                    <button class='btn btn-primary' type='submit'>Create Rule</button>
                </form>
            </div>

            <div class='card'>
                <h3>Interventions ({interventionCount})</h3>
                {interventionsTable}
            </div>

            <div class='card'>
                <h3>Anomaly Rules ({ruleCount})</h3>
                {anomalyTable}
            </div>
            {interventionModals}
            {ruleModals}";

            return Results.Content(Page(ctx, "/guardrails", html), "text/html");
        });

        // POST /guardrails - pause an agent
        app.MapPost("/guardrails", async (HttpContext ctx, ApiClient api) =>
        {
            var form = await ctx.Request.ReadFormAsync();
            var agentId = form["agentId"].ToString();
            var (data, statusCode) = await api.PostAsync(ctx, $"/engine/guardrails/pause/{agentId}", new
            {
                agentId,
                reason = form["reason"].ToString()
            });

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Agent paused", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to pause agent";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/guardrails");
        });

        // POST /guardrails/resume/{id} - resume agent
        app.MapPost("/guardrails/resume/{id}", async (string id, HttpContext ctx, ApiClient api) =>
        {
            var (data, statusCode) = await api.PostAsync(ctx, $"/engine/guardrails/resume/{id}");

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Agent resumed", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to resume agent";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/guardrails");
        });

        // POST /guardrails/kill/{id} - kill agent
        app.MapPost("/guardrails/kill/{id}", async (string id, HttpContext ctx, ApiClient api) =>
        {
            var (data, statusCode) = await api.PostAsync(ctx, $"/engine/guardrails/kill/{id}");

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Agent killed", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to kill agent";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/guardrails");
        });

        // POST /anomaly-rules/create - create anomaly rule
        app.MapPost("/anomaly-rules/create", async (HttpContext ctx, ApiClient api) =>
        {
            var form = await ctx.Request.ReadFormAsync();
            var (data, statusCode) = await api.PostAsync(ctx, "/engine/anomaly-rules", new
            {
                name = form["name"].ToString(),
                condition = form["condition"].ToString(),
                action = form["action"].ToString(),
                threshold = form["threshold"].ToString()
            });

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Anomaly rule created", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to create anomaly rule";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/guardrails");
        });

        // POST /anomaly-rules/{id}/delete - delete anomaly rule
        app.MapPost("/anomaly-rules/{id}/delete", async (string id, HttpContext ctx, ApiClient api) =>
        {
            var (data, statusCode) = await api.DeleteAsync(ctx, $"/engine/anomaly-rules/{id}");

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Anomaly rule deleted", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to delete anomaly rule";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/guardrails");
        });
    }
}
