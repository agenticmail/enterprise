using System.Text.Json;
using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;
using static AgenticMailDashboard.Services.ApiClient;

namespace AgenticMailDashboard.Routes;

public static class DlpRoutes
{
    public static void Map(WebApplication app)
    {
        // GET /dlp - list DLP rules and violations
        app.MapGet("/dlp", async (HttpContext ctx, ApiClient api) =>
        {
            var rulesData = await api.GetAsync(ctx, "/engine/dlp/rules?orgId=default");
            var violationsData = await api.GetAsync(ctx, "/engine/dlp/violations?orgId=default");

            // --- Rules table ---
            var ruleRows = "";
            var ruleModals = "";
            var ruleCount = 0;

            if (rulesData?.TryGetProperty("rules", out var rulesArr) == true)
            {
                foreach (var r in rulesArr.EnumerateArray())
                {
                    ruleCount++;
                    var id = Str(r, "id");
                    var name = Str(r, "name");
                    var type = Str(r, "type");
                    var pattern = Str(r, "pattern");
                    var action = Str(r, "action");
                    var severity = Str(r, "severity");
                    if (string.IsNullOrEmpty(severity)) severity = "high";

                    var modalId = $"delete-rule-{Esc(id)}";
                    var deleteBtn = $"<button class='btn btn-sm btn-danger' onclick=\"document.getElementById('{modalId}').classList.add('open')\">Delete</button>";
                    ruleModals += Modal(modalId, "Delete DLP Rule",
                        $"<p>Are you sure you want to delete rule <strong>{Esc(name)}</strong>?</p>",
                        $"/dlp/rules/{Esc(id)}/delete",
                        "Delete", "btn-danger");

                    ruleRows += $@"<tr>
                        <td><strong>{Esc(name)}</strong></td>
                        <td><code>{Esc(type)}</code></td>
                        <td><code>{Esc(pattern)}</code></td>
                        <td>{StatusBadge(action)}</td>
                        <td>{Badge(severity, severity == "high" ? "danger" : severity == "medium" ? "warning" : "default")}</td>
                        <td>{deleteBtn}</td>
                    </tr>";
                }
            }

            var rulesTable = Table(
                new[] { "Name", "Type", "Pattern", "Action", "Severity", "Actions" },
                ruleRows,
                "&#128737;",
                "No DLP rules configured"
            );

            // --- Violations table ---
            var violationRows = "";
            var violationCount = 0;

            if (violationsData?.TryGetProperty("violations", out var violArr) == true)
            {
                foreach (var v in violArr.EnumerateArray())
                {
                    violationCount++;
                    var ruleName = Str(v, "rule_name");
                    if (string.IsNullOrEmpty(ruleName)) ruleName = Str(v, "ruleName");
                    if (string.IsNullOrEmpty(ruleName)) ruleName = Str(v, "rule");
                    if (string.IsNullOrEmpty(ruleName)) ruleName = "-";

                    var severity = Str(v, "severity");
                    if (string.IsNullOrEmpty(severity)) severity = "high";

                    var content = Str(v, "content");
                    if (string.IsNullOrEmpty(content)) content = Str(v, "matched_content");
                    if (content.Length > 60) content = content[..60] + "...";

                    var ts = Str(v, "created_at");
                    if (string.IsNullOrEmpty(ts)) ts = Str(v, "timestamp");

                    violationRows += $@"<tr>
                        <td>{Esc(ruleName)}</td>
                        <td>{Badge(severity, severity == "high" ? "danger" : severity == "medium" ? "warning" : "default")}</td>
                        <td><code>{Esc(content)}</code></td>
                        <td style='color:var(--text-muted)'>{TimeAgo(ts)}</td>
                    </tr>";
                }
            }

            var violationsTable = Table(
                new[] { "Rule", "Severity", "Content", "Time" },
                violationRows,
                "&#9888;&#65039;",
                "No violations detected"
            );

            var html = $@"<div class='page-header'>
                <h1>Data Loss Prevention</h1>
                <p>Manage DLP rules and monitor violations</p>
            </div>

            <div class='card'>
                <h3>Create DLP Rule</h3>
                <form method='POST' action='/dlp'>
                    <div class='form-row'>
                        <div class='form-group'>
                            <label>Name</label>
                            <input type='text' name='name' required placeholder='e.g. Block SSN'>
                        </div>
                        <div class='form-group'>
                            <label>Type</label>
                            <input type='text' name='type' required placeholder='e.g. regex'>
                        </div>
                    </div>
                    <div class='form-group'>
                        <label>Pattern</label>
                        <input type='text' name='pattern' required placeholder='e.g. \d{{3}}-\d{{2}}-\d{{4}}'>
                    </div>
                    <div class='form-row'>
                        <div class='form-group'>
                            <label>Action</label>
                            <input type='text' name='action' value='block' placeholder='block / alert / redact'>
                        </div>
                        <div class='form-group'>
                            <label>Severity</label>
                            <input type='text' name='severity' value='high' placeholder='high / medium / low'>
                        </div>
                    </div>
                    <button class='btn btn-primary' type='submit'>Create Rule</button>
                </form>
            </div>

            <div class='card'>
                <h3>Scan Content</h3>
                <form method='POST' action='/dlp/scan'>
                    <div class='form-group'>
                        <label>Content to Scan</label>
                        <input type='text' name='content' required placeholder='Paste text to scan for DLP violations'>
                    </div>
                    <button class='btn btn-primary' type='submit'>Scan</button>
                </form>
            </div>

            <div class='card'>
                <h3>DLP Rules ({ruleCount})</h3>
                {rulesTable}
            </div>

            <div class='card'>
                <h3>Violations ({violationCount})</h3>
                {violationsTable}
            </div>
            {ruleModals}";

            return Results.Content(Page(ctx, "/dlp", html), "text/html");
        });

        // POST /dlp - create DLP rule
        app.MapPost("/dlp", async (HttpContext ctx, ApiClient api) =>
        {
            var form = await ctx.Request.ReadFormAsync();
            var (data, statusCode) = await api.PostAsync(ctx, "/engine/dlp/rules", new
            {
                name = form["name"].ToString(),
                type = form["type"].ToString(),
                pattern = form["pattern"].ToString(),
                action = form["action"].ToString(),
                severity = form["severity"].ToString()
            });

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "DLP rule created", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to create DLP rule";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/dlp");
        });

        // POST /dlp/rules/{id}/delete - delete DLP rule
        app.MapPost("/dlp/rules/{id}/delete", async (string id, HttpContext ctx, ApiClient api) =>
        {
            var (data, statusCode) = await api.DeleteAsync(ctx, $"/engine/dlp/rules/{id}");

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "DLP rule deleted", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to delete DLP rule";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/dlp");
        });

        // POST /dlp/scan - scan content
        app.MapPost("/dlp/scan", async (HttpContext ctx, ApiClient api) =>
        {
            var form = await ctx.Request.ReadFormAsync();
            var (data, statusCode) = await api.PostAsync(ctx, "/engine/dlp/scan", new
            {
                content = form["content"].ToString()
            });

            if (statusCode > 0 && statusCode < 300)
            {
                var count = 0;
                if (data?.TryGetProperty("violations", out var vArr) == true)
                    count = vArr.GetArrayLength();
                SetFlash(ctx, $"Scan complete - {count} violation(s) found", "success");
            }
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to scan content";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/dlp");
        });
    }
}
