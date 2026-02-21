using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;

namespace AgenticMailDashboard.Routes;

public static class KnowledgeRoutes
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/knowledge", (HttpContext ctx) =>
        {
            var html = @"<div class='page-header'>
                <h1>Knowledge Bases</h1>
                <p>Manage and organize knowledge bases for your agents</p>
            </div>

            <div style='margin-bottom:20px'>
                <button class='btn btn-primary'>+ Create Knowledge Base</button>
            </div>

            <div class='card'>
                <h3>Active Knowledge Bases</h3>
                <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#128218;</div>No knowledge bases created<br><small>Create your first knowledge base to get started</small></div>
            </div>

            <div style='display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px'>
                <div class='card'>
                    <h3>Recent Activity</h3>
                    <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#128200;</div>No recent activity</div>
                </div>
                <div class='card'>
                    <h3>Knowledge Stats</h3>
                    <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#128202;</div>No statistics available</div>
                </div>
            </div>";

            return Results.Content(Page(ctx, "/knowledge", html), "text/html");
        });
    }
}
