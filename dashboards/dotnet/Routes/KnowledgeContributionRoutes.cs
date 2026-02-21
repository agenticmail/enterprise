using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;

namespace AgenticMailDashboard.Routes;

public static class KnowledgeContributionRoutes
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/knowledge-contributions", (HttpContext ctx) =>
        {
            var html = @"<div class='page-header'>
                <h1>Knowledge Hub</h1>
                <p>Share knowledge and learn from the community</p>
            </div>

            <div style='margin-bottom:20px'>
                <button class='btn btn-primary'>Community</button>
                <button class='btn'>My Contributions</button>
                <button class='btn'>Bookmarks</button>
            </div>

            <div class='card'>
                <h3>Featured Knowledge</h3>
                <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#127775;</div>No featured knowledge available<br><small>Community-shared knowledge will appear here</small></div>
            </div>

            <div style='display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-top:20px'>
                <div class='card'>
                    <h3>Latest Contributions</h3>
                    <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#128221;</div>No contributions yet<br><small>Recent knowledge contributions will appear here</small></div>
                </div>
                <div class='card'>
                    <h3>Trending Topics</h3>
                    <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#128293;</div>No trending topics<br><small>Popular knowledge topics will appear here</small></div>
                </div>
            </div>";

            return Results.Content(Page(ctx, "/knowledge-contributions", html), "text/html");
        });
    }
}
