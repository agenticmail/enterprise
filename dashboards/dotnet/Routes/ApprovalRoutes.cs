using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;

namespace AgenticMailDashboard.Routes;

public static class ApprovalRoutes
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/approvals", (HttpContext ctx) =>
        {
            var html = @"<div class='page-header'>
                <h1>Approvals</h1>
                <p>Review and manage pending approval requests</p>
            </div>

            <div style='margin-bottom:20px'>
                <button class='btn btn-primary'>Pending</button>
                <button class='btn'>Approved</button>
                <button class='btn'>Rejected</button>
            </div>

            <div class='card'>
                <h3>Pending Approvals</h3>
                <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#9989;</div>No pending approvals<br><small>Agent approval requests will appear here</small></div>
            </div>

            <div class='card'>
                <h3>Approval History</h3>
                <div class='empty-state'><div style='font-size:36px;margin-bottom:10px'>&#128203;</div>No approval history<br><small>Past approvals and rejections will appear here</small></div>
            </div>";

            return Results.Content(Page(ctx, "/approvals", html), "text/html");
        });
    }
}
