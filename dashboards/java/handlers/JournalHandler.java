/**
 * JournalHandler — Agent action journal: entries, stats, rollback.
 * Routes: GET /journal, POST /journal (action: rollback)
 */

import com.sun.net.httpserver.*;
import java.io.*;
import java.util.*;

public class JournalHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            String method = ex.getRequestMethod();

            // POST /journal (rollback)
            if ("POST".equals(method)) {
                handleRollback(ex);
                return;
            }

            // GET /journal (list entries + stats)
            handleList(ex);

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }

    private void handleRollback(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);
        Map<String, String> form = SessionManager.parseForm(ex);
        String entryId = form.getOrDefault("entry_id", "");

        var result = ApiClient.post("/engine/journal/" + entryId + "/rollback", token, "{}");
        int status = Helpers.intVal(result, "_status");

        if (status > 0 && status < 300) {
            SessionManager.setFlash(ex, "Action rolled back successfully", "success");
        } else {
            String err = Helpers.strVal(result, "error");
            if (err.isEmpty()) err = "Failed to rollback action";
            SessionManager.setFlash(ex, err, "danger");
        }

        SessionManager.redirect(ex, "/journal");
    }

    private void handleList(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);

        var entriesData = ApiClient.get("/engine/journal", token);
        var statsData = ApiClient.get("/engine/journal/stats/default", token);

        List<Map<String, Object>> entries = Helpers.listVal(entriesData, "entries");
        if (entries.isEmpty()) {
            entries = Helpers.listVal(entriesData, "_raw");
        }

        StringBuilder html = new StringBuilder();
        html.append(Components.pageHeader("Journal", "Agent action journal and rollback history"));

        // Stats row
        int totalActions = Helpers.intVal(statsData, "total_actions");
        if (totalActions == 0) totalActions = Helpers.intVal(statsData, "total");
        if (totalActions == 0) totalActions = entries.size();
        int rollbacks = Helpers.intVal(statsData, "rollbacks");
        int pendingActions = Helpers.intVal(statsData, "pending");
        int failedActions = Helpers.intVal(statsData, "failed");

        html.append("<div class='stats-row'>");
        html.append(Components.statCard("Total Actions", totalActions));
        html.append(Components.statCard("Rollbacks", rollbacks));
        html.append(Components.statCard("Pending", pendingActions));
        html.append(Components.statCard("Failed", failedActions, failedActions > 0));
        html.append("</div>");

        // Journal entries
        html.append(Components.cardStart("Journal Entries (" + entries.size() + ")"));
        if (entries.isEmpty()) {
            html.append(Components.empty("&#128214;", "No journal entries recorded."));
        } else {
            html.append(Components.tableStart("Agent", "Action", "Target", "Status", "Time", "Actions"));
            for (var e : entries) {
                String agent = Helpers.strVal(e, "agent_name");
                if (agent.isEmpty()) agent = Helpers.strVal(e, "agent_id");
                if (agent.isEmpty()) agent = "-";
                String action = Helpers.strVal(e, "action");
                if (action.isEmpty()) action = Helpers.strVal(e, "type");
                if (action.isEmpty()) action = "-";
                String target = Helpers.strVal(e, "target");
                if (target.isEmpty()) target = Helpers.strVal(e, "resource");
                if (target.isEmpty()) target = "-";
                String entryStatus = Helpers.strVal(e, "status");
                if (entryStatus.isEmpty()) entryStatus = "completed";
                String time = Helpers.strVal(e, "created_at");
                if (time.isEmpty()) time = Helpers.strVal(e, "timestamp");
                String id = Helpers.strVal(e, "id");
                boolean canRollback = !"rolled_back".equalsIgnoreCase(entryStatus) && !"rollback".equalsIgnoreCase(action);

                html.append("<tr>");
                html.append("<td><strong>").append(Helpers.esc(agent)).append("</strong></td>");
                html.append("<td>").append(Helpers.esc(action)).append("</td>");
                html.append("<td><code>").append(Helpers.esc(target)).append("</code></td>");
                html.append("<td>").append(Components.statusBadge(entryStatus)).append("</td>");
                html.append("<td style='color:var(--text-muted)'>").append(Helpers.timeAgo(time)).append("</td>");
                html.append("<td>");
                if (canRollback && !id.isEmpty()) {
                    html.append("<form method='POST' action='/journal' style='display:inline' onsubmit=\"return confirm('Rollback this action? This will undo the agent action.')\">");
                    html.append("<input type='hidden' name='entry_id' value='").append(Helpers.esc(id)).append("'>");
                    html.append("<button class='btn btn-sm btn-danger' type='submit'>Rollback</button>");
                    html.append("</form>");
                }
                html.append("</td>");
                html.append("</tr>");
            }
            html.append(Components.tableEnd());
        }
        html.append(Components.cardEnd());

        String flash = SessionManager.consumeFlash(ex);
        SessionManager.respond(ex, 200, Layout.layout("/journal", SessionManager.getUser(ex), flash, html.toString()));
    }
}
