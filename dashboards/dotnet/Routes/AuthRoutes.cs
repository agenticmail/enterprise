using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;
using static AgenticMailDashboard.Services.ApiClient;

namespace AgenticMailDashboard.Routes;

public static class AuthRoutes
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/login", (HttpContext ctx) =>
        {
            if (ctx.Session.GetString("token") != null)
                return Results.Redirect("/");
            return Results.Content(LoginPage(), "text/html");
        });

        app.MapPost("/login", async (HttpContext ctx, ApiClient api) =>
        {
            var form = await ctx.Request.ReadFormAsync();
            var email = form["email"].ToString();
            var password = form["password"].ToString();

            var (data, statusCode) = await api.PostAsync(ctx, "/auth/login",
                new { email, password });

            if (statusCode >= 200 && statusCode < 300 &&
                data?.TryGetProperty("token", out var tok) == true)
            {
                ctx.Session.SetString("token", tok.ToString());
                if (data?.TryGetProperty("user", out var u) == true)
                {
                    ctx.Session.SetString("userName", Str(u, "name"));
                    ctx.Session.SetString("userEmail", Str(u, "email"));
                }
                return Results.Redirect("/");
            }

            var error = data != null ? Str(data, "error") : "Login failed";
            if (string.IsNullOrEmpty(error)) error = "Invalid credentials";
            return Results.Content(LoginPage(error), "text/html");
        });

        app.MapGet("/logout", (HttpContext ctx) =>
        {
            ctx.Session.Clear();
            return Results.Redirect("/login");
        });
    }
}
