using System.Text.Json;
using AgenticMailDashboard.Services;
using static AgenticMailDashboard.Services.HtmlBuilder;
using static AgenticMailDashboard.Services.ApiClient;

namespace AgenticMailDashboard.Routes;

public static class MessageRoutes
{
    public static void Map(WebApplication app)
    {
        // GET /messages - list messages with send form
        app.MapGet("/messages", async (HttpContext ctx, ApiClient api) =>
        {
            var data = await api.GetAsync(ctx, "/engine/messages?orgId=default");

            var rows = "";
            var count = 0;

            if (data?.TryGetProperty("messages", out var arr) == true)
            {
                foreach (var m in arr.EnumerateArray())
                {
                    count++;
                    var id = Str(m, "id");

                    var type = Str(m, "type");
                    if (string.IsNullOrEmpty(type)) type = "email";

                    var from = Str(m, "from");
                    if (string.IsNullOrEmpty(from)) from = Str(m, "from_addr");
                    if (string.IsNullOrEmpty(from)) from = "-";

                    var to = Str(m, "to");
                    if (string.IsNullOrEmpty(to)) to = Str(m, "to_addr");
                    if (string.IsNullOrEmpty(to)) to = "-";

                    var subject = Str(m, "subject");
                    if (string.IsNullOrEmpty(subject)) subject = "(no subject)";
                    if (subject.Length > 60) subject = subject[..60] + "...";

                    var priority = Str(m, "priority");
                    if (string.IsNullOrEmpty(priority)) priority = "normal";

                    var direction = Str(m, "direction");
                    if (string.IsNullOrEmpty(direction)) direction = "inbound";
                    var dirVariant = direction.ToLower() switch
                    {
                        "inbound" => "primary",
                        "outbound" => "success",
                        "internal" => "default",
                        _ => "default"
                    };

                    var channel = Str(m, "channel");
                    if (string.IsNullOrEmpty(channel)) channel = "email";
                    var chanVariant = channel.ToLower() switch
                    {
                        "email" => "primary",
                        "api" => "warning",
                        "internal" => "default",
                        "webhook" => "info",
                        _ => "default"
                    };

                    var status = Str(m, "status");
                    if (string.IsNullOrEmpty(status)) status = "sent";

                    var ts = Str(m, "created_at");
                    if (string.IsNullOrEmpty(ts)) ts = Str(m, "timestamp");

                    rows += $@"<tr>
                        <td>{Badge(type, "default")}</td>
                        <td>{Esc(from)}</td>
                        <td>{Esc(to)}</td>
                        <td><strong>{Esc(subject)}</strong></td>
                        <td>{Badge(direction, dirVariant)}</td>
                        <td>{Badge(channel, chanVariant)}</td>
                        <td>{Badge(priority, priority == "high" ? "danger" : priority == "low" ? "default" : "warning")}</td>
                        <td>{StatusBadge(status)}</td>
                        <td style='color:var(--text-muted)'>{TimeAgo(ts)}</td>
                    </tr>";
                }
            }

            var table = Table(
                new[] { "Type", "From", "To", "Subject", "Direction", "Channel", "Priority", "Status", "Time" },
                rows,
                "&#9993;&#65039;",
                "No messages yet"
            );

            var html = $@"<div class='page-header'>
                <h1>Messages</h1>
                <p>View and send messages through the platform</p>
            </div>

            <div class='card'>
                <h3>Send Message</h3>
                <form method='POST' action='/messages'>
                    <div class='form-row'>
                        <div class='form-group'>
                            <label>From</label>
                            <input type='text' name='from_addr' required placeholder='e.g. agent@company.com'>
                        </div>
                        <div class='form-group'>
                            <label>To</label>
                            <input type='text' name='to_addr' required placeholder='e.g. user@example.com'>
                        </div>
                    </div>
                    <div class='form-group'>
                        <label>Subject</label>
                        <input type='text' name='subject' required placeholder='Message subject'>
                    </div>
                    <div class='form-group'>
                        <label>Body</label>
                        <input type='text' name='body' placeholder='Message body'>
                    </div>
                    <div class='form-row'>
                        <div class='form-group'>
                            <label>Type</label>
                            <input type='text' name='type' value='email' placeholder='email / sms / chat'>
                        </div>
                        <div class='form-group'>
                            <label>Priority</label>
                            <input type='text' name='priority' value='normal' placeholder='high / normal / low'>
                        </div>
                    </div>
                    <button class='btn btn-primary' type='submit'>Send Message</button>
                </form>
            </div>

            <div class='card'>
                <h3>All Messages ({count})</h3>
                {table}
            </div>";

            return Results.Content(Page(ctx, "/messages", html), "text/html");
        });

        // POST /messages - send a message
        app.MapPost("/messages", async (HttpContext ctx, ApiClient api) =>
        {
            var form = await ctx.Request.ReadFormAsync();
            var (data, statusCode) = await api.PostAsync(ctx, "/engine/messages", new
            {
                type = form["type"].ToString(),
                from = form["from_addr"].ToString(),
                to = form["to_addr"].ToString(),
                subject = form["subject"].ToString(),
                body = form["body"].ToString(),
                priority = form["priority"].ToString()
            });

            if (statusCode > 0 && statusCode < 300)
                SetFlash(ctx, "Message sent", "success");
            else
            {
                var error = data != null ? Str(data, "error") : "Failed";
                if (string.IsNullOrEmpty(error)) error = "Failed to send message";
                SetFlash(ctx, error, "danger");
            }

            return Results.Redirect("/messages");
        });
    }
}
