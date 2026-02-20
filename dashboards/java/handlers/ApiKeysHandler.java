/**
 * ApiKeysHandler — List API keys, create key, revoke key.
 * Routes: GET /api-keys, POST /api-keys, POST /api-keys/{id}/revoke
 *
 * NEW: Created from scratch (not in original monolithic file).
 */

import com.sun.net.httpserver.*;
import java.io.*;
import java.util.*;

public class ApiKeysHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            String path = ex.getRequestURI().getPath();
            String method = ex.getRequestMethod();

            // POST /api-keys/{id}/revoke
            if ("POST".equals(method) && path.matches("/api-keys/[^/]+/revoke")) {
                handleRevoke(ex, path);
                return;
            }

            // POST /api-keys (create)
            if ("POST".equals(method)) {
                handleCreate(ex);
                return;
            }

            // GET /api-keys (list)
            handleList(ex);

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }

    private void handleCreate(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);
        Map<String, String> form = SessionManager.parseForm(ex);

        String name = form.getOrDefault("name", "");
        String scopesStr = form.getOrDefault("scopes", "");

        // Build scopes as JSON array
        List<String> scopes = new ArrayList<>();
        for (String s : scopesStr.split(",")) {
            String trimmed = s.trim();
            if (!trimmed.isEmpty()) scopes.add(trimmed);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("scopes", scopes);

        var result = ApiClient.post("/api/api-keys", token, ApiClient.toJsonMixed(body));
        int status = Helpers.intVal(result, "_status");

        if (status > 0 && status < 300) {
            // The API returns the key only once
            String createdKey = Helpers.strVal(result, "key");
            if (createdKey.isEmpty()) createdKey = Helpers.strVal(result, "api_key");
            if (createdKey.isEmpty()) createdKey = Helpers.strVal(result, "token");

            if (!createdKey.isEmpty()) {
                SessionManager.setFlash(ex, "KEY:" + createdKey, "success");
            } else {
                SessionManager.setFlash(ex, "API key created", "success");
            }
        } else {
            String err = Helpers.strVal(result, "error");
            if (err.isEmpty()) err = "Failed to create API key";
            SessionManager.setFlash(ex, err, "danger");
        }

        SessionManager.redirect(ex, "/api-keys");
    }

    private void handleRevoke(HttpExchange ex, String path) throws IOException {
        String token = SessionManager.getToken(ex);
        // Consume POST body
        SessionManager.parseForm(ex);

        // Extract ID from /api-keys/{id}/revoke
        String[] parts = path.split("/");
        String id = parts.length >= 3 ? parts[2] : "";

        var result = ApiClient.delete("/api/api-keys/" + id, token);
        int status = Helpers.intVal(result, "_status");

        if (status > 0 && status < 300) {
            SessionManager.setFlash(ex, "API key revoked", "success");
        } else {
            String err = Helpers.strVal(result, "error");
            if (err.isEmpty()) err = "Failed to revoke key";
            SessionManager.setFlash(ex, err, "danger");
        }

        SessionManager.redirect(ex, "/api-keys");
    }

    private void handleList(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);
        var data = ApiClient.get("/api/api-keys", token);

        List<Map<String, Object>> keys = Helpers.listVal(data, "api_keys");
        if (keys.isEmpty()) keys = Helpers.listVal(data, "keys");
        if (keys.isEmpty()) keys = Helpers.listVal(data, "_raw");

        StringBuilder html = new StringBuilder();
        html.append(Components.pageHeader("API Keys", "Manage programmatic access credentials"));

        // Check for show-once key in flash
        String flash = SessionManager.consumeFlash(ex);
        String keyBanner = "";
        if (flash.contains("KEY:")) {
            // Extract the key from flash message
            String keyFromFlash = flash.replaceAll(".*KEY:", "").replaceAll("<.*", "");
            keyBanner = Components.keyBanner(keyFromFlash);
            flash = ""; // Don't show the regular flash, show the key banner instead
        }

        // Create form
        html.append(Components.cardStart("Create API Key"));
        html.append("<form method='POST' action='/api-keys'>");
        html.append("<div class='form-row'>");
        html.append("<div class='form-group'><label>Name</label>");
        html.append("<input type='text' name='name' required placeholder='e.g. Production Key'></div>");
        html.append("<div class='form-group'><label>Scopes (comma separated)</label>");
        html.append("<input type='text' name='scopes' placeholder='e.g. agents:read, messages:write'></div>");
        html.append("</div>");
        html.append("<button class='btn btn-primary' type='submit'>Generate Key</button>");
        html.append("</form>");
        html.append(Components.cardEnd());

        // Keys list
        html.append(Components.cardStart("Active Keys (" + keys.size() + ")"));
        if (keys.isEmpty()) {
            html.append(Components.empty("&#128273;", "No API keys. Generate one above."));
        } else {
            html.append(Components.tableStart("Name", "Key Prefix", "Scopes", "Status", "Created", "Actions"));
            for (var k : keys) {
                String name = Helpers.strVal(k, "name");
                if (name.isEmpty()) name = "-";

                // Key prefix
                String prefix = Helpers.strVal(k, "prefix");
                if (prefix.isEmpty()) prefix = Helpers.strVal(k, "key_prefix");
                if (prefix.isEmpty()) {
                    String fullKey = Helpers.strVal(k, "key");
                    if (fullKey.length() > 12) prefix = fullKey.substring(0, 12) + "...";
                    else if (!fullKey.isEmpty()) prefix = fullKey;
                    else prefix = "-";
                }

                // Scopes
                @SuppressWarnings("unchecked")
                List<Object> scopesList = k.get("scopes") instanceof List ? (List<Object>) k.get("scopes") : List.of();
                StringBuilder scopesHtml = new StringBuilder();
                for (Object scope : scopesList) {
                    scopesHtml.append(Components.badge(scope.toString())).append(" ");
                }
                if (scopesList.isEmpty()) scopesHtml.append("-");

                String keyStatus = Helpers.strVal(k, "status");
                if (keyStatus.isEmpty()) keyStatus = "active";
                String created = Helpers.strVal(k, "created_at");
                String id = Helpers.strVal(k, "id");

                html.append("<tr>");
                html.append("<td><strong>").append(Helpers.esc(name)).append("</strong></td>");
                html.append("<td><code>").append(Helpers.esc(prefix)).append("</code></td>");
                html.append("<td>").append(scopesHtml).append("</td>");
                html.append("<td>").append(Components.statusBadge(keyStatus)).append("</td>");
                html.append("<td style='color:var(--text-muted)'>").append(Helpers.timeAgo(created)).append("</td>");
                html.append("<td>");
                if (!"revoked".equalsIgnoreCase(keyStatus)) {
                    html.append(Components.confirmForm(
                        "/api-keys/" + Helpers.esc(id) + "/revoke",
                        "Revoke",
                        "Revoke this API key? This cannot be undone."
                    ));
                }
                html.append("</td>");
                html.append("</tr>");
            }
            html.append(Components.tableEnd());
        }
        html.append(Components.cardEnd());

        String fullContent = keyBanner + html.toString();
        SessionManager.respond(ex, 200, Layout.layout("/api-keys", SessionManager.getUser(ex), flash, fullContent));
    }
}
