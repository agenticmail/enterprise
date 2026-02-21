/**
 * ActivityHandler — Real-time activity and tool usage across all agents.
 * Routes: GET /activity
 */

import com.sun.net.httpserver.*;
import java.io.*;

public class ActivityHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            StringBuilder html = new StringBuilder();
            html.append(Components.pageHeader("Activity", "Real-time activity and tool usage across all agents"));

            html.append("<div style='margin-bottom:20px'>");
            html.append("<button class='btn btn-primary' onclick=\"location.href='#events'\">Events</button> ");
            html.append("<button class='btn' onclick=\"location.href='#tools'\">Tool Calls</button>");
            html.append("</div>");

            html.append(Components.cardStart("Recent Events"));
            html.append(Components.empty("&#128203;", "No events recorded<br><small>Agent activity will appear here</small>"));
            html.append(Components.cardEnd());

            html.append(Components.cardStart("Tool Usage"));
            html.append(Components.empty("&#128295;", "No tool calls recorded<br><small>Tool usage statistics will appear here</small>"));
            html.append(Components.cardEnd());

            String flash = SessionManager.consumeFlash(ex);
            SessionManager.respond(ex, 200, Layout.layout("/activity", SessionManager.getUser(ex), flash, html.toString()));

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }
}
