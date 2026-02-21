using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;

namespace AgenticMailDashboard.Routes;

public static class DomainStatusRoutes
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/domain-status", (HttpContext ctx) =>
        {
            var html = @"<div class='page-header'>
                <h1>Domain Status</h1>
                <p>Monitor domain configuration and security status</p>
            </div>

            <style>
            .status-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
            .status-item{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)}
            .status-item:last-child{border-bottom:none}
            .status-indicator{width:8px;height:8px;border-radius:50%;flex-shrink:0}
            .status-success{background:var(--success)}
            .status-warning{background:var(--warning)}
            </style>

            <div class='status-grid'>
                <div class='card'>
                    <h3>Domain Configuration</h3>
                    <div class='status-item'><span class='status-indicator status-success'></span><span>Domain connected</span></div>
                    <div class='status-item'><span class='status-indicator status-success'></span><span>DNS configured</span></div>
                    <div class='status-item'><span class='status-indicator status-success'></span><span>SSL certificate valid</span></div>
                </div>
                <div class='card'>
                    <h3>Security Status</h3>
                    <div class='status-item'><span class='status-indicator status-success'></span><span>DKIM configured</span></div>
                    <div class='status-item'><span class='status-indicator status-success'></span><span>SPF record valid</span></div>
                    <div class='status-item'><span class='status-indicator status-warning'></span><span>DMARC recommended</span></div>
                </div>
            </div>

            <div class='card'>
                <h3>Domain Health Monitoring</h3>
                <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#128200;</div>Domain monitoring dashboard<br><small>Real-time domain health metrics will appear here</small></div>
            </div>";

            return Results.Content(Page(ctx, "/domain-status", html), "text/html");
        });
    }
}
