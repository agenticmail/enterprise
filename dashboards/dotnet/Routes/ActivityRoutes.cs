using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;

namespace AgenticMailDashboard.Routes;

public static class ActivityRoutes
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/activity", (HttpContext ctx) =>
        {
            var html = @"<div class='page-header'>
                <h1>Activity</h1>
                <p>Real-time activity and tool usage across all agents</p>
            </div>

            <div style='margin-bottom:20px'>
                <button class='btn btn-primary' onclick=""location.href='#events'"">Events</button>
                <button class='btn' onclick=""location.href='#tools'"">Tool Calls</button>
            </div>

            <div class='card'>
                <h3>Recent Events</h3>
                <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#128203;</div>No events recorded<br><small>Agent activity will appear here</small></div>
            </div>

            <div class='card'>
                <h3>Tool Usage</h3>
                <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#128295;</div>No tool calls recorded<br><small>Tool usage statistics will appear here</small></div>
            </div>";

            return Results.Content(Page(ctx, "/activity", html), "text/html");
        });
    }
}
