using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;

namespace AgenticMailDashboard.Routes;

public static class CommunitySkillRoutes
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/community-skills", (HttpContext ctx) =>
        {
            var html = @"<div class='page-header'>
                <h1>Community Skills</h1>
                <p>Browse and install skills shared by the community</p>
            </div>

            <div class='card'>
                <h3>Featured Skills</h3>
                <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#127978;</div>No community skills available<br><small>Community-shared skills will appear here</small></div>
            </div>

            <div style='display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px'>
                <div class='card'>
                    <h3>Popular Categories</h3>
                    <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#127991;&#65039;</div>No categories</div>
                </div>
                <div class='card'>
                    <h3>My Contributions</h3>
                    <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#128228;</div>No contributions</div>
                </div>
            </div>";

            return Results.Content(Page(ctx, "/community-skills", html), "text/html");
        });
    }
}
