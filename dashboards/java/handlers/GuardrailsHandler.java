/**
 * GuardrailsHandler — Agent guardrails: interventions, anomaly rules, pause/resume/kill.
 * Routes: GET /guardrails, POST /guardrails (actions: pause, resume, kill, create_rule, delete_rule)
 */

import com.sun.net.httpserver.*;
import java.io.*;
import java.util.*;

public class GuardrailsHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            String method = ex.getRequestMethod();

            // POST /guardrails
            if ("POST".equals(method)) {
                handlePost(ex);
                return;
            }

            // GET /guardrails
            handleList(ex);

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }

    private void handlePost(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);
        Map<String, String> form = SessionManager.parseForm(ex);
        String action = form.getOrDefault("action", "");

        if ("pause".equals(action)) {
            String id = form.getOrDefault("agent_id", "");
            var result = ApiClient.post("/engine/guardrails/pause/" + id, token, "{}");
            int status = Helpers.intVal(result, "_status");

            if (status > 0 && status < 300) {
                SessionManager.setFlash(ex, "Agent paused successfully", "success");
            } else {
                String err = Helpers.strVal(result, "error");
                if (err.isEmpty()) err = "Failed to pause agent";
                SessionManager.setFlash(ex, err, "danger");
            }

        } else if ("resume".equals(action)) {
            String id = form.getOrDefault("agent_id", "");
            var result = ApiClient.post("/engine/guardrails/resume/" + id, token, "{}");
            int status = Helpers.intVal(result, "_status");

            if (status > 0 && status < 300) {
                SessionManager.setFlash(ex, "Agent resumed successfully", "success");
            } else {
                String err = Helpers.strVal(result, "error");
                if (err.isEmpty()) err = "Failed to resume agent";
                SessionManager.setFlash(ex, err, "danger");
            }

        } else if ("kill".equals(action)) {
            String id = form.getOrDefault("agent_id", "");
            var result = ApiClient.post("/engine/guardrails/kill/" + id, token, "{}");
            int status = Helpers.intVal(result, "_status");

            if (status > 0 && status < 300) {
                SessionManager.setFlash(ex, "Agent killed", "success");
            } else {
                String err = Helpers.strVal(result, "error");
                if (err.isEmpty()) err = "Failed to kill agent";
                SessionManager.setFlash(ex, err, "danger");
            }

        } else if ("create_rule".equals(action)) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("name", form.getOrDefault("name", ""));
            body.put("condition", form.getOrDefault("condition", ""));
            body.put("action", form.getOrDefault("rule_action", "pause"));
            body.put("threshold", form.getOrDefault("threshold", ""));
            body.put("description", form.getOrDefault("description", ""));

            var result = ApiClient.post("/engine/anomaly-rules", token, ApiClient.toJsonMixed(body));
            int status = Helpers.intVal(result, "_status");

            if (status > 0 && status < 300) {
                SessionManager.setFlash(ex, "Anomaly rule created", "success");
            } else {
                String err = Helpers.strVal(result, "error");
                if (err.isEmpty()) err = "Failed to create anomaly rule";
                SessionManager.setFlash(ex, err, "danger");
            }

        } else if ("delete_rule".equals(action)) {
            String ruleId = form.getOrDefault("rule_id", "");
            var result = ApiClient.delete("/engine/anomaly-rules/" + ruleId, token);
            int status = Helpers.intVal(result, "_status");

            if (status > 0 && status < 300) {
                SessionManager.setFlash(ex, "Anomaly rule deleted", "success");
            } else {
                String err = Helpers.strVal(result, "error");
                if (err.isEmpty()) err = "Failed to delete anomaly rule";
                SessionManager.setFlash(ex, err, "danger");
            }
        }

        SessionManager.redirect(ex, "/guardrails");
    }

    private void handleList(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);

        var interventionsData = ApiClient.get("/engine/guardrails/interventions", token);
        var rulesData = ApiClient.get("/engine/anomaly-rules", token);

        List<Map<String, Object>> interventions = Helpers.listVal(interventionsData, "interventions");
        if (interventions.isEmpty()) {
            interventions = Helpers.listVal(interventionsData, "_raw");
        }

        List<Map<String, Object>> rules = Helpers.listVal(rulesData, "rules");
        if (rules.isEmpty()) {
            rules = Helpers.listVal(rulesData, "_raw");
        }

        StringBuilder html = new StringBuilder();
        html.append(Components.pageHeader("Guardrails", "Monitor agent interventions and manage anomaly rules"));

        // Stats row
        int activeInterventions = 0;
        int pausedCount = 0;
        for (var i : interventions) {
            String s = Helpers.strVal(i, "status");
            if ("active".equalsIgnoreCase(s) || "triggered".equalsIgnoreCase(s)) activeInterventions++;
            if ("paused".equalsIgnoreCase(s)) pausedCount++;
        }
        html.append("<div class='stats-row'>");
        html.append(Components.statCard("Interventions", interventions.size()));
        html.append(Components.statCard("Active", activeInterventions, activeInterventions > 0));
        html.append(Components.statCard("Paused Agents", pausedCount));
        html.append(Components.statCard("Anomaly Rules", rules.size()));
        html.append("</div>");

        // Create anomaly rule form
        html.append(Components.cardStart("Create Anomaly Rule"));
        html.append("<form method='POST' action='/guardrails'>");
        html.append("<input type='hidden' name='action' value='create_rule'>");
        html.append("<div class='form-row'>");
        html.append("<div class='form-group'><label>Rule Name</label>");
        html.append("<input type='text' name='name' required placeholder='e.g. Rate Limit Exceeded'></div>");
        html.append("<div class='form-group'><label>Action</label>");
        html.append("<select name='rule_action'><option value='pause'>Pause Agent</option><option value='alert'>Alert Only</option><option value='kill'>Kill Agent</option></select></div>");
        html.append("</div>");
        html.append("<div class='form-row'>");
        html.append("<div class='form-group'><label>Condition</label>");
        html.append("<input type='text' name='condition' required placeholder='e.g. messages_per_minute > threshold'></div>");
        html.append("<div class='form-group'><label>Threshold</label>");
        html.append("<input type='text' name='threshold' placeholder='e.g. 100'></div>");
        html.append("</div>");
        html.append("<div class='form-group'><label>Description</label>");
        html.append("<input type='text' name='description' placeholder='When should this rule trigger?'></div>");
        html.append("<button class='btn btn-primary' type='submit'>Create Rule</button>");
        html.append("</form>");
        html.append(Components.cardEnd());

        // Anomaly rules list
        html.append(Components.cardStart("Anomaly Rules (" + rules.size() + ")"));
        if (rules.isEmpty()) {
            html.append(Components.empty("&#128208;", "No anomaly rules configured. Create one above."));
        } else {
            html.append(Components.tableStart("Name", "Condition", "Action", "Status", "Actions"));
            for (var r : rules) {
                String name = Helpers.strVal(r, "name");
                if (name.isEmpty()) name = "-";
                String condition = Helpers.strVal(r, "condition");
                if (condition.isEmpty()) condition = "-";
                String ruleAction = Helpers.strVal(r, "action");
                if (ruleAction.isEmpty()) ruleAction = "pause";
                String ruleStatus = Helpers.strVal(r, "status");
                if (ruleStatus.isEmpty()) ruleStatus = "active";
                String id = Helpers.strVal(r, "id");

                html.append("<tr>");
                html.append("<td><strong>").append(Helpers.esc(name)).append("</strong></td>");
                html.append("<td><code>").append(Helpers.esc(condition)).append("</code></td>");
                html.append("<td>").append(Components.badge(ruleAction, actionVariant(ruleAction))).append("</td>");
                html.append("<td>").append(Components.statusBadge(ruleStatus)).append("</td>");
                html.append("<td>");
                html.append("<form method='POST' action='/guardrails' style='display:inline' onsubmit=\"return confirm('Delete this anomaly rule?')\">");
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

        // Interventions list
        html.append(Components.cardStart("Interventions (" + interventions.size() + ")"));
        if (interventions.isEmpty()) {
            html.append(Components.empty("&#128737;", "No guardrail interventions recorded."));
        } else {
            html.append(Components.tableStart("Agent", "Reason", "Status", "Time", "Actions"));
            for (var i : interventions) {
                String agent = Helpers.strVal(i, "agent_name");
                if (agent.isEmpty()) agent = Helpers.strVal(i, "agent_id");
                if (agent.isEmpty()) agent = "-";
                String reason = Helpers.strVal(i, "reason");
                if (reason.isEmpty()) reason = Helpers.strVal(i, "description");
                if (reason.isEmpty()) reason = "-";
                String intStatus = Helpers.strVal(i, "status");
                if (intStatus.isEmpty()) intStatus = "active";
                String time = Helpers.strVal(i, "created_at");
                if (time.isEmpty()) time = Helpers.strVal(i, "timestamp");
                String agentId = Helpers.strVal(i, "agent_id");

                html.append("<tr>");
                html.append("<td><strong>").append(Helpers.esc(agent)).append("</strong></td>");
                html.append("<td>").append(Helpers.esc(reason)).append("</td>");
                html.append("<td>").append(Components.statusBadge(intStatus)).append("</td>");
                html.append("<td style='color:var(--text-muted)'>").append(Helpers.timeAgo(time)).append("</td>");
                html.append("<td>");
                if (!agentId.isEmpty()) {
                    if ("paused".equalsIgnoreCase(intStatus)) {
                        html.append("<form method='POST' action='/guardrails' style='display:inline'>");
                        html.append("<input type='hidden' name='action' value='resume'>");
                        html.append("<input type='hidden' name='agent_id' value='").append(Helpers.esc(agentId)).append("'>");
                        html.append("<button class='btn btn-sm btn-primary' type='submit'>Resume</button>");
                        html.append("</form> ");
                    } else if ("active".equalsIgnoreCase(intStatus) || "running".equalsIgnoreCase(intStatus)) {
                        html.append("<form method='POST' action='/guardrails' style='display:inline'>");
                        html.append("<input type='hidden' name='action' value='pause'>");
                        html.append("<input type='hidden' name='agent_id' value='").append(Helpers.esc(agentId)).append("'>");
                        html.append("<button class='btn btn-sm btn-primary' type='submit'>Pause</button>");
                        html.append("</form> ");
                    }
                    html.append("<form method='POST' action='/guardrails' style='display:inline' onsubmit=\"return confirm('Kill this agent? This cannot be undone.')\">");
                    html.append("<input type='hidden' name='action' value='kill'>");
                    html.append("<input type='hidden' name='agent_id' value='").append(Helpers.esc(agentId)).append("'>");
                    html.append("<button class='btn btn-sm btn-danger' type='submit'>Kill</button>");
                    html.append("</form>");
                }
                html.append("</td>");
                html.append("</tr>");
            }
            html.append(Components.tableEnd());
        }
        html.append(Components.cardEnd());

        String flash = SessionManager.consumeFlash(ex);
        SessionManager.respond(ex, 200, Layout.layout("/guardrails", SessionManager.getUser(ex), flash, html.toString()));
    }

    private static String actionVariant(String action) {
        if (action == null) return "default";
        switch (action.toLowerCase()) {
            case "kill": return "danger";
            case "pause": return "warning";
            case "alert": return "primary";
            default: return "default";
        }
    }
}
