using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;

namespace AgenticMailDashboard.Routes;

public static class SkillConnectionRoutes
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/skill-connections", (HttpContext ctx) =>
        {
            var html = @"<div class='page-header'>
                <h1>Skill Connections</h1>
                <p>Visualize and manage relationships between skills</p>
            </div>

            <style>
            .connection-type{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)}
            .connection-type:last-child{border-bottom:none}
            .connection-indicator{width:12px;height:12px;border-radius:3px;flex-shrink:0}
            .connection-depends{background:#06b6d4}
            .connection-enhances{background:var(--success)}
            .connection-conflicts{background:var(--warning)}
            </style>

            <div style='margin-bottom:20px'>
                <button class='btn btn-primary'>+ Create Connection</button>
                <button class='btn' style='margin-left:10px'>View Network</button>
            </div>

            <div class='card'>
                <h3>Skill Network Overview</h3>
                <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#128279;</div>No skill connections configured<br><small>Create connections between skills to enable complex workflows</small></div>
            </div>

            <div style='display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px'>
                <div class='card'>
                    <h3>Connection Types</h3>
                    <div class='connection-type'><span class='connection-indicator connection-depends'></span><span>Dependencies</span><span class='badge' style='margin-left:auto'>0</span></div>
                    <div class='connection-type'><span class='connection-indicator connection-enhances'></span><span>Enhancements</span><span class='badge' style='margin-left:auto'>0</span></div>
                    <div class='connection-type'><span class='connection-indicator connection-conflicts'></span><span>Conflicts</span><span class='badge' style='margin-left:auto'>0</span></div>
                </div>
                <div class='card'>
                    <h3>Recent Changes</h3>
                    <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#128203;</div>No recent changes<br><small>Connection updates will appear here</small></div>
                </div>
            </div>";

            return Results.Content(Page(ctx, "/skill-connections", html), "text/html");
        });
    }
}
