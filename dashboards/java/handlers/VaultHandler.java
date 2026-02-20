/**
 * VaultHandler — Manage secrets and sensitive credentials.
 * Routes: GET /vault, POST /vault (actions: add_secret, delete_secret, rotate_secret)
 */

import com.sun.net.httpserver.*;
import java.io.*;
import java.util.*;

public class VaultHandler implements HttpHandler {

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

        if ("add_secret".equals(action)) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("orgId", "default");
            body.put("name", form.getOrDefault("name", ""));
            body.put("value", form.getOrDefault("value", ""));
            body.put("category", form.getOrDefault("category", "general"));

            var result = ApiClient.post("/api/engine/vault/secrets", token, ApiClient.toJsonMixed(body));
            int status = Helpers.intVal(result, "_status");

            if (status > 0 && status < 300) {
                SessionManager.setFlash(ex, "Secret added successfully", "success");
            } else {
                String err = Helpers.strVal(result, "error");
                if (err.isEmpty()) err = "Failed to add secret";
                SessionManager.setFlash(ex, err, "danger");
            }

        } else if ("delete_secret".equals(action)) {
            String secretId = form.getOrDefault("id", "");

            var result = ApiClient.delete("/api/engine/vault/secrets/" + secretId, token);
            int status = Helpers.intVal(result, "_status");

            if (status > 0 && status < 300) {
                SessionManager.setFlash(ex, "Secret deleted", "success");
            } else {
                String err = Helpers.strVal(result, "error");
                if (err.isEmpty()) err = "Failed to delete secret";
                SessionManager.setFlash(ex, err, "danger");
            }

        } else if ("rotate_secret".equals(action)) {
            String secretId = form.getOrDefault("id", "");

            var result = ApiClient.post("/api/engine/vault/secrets/" + secretId + "/rotate", token, "{}");
            int status = Helpers.intVal(result, "_status");

            if (status > 0 && status < 300) {
                SessionManager.setFlash(ex, "Secret rotated successfully", "success");
            } else {
                String err = Helpers.strVal(result, "error");
                if (err.isEmpty()) err = "Failed to rotate secret";
                SessionManager.setFlash(ex, err, "danger");
            }
        }

        SessionManager.redirect(ex, "/vault");
    }

    private void handleList(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);

        var data = ApiClient.get("/api/engine/vault/secrets?orgId=default", token);

        List<Map<String, Object>> secrets = Helpers.listVal(data, "secrets");
        if (secrets.isEmpty()) {
            secrets = Helpers.listVal(data, "_raw");
        }

        StringBuilder html = new StringBuilder();
        html.append(Components.pageHeader("Vault", "Manage secrets and sensitive credentials"));

        // Add secret form
        html.append(Components.cardStart("Add Secret"));
        html.append("<form method='POST' action='/vault'>");
        html.append("<input type='hidden' name='action' value='add_secret'>");
        html.append("<div class='form-row'>");
        html.append("<div class='form-group'><label>Name</label>");
        html.append("<input type='text' name='name' required placeholder='e.g. OPENAI_API_KEY'></div>");
        html.append("<div class='form-group'><label>Category</label>");
        html.append("<select name='category'>");
        html.append("<option value='api_key'>API Key</option>");
        html.append("<option value='credential'>Credential</option>");
        html.append("<option value='certificate'>Certificate</option>");
        html.append("<option value='token'>Token</option>");
        html.append("<option value='general'>General</option>");
        html.append("</select></div>");
        html.append("</div>");
        html.append("<div class='form-group'><label>Value</label>");
        html.append("<input type='password' name='value' required placeholder='Secret value'></div>");
        html.append("<button class='btn btn-primary' type='submit'>Add Secret</button>");
        html.append("</form>");
        html.append(Components.cardEnd());

        // Secrets list
        html.append(Components.cardStart("Secrets (" + secrets.size() + ")"));
        if (secrets.isEmpty()) {
            html.append(Components.empty("&#128272;", "No secrets stored yet. Add one above."));
        } else {
            html.append(Components.tableStart("Name", "Category", "Created By", "Created", "Actions"));
            for (var s : secrets) {
                String name = Helpers.strVal(s, "name");
                if (name.isEmpty()) name = "-";
                String category = Helpers.strVal(s, "category");
                if (category.isEmpty()) category = "general";
                String createdBy = Helpers.strVal(s, "created_by");
                if (createdBy.isEmpty()) createdBy = Helpers.strVal(s, "createdBy");
                if (createdBy.isEmpty()) createdBy = "-";
                String created = Helpers.strVal(s, "created_at");
                if (created.isEmpty()) created = Helpers.strVal(s, "createdAt");
                String id = Helpers.strVal(s, "id");

                html.append("<tr>");
                html.append("<td><strong>").append(Helpers.esc(name)).append("</strong></td>");
                html.append("<td>").append(Components.statusBadge(category)).append("</td>");
                html.append("<td style='color:var(--text-muted)'>").append(Helpers.esc(createdBy)).append("</td>");
                html.append("<td style='color:var(--text-muted)'>").append(Helpers.timeAgo(created)).append("</td>");
                html.append("<td style='display:flex;gap:6px'>");
                html.append("<form method='POST' action='/vault' style='display:inline'>");
                html.append("<input type='hidden' name='action' value='rotate_secret'>");
                html.append("<input type='hidden' name='id' value='").append(Helpers.esc(id)).append("'>");
                html.append("<button class='btn btn-sm' type='submit'>Rotate</button>");
                html.append("</form>");
                html.append("<form method='POST' action='/vault' style='display:inline' onsubmit=\"return confirm('Delete this secret?')\">");
                html.append("<input type='hidden' name='action' value='delete_secret'>");
                html.append("<input type='hidden' name='id' value='").append(Helpers.esc(id)).append("'>");
                html.append("<button class='btn btn-sm btn-danger' type='submit'>Delete</button>");
                html.append("</form>");
                html.append("</td>");
                html.append("</tr>");
            }
            html.append(Components.tableEnd());
        }
        html.append(Components.cardEnd());

        String flash = SessionManager.consumeFlash(ex);
        SessionManager.respond(ex, 200, Layout.layout("/vault", SessionManager.getUser(ex), flash, html.toString()));
    }
}
