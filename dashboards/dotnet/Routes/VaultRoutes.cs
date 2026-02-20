using System.Text.Json;
using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;
using static AgenticMailDashboard.Services.ApiClient;

namespace AgenticMailDashboard.Routes;

public static class VaultRoutes
{
    public static void Map(WebApplication app)
    {
        // GET /vault - list secrets
        app.MapGet("/vault", async (HttpContext ctx, ApiClient api) =>
        {
            var data = await api.GetAsync(ctx, "/api/engine/vault/secrets?orgId=default");

            var rows = "";
            var modals = "";
            var count = 0;

            if (data?.TryGetProperty("secrets", out var arr) == true)
            {
                foreach (var s in arr.EnumerateArray())
                {
                    count++;
                    var id = Str(s, "id");
                    var name = Str(s, "name");
                    var category = Str(s, "category");
                    if (string.IsNullOrEmpty(category)) category = "general";
                    var createdBy = Str(s, "created_by");
                    if (string.IsNullOrEmpty(createdBy)) createdBy = Str(s, "createdBy");
                    if (string.IsNullOrEmpty(createdBy)) createdBy = "-";
                    var created = Str(s, "created_at");
                    if (string.IsNullOrEmpty(created)) created = Str(s, "createdAt");

                    var deleteModalId = $"delete-secret-{Esc(id)}";
                    var deleteBtn = $"<button class='btn btn-sm btn-danger' onclick=\"document.getElementById('{deleteModalId}').classList.add('open')\">Delete</button>";
                    modals += Modal(deleteModalId, "Delete Secret",
                        $"<p>Are you sure you want to delete secret <strong>{Esc(name)}</strong>?</p>",
                        $"/vault/{Esc(id)}/delete",
                        "Delete", "btn-danger");

                    rows += $@"<tr>
                        <td><strong>{Esc(name)}</strong></td>
                        <td>{StatusBadge(category)}</td>
                        <td style='color:var(--text-muted)'>{Esc(createdBy)}</td>
                        <td style='color:var(--text-muted)'>{TimeAgo(created)}</td>
                        <td style='display:flex;gap:6px'>
                            <form method='POST' action='/vault/{Esc(id)}/rotate' style='display:inline'><button class='btn btn-sm' type='submit'>Rotate</button></form>
                            {deleteBtn}
                        </td>
                    </tr>";
                }
            }

            var table = Table(
                new[] { "Name", "Category", "Created By", "Created", "Actions" },
                rows,
                "&#128272;",
                "No secrets stored yet. Add one above."
            );

            var html = $@"<div class='page-header'>
                <h1>Vault</h1>
                <p>Manage secrets and sensitive credentials</p>
            </div>

            <div class='card'>
                <h3>Add Secret</h3>
                <form method='POST' action='/vault'>
                    <div class='form-row'>
                        <div class='form-group'>
                            <label>Name</label>
                            <input type='text' name='name' required placeholder='e.g. OPENAI_API_KEY'>
                        </div>
                        <div class='form-group'>
                            <label>Category</label>
                            <select name='category'>
                                <option value='api_key'>API Key</option>
                                <option value='credential'>Credential</option>
                                <option value='certificate'>Certificate</option>
                                <option value='token'>Token</option>
                                <option value='general'>General</option>
                            </select>
                        </div>
                    </div>
                    <div class='form-group'>
                        <label>Value</label>
                        <input type='password' name='value' required placeholder='Secret value'>
                    </div>
                    <button class='btn btn-primary' type='submit'>Add Secret</button>
                </form>
            </div>

            <div class='card'>
                <h3>Secrets ({count})</h3>
                {table}
            </div>
            {modals}";

            return Results.Content(Page(ctx, "/vault", html), "text/html");
        });

        // POST /vault - add secret
        app.MapPost("/vault", async (HttpContext ctx, ApiClient api) =>
        {
            var form = await ctx.Request.ReadFormAsync();
            var (data, statusCode) = await api.PostAsync(ctx, "/api/engine/vault/secrets", new
            {
                orgId = "default",
                name = form["name"].ToString(),
                value = form["value"].ToString(),
                category = form["category"].ToString()
            });

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Secret added", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to add secret";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/vault");
        });

        // POST /vault/{id}/delete - delete secret
        app.MapPost("/vault/{id}/delete", async (string id, HttpContext ctx, ApiClient api) =>
        {
            var (data, statusCode) = await api.DeleteAsync(ctx, $"/api/engine/vault/secrets/{id}");

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Secret deleted", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to delete secret";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/vault");
        });

        // POST /vault/{id}/rotate - rotate secret
        app.MapPost("/vault/{id}/rotate", async (string id, HttpContext ctx, ApiClient api) =>
        {
            var (data, statusCode) = await api.PostAsync(ctx, $"/api/engine/vault/secrets/{id}/rotate");

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Secret rotated", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to rotate secret";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/vault");
        });
    }
}
