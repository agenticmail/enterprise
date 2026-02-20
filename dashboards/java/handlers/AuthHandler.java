/**
 * AuthHandler — Login (GET/POST) and Logout.
 */

import com.sun.net.httpserver.*;
import java.io.*;
import java.util.*;

public class AuthHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            String path = ex.getRequestURI().getPath();
            if (path.equals("/logout")) {
                handleLogout(ex);
            } else {
                handleLogin(ex);
            }
        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Internal error: " + Helpers.esc(e.getMessage()));
        }
    }

    private void handleLogin(HttpExchange ex) throws IOException {
        // If already authenticated, redirect to dashboard
        if (SessionManager.isAuthenticated(ex)) {
            SessionManager.redirect(ex, "/");
            return;
        }

        if ("GET".equals(ex.getRequestMethod())) {
            SessionManager.respond(ex, 200, Layout.loginPage(null));
            return;
        }

        // POST: attempt login
        Map<String, String> form = SessionManager.parseForm(ex);
        String email = form.getOrDefault("email", "");
        String password = form.getOrDefault("password", "");

        Map<String, String> body = new LinkedHashMap<>();
        body.put("email", email);
        body.put("password", password);

        var data = ApiClient.post("/auth/login", null, ApiClient.toJson(body));

        if (data.containsKey("token")) {
            String token = data.get("token").toString();
            @SuppressWarnings("unchecked")
            Map<String, Object> user = data.get("user") instanceof Map
                ? (Map<String, Object>) data.get("user")
                : Map.of("email", email);

            String sid = SessionManager.createSession(token, user);
            SessionManager.setSessionCookie(ex, sid);
            SessionManager.redirect(ex, "/");
        } else {
            String error = Helpers.strVal(data, "error");
            if (error.isEmpty()) error = "Invalid credentials";
            SessionManager.respond(ex, 200, Layout.loginPage(error));
        }
    }

    private void handleLogout(HttpExchange ex) throws IOException {
        String sid = SessionManager.getSessionId(ex);
        SessionManager.destroySession(sid);
        SessionManager.clearSessionCookie(ex);
        SessionManager.redirect(ex, "/login");
    }
}
