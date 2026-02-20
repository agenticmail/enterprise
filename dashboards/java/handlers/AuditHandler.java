/**
 * AuditHandler — Paginated audit event log.
 * Route: GET /audit?page=N
 *
 * NEW: Created from scratch (not in original monolithic file).
 */

import com.sun.net.httpserver.*;
import java.io.*;
import java.util.*;

public class AuditHandler implements HttpHandler {

    private static final int LIMIT = 25;

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            String token = SessionManager.getToken(ex);
            String query = ex.getRequestURI().getQuery();
            int page = Helpers.queryInt(query, "page", 1);
            if (page < 1) page = 1;
            int offset = (page - 1) * LIMIT;

            var data = ApiClient.get("/api/audit?limit=" + LIMIT + "&offset=" + offset, token);

            List<Map<String, Object>> events = Helpers.listVal(data, "events");
            if (events.isEmpty()) {
                events = Helpers.listVal(data, "_raw");
            }

            int total = Helpers.intVal(data, "total");
            if (total == 0) total = events.size();

            StringBuilder html = new StringBuilder();
            html.append(Components.pageHeader("Audit Log", "Security and activity event history"));

            html.append(Components.cardStart(""));
            // Remove the empty h3 that cardStart adds
            String cardContent = html.toString();
            html = new StringBuilder(cardContent.replace("<h3></h3>", ""));

            if (events.isEmpty()) {
                html.append(Components.empty("&#128220;", "No audit events recorded"));
            } else {
                html.append(Components.tableStart("Event", "Actor", "Resource", "IP Address", "Time"));
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

                    String ip = Helpers.strVal(ev, "ip");
                    if (ip.isEmpty()) ip = Helpers.strVal(ev, "ip_address");
                    if (ip.isEmpty()) ip = "-";

                    String time = Helpers.strVal(ev, "created_at");
                    if (time.isEmpty()) time = Helpers.strVal(ev, "timestamp");

                    html.append("<tr>");
                    html.append("<td>").append(Helpers.esc(action)).append("</td>");
                    html.append("<td>").append(Helpers.esc(actor)).append("</td>");
                    html.append("<td>").append(Helpers.esc(resource)).append("</td>");
                    html.append("<td style='color:var(--text-muted)'><code>").append(Helpers.esc(ip)).append("</code></td>");
                    html.append("<td style='color:var(--text-muted)'>").append(Helpers.timeAgo(time)).append("</td>");
                    html.append("</tr>");
                }
                html.append(Components.tableEnd());

                // Pagination
                html.append(Components.pagination("/audit", page, LIMIT, total, events.size()));
            }
            html.append(Components.cardEnd());

            String flash = SessionManager.consumeFlash(ex);
            SessionManager.respond(ex, 200, Layout.layout("/audit", SessionManager.getUser(ex), flash, html.toString()));

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }
}
