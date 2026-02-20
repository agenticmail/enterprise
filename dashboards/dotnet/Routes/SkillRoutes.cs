using System.Text.Json;
using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;
using static AgenticMailDashboard.Services.ApiClient;

namespace AgenticMailDashboard.Routes;

public static class SkillRoutes
{
    public static void Map(WebApplication app)
    {
        // GET /skills - list builtin and installed community skills
        app.MapGet("/skills", async (HttpContext ctx, ApiClient api) =>
        {
            var builtinData = await api.GetAsync(ctx, "/api/engine/skills/by-category");
            var installedData = await api.GetAsync(ctx, "/api/engine/community/installed?orgId=default");

            // Builtin skills grid
            var builtinCards = "";
            var hasBuiltin = false;

            // Try categories map first
            if (builtinData?.TryGetProperty("categories", out var catEl) == true &&
                catEl.ValueKind == JsonValueKind.Object)
            {
                foreach (var cat in catEl.EnumerateObject())
                {
                    var catName = cat.Name;
                    if (cat.Value.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var skill in cat.Value.EnumerateArray())
                        {
                            var name = Str(skill, "name");
                            var desc = Str(skill, "description");
                            if (string.IsNullOrEmpty(desc)) desc = "No description";
                            builtinCards += $@"<div style='background:var(--bg-secondary,#f8f9fa);border:1px solid var(--border);border-radius:8px;padding:16px'>
                                <div style='display:flex;justify-content:space-between;align-items:start;margin-bottom:8px'>
                                    <strong style='font-size:13px'>{Esc(name)}</strong>
                                    {Badge(catName, "default")}
                                </div>
                                <div style='font-size:12px;color:var(--text-muted);line-height:1.5'>{Esc(desc)}</div>
                            </div>";
                            hasBuiltin = true;
                        }
                    }
                }
            }

            // Fallback: try flat skills array
            if (!hasBuiltin && builtinData?.TryGetProperty("skills", out var skillsArr) == true)
            {
                foreach (var skill in skillsArr.EnumerateArray())
                {
                    var name = Str(skill, "name");
                    var desc = Str(skill, "description");
                    var category = Str(skill, "category");
                    if (string.IsNullOrEmpty(desc)) desc = "No description";
                    if (string.IsNullOrEmpty(category)) category = "general";
                    builtinCards += $@"<div style='background:var(--bg-secondary,#f8f9fa);border:1px solid var(--border);border-radius:8px;padding:16px'>
                        <div style='display:flex;justify-content:space-between;align-items:start;margin-bottom:8px'>
                            <strong style='font-size:13px'>{Esc(name)}</strong>
                            {Badge(category, "default")}
                        </div>
                        <div style='font-size:12px;color:var(--text-muted);line-height:1.5'>{Esc(desc)}</div>
                    </div>";
                    hasBuiltin = true;
                }
            }

            var builtinHtml = hasBuiltin
                ? $"<div style='display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px'>{builtinCards}</div>"
                : "<div class='empty'><span class='icon'>&#9889;</span>No builtin skills available</div>";

            // Installed community skills table
            var installedRows = "";
            var installedModals = "";
            var installedCount = 0;

            JsonElement? installedArr = null;
            if (installedData?.TryGetProperty("skills", out var iArr) == true)
                installedArr = iArr;
            else if (installedData?.TryGetProperty("installed", out var iArr2) == true)
                installedArr = iArr2;

            if (installedArr != null && installedArr.Value.ValueKind == JsonValueKind.Array)
            {
                foreach (var s in installedArr.Value.EnumerateArray())
                {
                    installedCount++;
                    var id = Str(s, "id");
                    var name = Str(s, "name");
                    var desc = Str(s, "description");
                    if (string.IsNullOrEmpty(desc)) desc = "-";
                    var status = Str(s, "status");
                    if (string.IsNullOrEmpty(status)) status = "enabled";

                    var toggleAction = status.ToLower() == "disabled" ? "enable" : "disable";
                    var toggleLabel = status.ToLower() == "disabled" ? "Enable" : "Disable";

                    var uninstallModalId = $"uninstall-skill-{Esc(id)}";
                    var uninstallBtn = $"<button class='btn btn-sm btn-danger' onclick=\"document.getElementById('{uninstallModalId}').classList.add('open')\">Uninstall</button>";
                    installedModals += Modal(uninstallModalId, "Uninstall Skill",
                        $"<p>Are you sure you want to uninstall <strong>{Esc(name)}</strong>?</p>",
                        $"/skills/{Esc(id)}/uninstall",
                        "Uninstall", "btn-danger");

                    installedRows += $@"<tr>
                        <td><strong>{Esc(name)}</strong></td>
                        <td style='font-size:12px;color:var(--text-muted)'>{Esc(desc)}</td>
                        <td>{StatusBadge(status)}</td>
                        <td style='display:flex;gap:6px'>
                            <form method='POST' action='/skills/{Esc(id)}/{toggleAction}' style='display:inline'>
                                <button class='btn btn-sm' type='submit'>{toggleLabel}</button>
                            </form>
                            {uninstallBtn}
                        </td>
                    </tr>";
                }
            }

            var installedTable = Table(
                new[] { "Name", "Description", "Status", "Actions" },
                installedRows,
                "&#128230;",
                "No community skills installed"
            );

            var html = $@"<div class='page-header'>
                <h1>Skills</h1>
                <p>Manage builtin and community skills for your agents</p>
            </div>

            <div class='card'>
                <h3>Builtin Skills</h3>
                {builtinHtml}
            </div>

            <div class='card'>
                <h3>Installed Community Skills ({installedCount})</h3>
                {installedTable}
            </div>
            {installedModals}";

            return Results.Content(Page(ctx, "/skills", html), "text/html");
        });

        // POST /skills/{id}/enable - enable skill
        app.MapPost("/skills/{id}/enable", async (string id, HttpContext ctx, ApiClient api) =>
        {
            var (data, statusCode) = await api.PutAsync(ctx, $"/api/engine/community/skills/{id}/enable", new { orgId = "default" });

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Skill enabled", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to enable skill";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/skills");
        });

        // POST /skills/{id}/disable - disable skill
        app.MapPost("/skills/{id}/disable", async (string id, HttpContext ctx, ApiClient api) =>
        {
            var (data, statusCode) = await api.PutAsync(ctx, $"/api/engine/community/skills/{id}/disable", new { orgId = "default" });

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Skill disabled", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to disable skill";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/skills");
        });

        // POST /skills/{id}/uninstall - uninstall skill
        app.MapPost("/skills/{id}/uninstall", async (string id, HttpContext ctx, ApiClient api) =>
        {
            var (data, statusCode) = await api.DeleteAsync(ctx, $"/api/engine/community/skills/{id}/uninstall");

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Skill uninstalled", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to uninstall skill";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/skills");
        });
    }
}
