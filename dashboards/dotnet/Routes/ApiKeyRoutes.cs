using System.Text.Json;
using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;
using static AgenticMailDashboard.Services.ApiClient;

namespace AgenticMailDashboard.Routes;

public static class ApiKeyRoutes
{
    public static void Map(WebApplication app)
    {
        // GET /api-keys - list keys with create form
        app.MapGet("/api-keys", async (HttpContext ctx, ApiClient api) =>
        {
            var data = await api.GetAsync(ctx, "/api/api-keys");

            // Check for show-once key banner (stored in session after creation)
            var createdKey = ctx.Session.GetString("created_api_key");
            var keyBanner = "";
            if (!string.IsNullOrEmpty(createdKey))
            {
                ctx.Session.Remove("created_api_key");
                keyBanner = $@"<div class='key-banner'>
                    <strong>New API key created!</strong> Copy it now -- you won't see it again.
                    <code>{Esc(createdKey)}</code>
                </div>";
            }

            var rows = "";
            var modals = "";
            var count = 0;

            if (data?.TryGetProperty("keys", out var arr) == true ||
                data?.TryGetProperty("api_keys", out arr) == true)
            {
                foreach (var k in arr.EnumerateArray())
                {
                    count++;
                    var id = Str(k, "id");
                    var name = Str(k, "name");
                    var prefix = Str(k, "prefix");
                    if (string.IsNullOrEmpty(prefix)) prefix = Str(k, "key_prefix");
                    if (string.IsNullOrEmpty(prefix)) prefix = Str(k, "keyPrefix");
                    if (string.IsNullOrEmpty(prefix))
                    {
                        var fullKey = Str(k, "key");
                        if (!string.IsNullOrEmpty(fullKey) && fullKey.Length > 12)
                            prefix = fullKey[..12];
                    }

                    // Scopes
                    var scopesHtml = "";
                    if (k.TryGetProperty("scopes", out var scopesEl) && scopesEl.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var s in scopesEl.EnumerateArray())
                            scopesHtml += Badge(s.GetString(), "default") + " ";
                    }
                    if (string.IsNullOrEmpty(scopesHtml)) scopesHtml = "<span style='color:var(--text-muted)'>-</span>";

                    var status = Str(k, "status");
                    if (string.IsNullOrEmpty(status))
                    {
                        var revoked = k.TryGetProperty("revoked", out var rev) && rev.ValueKind == JsonValueKind.True;
                        status = revoked ? "revoked" : "active";
                    }

                    var createdAt = Str(k, "created_at");

                    var revokeBtn = "";
                    if (status.ToLower() != "revoked")
                    {
                        var modalId = $"revoke-key-{Esc(id)}";
                        revokeBtn = $"<button class='btn btn-sm btn-danger' onclick=\"document.getElementById('{modalId}').classList.add('open')\">Revoke</button>";
                        modals += Modal(modalId, "Revoke API Key",
                            $"<p>Are you sure you want to revoke <strong>{Esc(name)}</strong>? This cannot be undone.</p>",
                            $"/api-keys/{Esc(id)}/revoke",
                            "Revoke", "btn-danger");
                    }

                    rows += $@"<tr>
                        <td><strong>{Esc(string.IsNullOrEmpty(name) ? "-" : name)}</strong></td>
                        <td><code>{Esc(string.IsNullOrEmpty(prefix) ? "-" : prefix)}...</code></td>
                        <td>{scopesHtml}</td>
                        <td>{StatusBadge(status)}</td>
                        <td style='color:var(--text-muted)'>{TimeAgo(createdAt)}</td>
                        <td>{revokeBtn}</td>
                    </tr>";
                }
            }

            var table = Table(
                new[] { "Name", "Key Prefix", "Scopes", "Status", "Created", "Actions" },
                rows,
                "&#128273;",
                "No API keys. Generate one above."
            );

            var html = $@"<div class='page-header'>
                <h1>API Keys</h1>
                <p>Manage programmatic access credentials</p>
            </div>

            {keyBanner}

            <div class='card'>
                <h3>Create API Key</h3>
                <form method='POST' action='/api-keys'>
                    <div class='form-row'>
                        <div class='form-group'>
                            <label>Name</label>
                            <input type='text' name='name' required placeholder='e.g. Production Key'>
                        </div>
                        <div class='form-group'>
                            <label>Scopes (comma separated)</label>
                            <input type='text' name='scopes' placeholder='e.g. agents:read, messages:write'>
                        </div>
                    </div>
                    <button class='btn btn-primary' type='submit'>Generate Key</button>
                </form>
            </div>

            <div class='card'>
                <h3>Active Keys ({count})</h3>
                {table}
            </div>
            {modals}";

            return Results.Content(Page(ctx, "/api-keys", html), "text/html");
        });

        // POST /api-keys - create key
        app.MapPost("/api-keys", async (HttpContext ctx, ApiClient api) =>
        {
            var form = await ctx.Request.ReadFormAsync();
            var scopesRaw = form["scopes"].ToString();
            var scopes = scopesRaw
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToArray();

            var (data, statusCode) = await api.PostAsync(ctx, "/api/api-keys", new
            {
                name = form["name"].ToString(),
                scopes
            });

            if (statusCode > 0 && statusCode < 300)
            {
                // Extract the key value for show-once banner
                var key = data != null ? Str(data, "key") : "";
                if (string.IsNullOrEmpty(key) && data != null) key = Str(data, "api_key");
                if (string.IsNullOrEmpty(key) && data != null) key = Str(data, "token");

                if (!string.IsNullOrEmpty(key))
                    ctx.Session.SetString("created_api_key", key);

                SetFlash(ctx, "API key created", "success");
            }
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to create API key";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/api-keys");
        });

        // POST /api-keys/{id}/revoke - revoke key
        app.MapPost("/api-keys/{id}/revoke", async (string id, HttpContext ctx, ApiClient api) =>
        {
            var (data, statusCode) = await api.DeleteAsync(ctx, $"/api/api-keys/{id}");

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Key revoked", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to revoke key";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/api-keys");
        });
    }
}
