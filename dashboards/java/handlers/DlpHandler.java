/**
 * DlpHandler — Data Loss Prevention rules and violations.
 * Routes: GET /dlp, POST /dlp (actions: create_rule, delete_rule, scan)
 */

import com.sun.net.httpserver.*;
import java.io.*;
import java.util.*;

public class DlpHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            String method = ex.getRequestMethod();

            // POST /dlp (create_rule, delete_rule, scan)
            if ("POST".equals(method)) {
                handlePost(ex);
                return;
            }

            // GET /dlp (list rules + violations)
            handleList(ex);

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }

    private void handlePost(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);
        Map<String, String> form = SessionManager.parseForm(ex);
        String action = form.getOrDefault("action", "");

        if ("create_rule".equals(action)) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("name", form.getOrDefault("name", ""));
            body.put("pattern", form.getOrDefault("pattern", ""));
            body.put("severity", form.getOrDefault("severity", "medium"));
            body.put("description", form.getOrDefault("description", ""));

            var result = ApiClient.post("/engine/dlp/rules", token, ApiClient.toJsonMixed(body));
            int status = Helpers.intVal(result, "_status");

            if (status > 0 && status < 300) {
                SessionManager.setFlash(ex, "DLP rule created successfully", "success");
            } else {
                String err = Helpers.strVal(result, "error");
                if (err.isEmpty()) err = "Failed to create DLP rule";
                SessionManager.setFlash(ex, err, "danger");
            }

        } else if ("delete_rule".equals(action)) {
            String ruleId = form.getOrDefault("rule_id", "");

            var result = ApiClient.delete("/engine/dlp/rules/" + ruleId, token);
            int status = Helpers.intVal(result, "_status");

            if (status > 0 && status < 300) {
                SessionManager.setFlash(ex, "DLP rule deleted", "success");
            } else {
                String err = Helpers.strVal(result, "error");
                if (err.isEmpty()) err = "Failed to delete DLP rule";
                SessionManager.setFlash(ex, err, "danger");
            }

        } else if ("scan".equals(action)) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("orgId", form.getOrDefault("orgId", "default"));

            var result = ApiClient.post("/engine/dlp/scan", token, ApiClient.toJsonMixed(body));
            int status = Helpers.intVal(result, "_status");

            if (status > 0 && status < 300) {
                SessionManager.setFlash(ex, "DLP scan initiated", "success");
            } else {
                String err = Helpers.strVal(result, "error");
                if (err.isEmpty()) err = "Failed to initiate DLP scan";
                SessionManager.setFlash(ex, err, "danger");
            }
        }

        SessionManager.redirect(ex, "/dlp");
    }

    private void handleList(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);

        // Fetch rules and violations in sequence
        var rulesData = ApiClient.get("/engine/dlp/rules?orgId=default", token);
        var violationsData = ApiClient.get("/engine/dlp/violations", token);

        List<Map<String, Object>> rules = Helpers.listVal(rulesData, "rules");
        if (rules.isEmpty()) {
            rules = Helpers.listVal(rulesData, "_raw");
        }

        List<Map<String, Object>> violations = Helpers.listVal(violationsData, "violations");
        if (violations.isEmpty()) {
            violations = Helpers.listVal(violationsData, "_raw");
        }

        StringBuilder html = new StringBuilder();
        html.append(Components.pageHeader("Data Loss Prevention", "Manage DLP rules and review policy violations"));

        // Stats row
        int activeRules = 0;
        for (var r : rules) {
            String s = Helpers.strVal(r, "status");
            if (s.isEmpty() || "active".equalsIgnoreCase(s) || "enabled".equalsIgnoreCase(s)) activeRules++;
        }
        html.append("<div class='stats-row'>");
        html.append(Components.statCard("Total Rules", rules.size()));
        html.append(Components.statCard("Active Rules", activeRules));
        html.append(Components.statCard("Violations", violations.size(), violations.size() > 0));
        html.append("</div>");

        // Scan form
        html.append(Components.cardStart("Run DLP Scan"));
        html.append("<form method='POST' action='/dlp'>");
        html.append("<input type='hidden' name='action' value='scan'>");
        html.append("<input type='hidden' name='orgId' value='default'>");
        html.append("<p style='color:var(--text-muted);margin-bottom:12px'>Scan all messages for DLP policy violations.</p>");
        html.append("<button class='btn btn-primary' type='submit'>Start Scan</button>");
        html.append("</form>");
        html.append(Components.cardEnd());

        // Create rule form
        html.append(Components.cardStart("Create DLP Rule"));
        html.append("<form method='POST' action='/dlp'>");
        html.append("<input type='hidden' name='action' value='create_rule'>");
        html.append("<div class='form-row'>");
        html.append("<div class='form-group'><label>Rule Name</label>");
        html.append("<input type='text' name='name' required placeholder='e.g. Credit Card Detection'></div>");
        html.append("<div class='form-group'><label>Severity</label>");
        html.append("<select name='severity'><option value='low'>Low</option><option value='medium' selected>Medium</option><option value='high'>High</option><option value='critical'>Critical</option></select></div>");
        html.append("</div>");
        html.append("<div class='form-group'><label>Pattern (regex)</label>");
        html.append("<input type='text' name='pattern' required placeholder='e.g. \\d{4}-\\d{4}-\\d{4}-\\d{4}'></div>");
        html.append("<div class='form-group'><label>Description</label>");
        html.append("<input type='text' name='description' placeholder='What does this rule detect?'></div>");
        html.append("<button class='btn btn-primary' type='submit'>Create Rule</button>");
        html.append("</form>");
        html.append(Components.cardEnd());

        // Rules list
        html.append(Components.cardStart("DLP Rules (" + rules.size() + ")"));
        if (rules.isEmpty()) {
            html.append(Components.empty("&#128274;", "No DLP rules configured. Create one above."));
        } else {
            html.append(Components.tableStart("Name", "Pattern", "Severity", "Status", "Actions"));
            for (var r : rules) {
                String name = Helpers.strVal(r, "name");
                if (name.isEmpty()) name = "-";
                String pattern = Helpers.strVal(r, "pattern");
                if (pattern.isEmpty()) pattern = "-";
                String severity = Helpers.strVal(r, "severity");
                if (severity.isEmpty()) severity = "medium";
                String ruleStatus = Helpers.strVal(r, "status");
                if (ruleStatus.isEmpty()) ruleStatus = "active";
                String id = Helpers.strVal(r, "id");

                html.append("<tr>");
                html.append("<td><strong>").append(Helpers.esc(name)).append("</strong></td>");
                html.append("<td><code>").append(Helpers.esc(pattern)).append("</code></td>");
                html.append("<td>").append(Components.badge(severity, severityVariant(severity))).append("</td>");
                html.append("<td>").append(Components.statusBadge(ruleStatus)).append("</td>");
                html.append("<td>");
                html.append("<form method='POST' action='/dlp' style='display:inline' onsubmit=\"return confirm('Delete this DLP rule?')\">");
                html.append("<input type='hidden' name='action' value='delete_rule'>");
                html.append("<input type='hidden' name='rule_id' value='").append(Helpers.esc(id)).append("'>");
                html.append("<button class='btn btn-sm btn-danger' type='submit'>Delete</button>");
                html.append("</form>");
                html.append("</td>");
                html.append("</tr>");
            }
            html.append(Components.tableEnd());
        }
        html.append(Components.cardEnd());

        // Violations list
        html.append(Components.cardStart("Recent Violations (" + violations.size() + ")"));
        if (violations.isEmpty()) {
            html.append(Components.empty("&#9989;", "No DLP violations detected."));
        } else {
            html.append(Components.tableStart("Rule", "Message", "Severity", "Detected At"));
            for (var v : violations) {
                String rule = Helpers.strVal(v, "rule_name");
                if (rule.isEmpty()) rule = Helpers.strVal(v, "rule");
                if (rule.isEmpty()) rule = "-";
                String message = Helpers.strVal(v, "message");
                if (message.isEmpty()) message = Helpers.strVal(v, "details");
                if (message.isEmpty()) message = "-";
                String severity = Helpers.strVal(v, "severity");
                if (severity.isEmpty()) severity = "medium";
                String detected = Helpers.strVal(v, "detected_at");
                if (detected.isEmpty()) detected = Helpers.strVal(v, "created_at");

                html.append("<tr>");
                html.append("<td><strong>").append(Helpers.esc(rule)).append("</strong></td>");
                html.append("<td>").append(Helpers.esc(message)).append("</td>");
                html.append("<td>").append(Components.badge(severity, severityVariant(severity))).append("</td>");
                html.append("<td style='color:var(--text-muted)'>").append(Helpers.timeAgo(detected)).append("</td>");
                html.append("</tr>");
            }
            html.append(Components.tableEnd());
        }
        html.append(Components.cardEnd());

        String flash = SessionManager.consumeFlash(ex);
        SessionManager.respond(ex, 200, Layout.layout("/dlp", SessionManager.getUser(ex), flash, html.toString()));
    }

    private static String severityVariant(String severity) {
        if (severity == null) return "default";
        switch (severity.toLowerCase()) {
            case "critical": return "danger";
            case "high": return "danger";
            case "medium": return "warning";
            case "low": return "success";
            default: return "default";
        }
    }
}
