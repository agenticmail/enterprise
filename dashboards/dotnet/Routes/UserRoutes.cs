using System.Text.Json;
using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;
using static AgenticMailDashboard.Services.ApiClient;

namespace AgenticMailDashboard.Routes;

public static class UserRoutes
{
    public static void Map(WebApplication app)
    {
        // GET /users - list all users with create form
        app.MapGet("/users", async (HttpContext ctx, ApiClient api) =>
        {
            var data = await api.GetAsync(ctx, "/api/users");

            var rows = "";
            var count = 0;

            if (data?.TryGetProperty("users", out var arr) == true)
            {
                foreach (var u in arr.EnumerateArray())
                {
                    count++;
                    var name = Str(u, "name");
                    var email = Str(u, "email");
                    var role = Str(u, "role");
                    if (string.IsNullOrEmpty(role)) role = "member";
                    var status = Str(u, "status");
                    if (string.IsNullOrEmpty(status)) status = "active";
                    var createdAt = Str(u, "created_at");

                    rows += $@"<tr>
                        <td><strong>{Esc(string.IsNullOrEmpty(name) ? "-" : name)}</strong></td>
                        <td>{Esc(string.IsNullOrEmpty(email) ? "-" : email)}</td>
                        <td>{Badge(role)}</td>
                        <td>{StatusBadge(status)}</td>
                        <td style='color:var(--text-muted)'>{TimeAgo(createdAt)}</td>
                    </tr>";
                }
            }

            var table = Table(
                new[] { "Name", "Email", "Role", "Status", "Joined" },
                rows,
                "&#128101;",
                "No users found"
            );

            var html = $@"<div class='page-header'>
                <h1>Users</h1>
                <p>Manage user accounts and roles</p>
            </div>

            <div class='card'>
                <h3>Invite User</h3>
                <form method='POST' action='/users'>
                    <div class='form-row'>
                        <div class='form-group'>
                            <label>Name</label>
                            <input type='text' name='name' required placeholder='Full name'>
                        </div>
                        <div class='form-group'>
                            <label>Email</label>
                            <input type='email' name='email' required placeholder='user@company.com'>
                        </div>
                    </div>
                    <div class='form-group'>
                        <label>Role</label>
                        <select name='role'>
                            <option value='member'>Member</option>
                            <option value='admin'>Admin</option>
                            <option value='viewer'>Viewer</option>
                        </select>
                    </div>
                    <button class='btn btn-primary' type='submit'>Create User</button>
                </form>
            </div>

            <div class='card'>
                <h3>All Users ({count})</h3>
                {table}
            </div>";

            return Results.Content(Page(ctx, "/users", html), "text/html");
        });

        // POST /users - create user
        app.MapPost("/users", async (HttpContext ctx, ApiClient api) =>
        {
            var form = await ctx.Request.ReadFormAsync();
            var (data, statusCode) = await api.PostAsync(ctx, "/api/users", new
            {
                name = form["name"].ToString(),
                email = form["email"].ToString(),
                role = form["role"].ToString()
            });

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "User created", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to create user";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/users");
        });
    }
}
