/**
 * UsersHandler — List users, create user.
 * Routes: GET /users, POST /users
 */

import com.sun.net.httpserver.*;
import java.io.*;
import java.util.*;

public class UsersHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            if ("POST".equals(ex.getRequestMethod())) {
                handleCreate(ex);
                return;
            }

            handleList(ex);

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }

    private void handleCreate(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);
        Map<String, String> form = SessionManager.parseForm(ex);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", form.getOrDefault("name", ""));
        body.put("email", form.getOrDefault("email", ""));
        body.put("role", form.getOrDefault("role", "member"));

        var result = ApiClient.post("/api/users", token, ApiClient.toJsonMixed(body));
        int status = Helpers.intVal(result, "_status");

        if (status > 0 && status < 300) {
            SessionManager.setFlash(ex, "User created successfully", "success");
        } else {
            String err = Helpers.strVal(result, "error");
            if (err.isEmpty()) err = "Failed to create user";
            SessionManager.setFlash(ex, err, "danger");
        }

        SessionManager.redirect(ex, "/users");
    }

    private void handleList(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);
        var data = ApiClient.get("/api/users", token);

        List<Map<String, Object>> users = Helpers.listVal(data, "users");
        if (users.isEmpty()) {
            users = Helpers.listVal(data, "_raw");
        }

        StringBuilder html = new StringBuilder();
        html.append(Components.pageHeader("Users", "Manage user accounts and roles"));

        // Create form
        html.append(Components.cardStart("Invite User"));
        html.append("<form method='POST' action='/users'>");
        html.append("<div class='form-row'>");
        html.append("<div class='form-group'><label>Name</label>");
        html.append("<input type='text' name='name' required placeholder='Full name'></div>");
        html.append("<div class='form-group'><label>Email</label>");
        html.append("<input type='email' name='email' required placeholder='user@company.com'></div>");
        html.append("</div>");
        html.append("<div class='form-group'><label>Role</label>");
        html.append("<select name='role'>");
        html.append("<option value='member'>Member</option>");
        html.append("<option value='admin'>Admin</option>");
        html.append("<option value='viewer'>Viewer</option>");
        html.append("</select></div>");
        html.append("<button class='btn btn-primary' type='submit'>Create User</button>");
        html.append("</form>");
        html.append(Components.cardEnd());

        // Users list
        html.append(Components.cardStart("All Users (" + users.size() + ")"));
        if (users.isEmpty()) {
            html.append(Components.empty("&#128101;", "No users found"));
        } else {
            html.append(Components.tableStart("Name", "Email", "Role", "Status", "Joined"));
            for (var u : users) {
                String name = Helpers.strVal(u, "name");
                if (name.isEmpty()) name = "-";
                String email = Helpers.strVal(u, "email");
                if (email.isEmpty()) email = "-";
                String role = Helpers.strVal(u, "role");
                if (role.isEmpty()) role = "member";
                String userStatus = Helpers.strVal(u, "status");
                if (userStatus.isEmpty()) userStatus = "active";
                String joined = Helpers.strVal(u, "created_at");

                html.append("<tr>");
                html.append("<td><strong>").append(Helpers.esc(name)).append("</strong></td>");
                html.append("<td>").append(Helpers.esc(email)).append("</td>");
                html.append("<td>").append(Components.roleBadge(role)).append("</td>");
                html.append("<td>").append(Components.statusBadge(userStatus)).append("</td>");
                html.append("<td style='color:var(--text-muted)'>").append(Helpers.timeAgo(joined)).append("</td>");
                html.append("</tr>");
            }
            html.append(Components.tableEnd());
        }
        html.append(Components.cardEnd());

        String flash = SessionManager.consumeFlash(ex);
        SessionManager.respond(ex, 200, Layout.layout("/users", SessionManager.getUser(ex), flash, html.toString()));
    }
}
