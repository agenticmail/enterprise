/**
 * DashboardHandler — Stats overview + recent audit events.
 */

import com.sun.net.httpserver.*;
import java.io.*;
import java.util.*;

public class DashboardHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            String token = SessionManager.getToken(ex);
            var stats = ApiClient.get("/api/stats", token);
            var audit = ApiClient.get("/api/audit?limit=8", token);

            // Build stat cards
            int totalAgents = Helpers.intVal(stats, "totalAgents");
            if (totalAgents == 0) totalAgents = Helpers.intVal(stats, "agents");
            if (totalAgents == 0) totalAgents = Helpers.intVal(stats, "total_agents");

            int activeAgents = Helpers.intVal(stats, "activeAgents");

            int totalUsers = Helpers.intVal(stats, "totalUsers");
            if (totalUsers == 0) totalUsers = Helpers.intVal(stats, "users");
            if (totalUsers == 0) totalUsers = Helpers.intVal(stats, "total_users");

            int totalAudit = Helpers.intVal(stats, "totalAuditEvents");
            if (totalAudit == 0) totalAudit = Helpers.intVal(stats, "messages_today");
            if (totalAudit == 0) totalAudit = Helpers.intVal(stats, "messages");

            int apiKeys = Helpers.intVal(stats, "api_keys");
            if (apiKeys == 0) apiKeys = Helpers.intVal(stats, "total_api_keys");

            StringBuilder html = new StringBuilder();
            html.append(Components.pageHeader("Dashboard", "Overview of your AgenticMail Enterprise instance"));

            html.append("<div class='stats-grid'>");
            html.append(Components.statCard("Total Agents", totalAgents, true));
            html.append(Components.statCard("Active Agents", activeAgents > 0 ? activeAgents : totalUsers));
            html.append(Components.statCard("Total Users", totalUsers));
            html.append(Components.statCard("API Keys", apiKeys > 0 ? apiKeys : totalAudit));
            html.append("</div>");

            // Recent audit events
            List<Map<String, Object>> events = Helpers.listVal(audit, "events");
            if (events.isEmpty()) {
                // Try alternate key
                events = Helpers.listVal(audit, "_raw");
            }

            html.append(Components.cardStart("Recent Audit Events"));
            if (events.isEmpty()) {
                html.append(Components.empty("&#128220;", "No recent audit events"));
            } else {
                html.append(Components.tableStart("Event", "Actor", "Resource", "Time"));
                for (var ev : events) {
                    String action = Helpers.strVal(ev, "action");
                    if (action.isEmpty()) action = Helpers.strVal(ev, "event");
                    if (action.isEmpty()) action = "unknown";

                    String actor = Helpers.strVal(ev, "actor");
                    if (actor.isEmpty()) actor = Helpers.strVal(ev, "user");
                    if (actor.isEmpty()) actor = Helpers.strVal(ev, "email");
                    if (actor.isEmpty()) actor = "-";

                    String resource = Helpers.strVal(ev, "resource");
                    if (resource.isEmpty()) resource = Helpers.strVal(ev, "target");
                    if (resource.isEmpty()) resource = "-";

                    String time = Helpers.strVal(ev, "created_at");
                    if (time.isEmpty()) time = Helpers.strVal(ev, "timestamp");

                    html.append("<tr>");
                    html.append("<td>").append(Helpers.esc(action)).append("</td>");
                    html.append("<td>").append(Helpers.esc(actor)).append("</td>");
                    html.append("<td>").append(Helpers.esc(resource)).append("</td>");
                    html.append("<td style='color:var(--text-muted)'>").append(Helpers.timeAgo(time)).append("</td>");
                    html.append("</tr>");
                }
                html.append(Components.tableEnd());
            }
            html.append(Components.cardEnd());

            String flash = SessionManager.consumeFlash(ex);
            SessionManager.respond(ex, 200, Layout.layout("/", SessionManager.getUser(ex), flash, html.toString()));

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }
}
