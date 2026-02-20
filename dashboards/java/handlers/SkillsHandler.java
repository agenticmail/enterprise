/**
 * SkillsHandler — Manage builtin and community skills.
 * Routes: GET /skills, POST /skills (actions: enable, disable, uninstall)
 */

import com.sun.net.httpserver.*;
import java.io.*;
import java.util.*;

public class SkillsHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            String method = ex.getRequestMethod();

            if ("POST".equals(method)) {
                handlePost(ex);
                return;
            }

            handleList(ex);

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }

    private void handlePost(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);
        Map<String, String> form = SessionManager.parseForm(ex);
        String action = form.getOrDefault("action", "");
        String skillId = form.getOrDefault("id", "");
        String body = "{\"orgId\":\"default\"}";

        if ("enable".equals(action)) {
            var result = ApiClient.put("/api/engine/community/skills/" + skillId + "/enable", token, body);
            int status = Helpers.intVal(result, "_status");
            if (status > 0 && status < 300) {
                SessionManager.setFlash(ex, "Skill enabled", "success");
            } else {
                String err = Helpers.strVal(result, "error");
                if (err.isEmpty()) err = "Failed to enable skill";
                SessionManager.setFlash(ex, err, "danger");
            }
        } else if ("disable".equals(action)) {
            var result = ApiClient.put("/api/engine/community/skills/" + skillId + "/disable", token, body);
            int status = Helpers.intVal(result, "_status");
            if (status > 0 && status < 300) {
                SessionManager.setFlash(ex, "Skill disabled", "success");
            } else {
                String err = Helpers.strVal(result, "error");
                if (err.isEmpty()) err = "Failed to disable skill";
                SessionManager.setFlash(ex, err, "danger");
            }
        } else if ("uninstall".equals(action)) {
            var result = ApiClient.delete("/api/engine/community/skills/" + skillId, token);
            int status = Helpers.intVal(result, "_status");
            if (status > 0 && status < 300) {
                SessionManager.setFlash(ex, "Skill uninstalled", "success");
            } else {
                String err = Helpers.strVal(result, "error");
                if (err.isEmpty()) err = "Failed to uninstall skill";
                SessionManager.setFlash(ex, err, "danger");
            }
        }

        SessionManager.redirect(ex, "/skills");
    }

    @SuppressWarnings("unchecked")
    private void handleList(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);

        var builtinData = ApiClient.get("/api/engine/skills/by-category", token);
        var installedData = ApiClient.get("/api/engine/community/installed?orgId=default", token);

        StringBuilder html = new StringBuilder();
        html.append(Components.pageHeader("Skills", "Manage builtin and community skills for your agents"));

        // Builtin skills grid
        html.append(Components.cardStart("Builtin Skills"));
        boolean hasBuiltin = false;

        // Try categories map first
        Map<String, Object> categories = Helpers.mapVal(builtinData, "categories");
        if (!categories.isEmpty()) {
            html.append("<div style='display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px'>");
            for (var entry : categories.entrySet()) {
                String catName = entry.getKey();
                if (entry.getValue() instanceof List) {
                    for (Object sk : (List<?>) entry.getValue()) {
                        if (sk instanceof Map) {
                            Map<String, Object> skill = (Map<String, Object>) sk;
                            String name = Helpers.strVal(skill, "name");
                            String desc = Helpers.strVal(skill, "description");
                            if (desc.isEmpty()) desc = "No description";
                            html.append("<div style='background:var(--bg-secondary,#f8f9fa);border:1px solid var(--border);border-radius:8px;padding:16px'>");
                            html.append("<div style='display:flex;justify-content:space-between;align-items:start;margin-bottom:8px'>");
                            html.append("<strong style='font-size:13px'>").append(Helpers.esc(name)).append("</strong>");
                            html.append(Components.badge(catName, "default"));
                            html.append("</div>");
                            html.append("<div style='font-size:12px;color:var(--text-muted);line-height:1.5'>").append(Helpers.esc(desc)).append("</div>");
                            html.append("</div>");
                            hasBuiltin = true;
                        }
                    }
                }
            }
            html.append("</div>");
        }

        // Fallback: try flat skills array
        if (!hasBuiltin) {
            List<Map<String, Object>> skills = Helpers.listVal(builtinData, "skills");
            if (!skills.isEmpty()) {
                html.append("<div style='display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px'>");
                for (var skill : skills) {
                    String name = Helpers.strVal(skill, "name");
                    String desc = Helpers.strVal(skill, "description");
                    String category = Helpers.strVal(skill, "category");
                    if (desc.isEmpty()) desc = "No description";
                    if (category.isEmpty()) category = "general";
                    html.append("<div style='background:var(--bg-secondary,#f8f9fa);border:1px solid var(--border);border-radius:8px;padding:16px'>");
                    html.append("<div style='display:flex;justify-content:space-between;align-items:start;margin-bottom:8px'>");
                    html.append("<strong style='font-size:13px'>").append(Helpers.esc(name)).append("</strong>");
                    html.append(Components.badge(category, "default"));
                    html.append("</div>");
                    html.append("<div style='font-size:12px;color:var(--text-muted);line-height:1.5'>").append(Helpers.esc(desc)).append("</div>");
                    html.append("</div>");
                    hasBuiltin = true;
                }
                html.append("</div>");
            }
        }

        if (!hasBuiltin) {
            html.append(Components.empty("&#9889;", "No builtin skills available"));
        }
        html.append(Components.cardEnd());

        // Installed community skills table
        List<Map<String, Object>> installed = Helpers.listVal(installedData, "skills");
        if (installed.isEmpty()) {
            installed = Helpers.listVal(installedData, "installed");
        }
        if (installed.isEmpty()) {
            installed = Helpers.listVal(installedData, "_raw");
        }

        html.append(Components.cardStart("Installed Community Skills (" + installed.size() + ")"));
        if (installed.isEmpty()) {
            html.append(Components.empty("&#128230;", "No community skills installed"));
        } else {
            html.append(Components.tableStart("Name", "Description", "Status", "Actions"));
            for (var s : installed) {
                String name = Helpers.strVal(s, "name");
                if (name.isEmpty()) name = "-";
                String desc = Helpers.strVal(s, "description");
                if (desc.isEmpty()) desc = "-";
                String status = Helpers.strVal(s, "status");
                if (status.isEmpty()) status = "enabled";
                String id = Helpers.strVal(s, "id");

                String toggleAction = "disabled".equalsIgnoreCase(status) ? "enable" : "disable";
                String toggleLabel = "disabled".equalsIgnoreCase(status) ? "Enable" : "Disable";

                html.append("<tr>");
                html.append("<td><strong>").append(Helpers.esc(name)).append("</strong></td>");
                html.append("<td style='font-size:12px;color:var(--text-muted)'>").append(Helpers.esc(desc)).append("</td>");
                html.append("<td>").append(Components.statusBadge(status)).append("</td>");
                html.append("<td style='display:flex;gap:6px'>");
                html.append("<form method='POST' action='/skills' style='display:inline'>");
                html.append("<input type='hidden' name='action' value='").append(toggleAction).append("'>");
                html.append("<input type='hidden' name='id' value='").append(Helpers.esc(id)).append("'>");
                html.append("<button class='btn btn-sm' type='submit'>").append(toggleLabel).append("</button>");
                html.append("</form>");
                html.append("<form method='POST' action='/skills' style='display:inline' onsubmit=\"return confirm('Uninstall this skill?')\">");
                html.append("<input type='hidden' name='action' value='uninstall'>");
                html.append("<input type='hidden' name='id' value='").append(Helpers.esc(id)).append("'>");
                html.append("<button class='btn btn-sm btn-danger' type='submit'>Uninstall</button>");
                html.append("</form>");
                html.append("</td>");
                html.append("</tr>");
            }
            html.append(Components.tableEnd());
        }
        html.append(Components.cardEnd());

        String flash = SessionManager.consumeFlash(ex);
        SessionManager.respond(ex, 200, Layout.layout("/skills", SessionManager.getUser(ex), flash, html.toString()));
    }
}
