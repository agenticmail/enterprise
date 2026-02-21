using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;

namespace AgenticMailDashboard.Routes;

public static class WorkforceRoutes
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/workforce", (HttpContext ctx) =>
        {
            var html = @"<div class='page-header'>
                <h1>Workforce</h1>
                <p>Monitor agent schedules, workloads, and availability</p>
            </div>

            <style>
            .stat-card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:20px;text-align:center}
            .stat-icon{font-size:24px;margin-bottom:8px}
            .stat-value{font-size:24px;font-weight:700;color:var(--primary);margin-bottom:4px}
            .stat-label{font-size:13px;color:var(--text-muted)}
            </style>

            <div style='display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-bottom:20px'>
                <div class='stat-card'><div class='stat-icon'>&#129302;</div><div class='stat-value'>0</div><div class='stat-label'>Active Agents</div></div>
                <div class='stat-card'><div class='stat-icon'>&#9203;</div><div class='stat-value'>0</div><div class='stat-label'>Pending Tasks</div></div>
                <div class='stat-card'><div class='stat-icon'>&#128202;</div><div class='stat-value'>0%</div><div class='stat-label'>Utilization</div></div>
            </div>

            <div style='margin-bottom:20px'>
                <button class='btn btn-primary'>Schedule</button>
                <button class='btn'>Workload</button>
                <button class='btn'>Analytics</button>
            </div>

            <div class='card'>
                <h3>Agent Schedule</h3>
                <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#128336;</div>No scheduled tasks<br><small>Agent schedules and time allocations will appear here</small></div>
            </div>

            <div style='display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-top:20px'>
                <div class='card'>
                    <h3>Workload Distribution</h3>
                    <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#9878;&#65039;</div>No workload data<br><small>Agent workload distribution will appear here</small></div>
                </div>
                <div class='card'>
                    <h3>Performance Metrics</h3>
                    <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#128200;</div>No metrics available<br><small>Performance analytics will appear here</small></div>
                </div>
            </div>";

            return Results.Content(Page(ctx, "/workforce", html), "text/html");
        });
    }
}
