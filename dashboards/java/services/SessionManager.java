/**
 * SessionManager — Cookie-based session store using ConcurrentHashMap.
 * Maps session IDs to user data (token, user map, flash messages).
 */

import com.sun.net.httpserver.HttpExchange;
import java.io.*;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class SessionManager {

    private static final Map<String, Map<String, Object>> sessions = new ConcurrentHashMap<>();

    // ─── Session CRUD ───────────────────────────────────

    public static String createSession(String token, Map<String, Object> user) {
        String sid = UUID.randomUUID().toString();
        Map<String, Object> sess = new HashMap<>();
        sess.put("token", token);
        sess.put("user", user);
        sessions.put(sid, sess);
        return sid;
    }

    public static void destroySession(String sid) {
        if (sid != null) sessions.remove(sid);
    }

    // ─── Cookie Parsing ─────────────────────────────────

    public static String getSessionId(HttpExchange ex) {
        String cookie = ex.getRequestHeaders().getFirst("Cookie");
        if (cookie == null) return null;
        for (String part : cookie.split(";")) {
            part = part.trim();
            if (part.startsWith("am_session=")) return part.substring(11);
        }
        return null;
    }

    public static void setSessionCookie(HttpExchange ex, String sid) {
        ex.getResponseHeaders().add("Set-Cookie", "am_session=" + sid + "; Path=/; HttpOnly; Max-Age=86400");
    }

    public static void clearSessionCookie(HttpExchange ex) {
        ex.getResponseHeaders().add("Set-Cookie", "am_session=; Path=/; HttpOnly; Max-Age=0");
    }

    // ─── Token + User Access ────────────────────────────

    public static String getToken(HttpExchange ex) {
        String sid = getSessionId(ex);
        if (sid == null || !sessions.containsKey(sid)) return null;
        Object t = sessions.get(sid).get("token");
        return t != null ? t.toString() : null;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> getUser(HttpExchange ex) {
        String sid = getSessionId(ex);
        if (sid == null || !sessions.containsKey(sid)) return null;
        Object u = sessions.get(sid).get("user");
        return u instanceof Map ? (Map<String, Object>) u : null;
    }

    public static boolean isAuthenticated(HttpExchange ex) {
        return getToken(ex) != null;
    }

    // ─── Flash Messages ─────────────────────────────────

    public static void setFlash(HttpExchange ex, String message, String type) {
        String sid = getSessionId(ex);
        if (sid != null && sessions.containsKey(sid)) {
            sessions.get(sid).put("flash", message);
            sessions.get(sid).put("flash_type", type);
        }
    }

    public static String consumeFlash(HttpExchange ex) {
        String sid = getSessionId(ex);
        if (sid == null || !sessions.containsKey(sid)) return "";
        Map<String, Object> sess = sessions.get(sid);
        Object msg = sess.remove("flash");
        Object type = sess.remove("flash_type");
        if (msg == null) return "";
        String t = type != null ? type.toString() : "info";
        return "<div class='flash flash-" + Helpers.esc(t) + "'>" + Helpers.esc(msg) + "</div>";
    }

    // ─── Form Parsing ───────────────────────────────────

    public static Map<String, String> parseForm(HttpExchange ex) throws IOException {
        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        Map<String, String> params = new LinkedHashMap<>();
        if (body.isEmpty()) return params;
        for (String pair : body.split("&")) {
            String[] kv = pair.split("=", 2);
            if (kv.length == 2) {
                params.put(
                    URLDecoder.decode(kv[0], StandardCharsets.UTF_8),
                    URLDecoder.decode(kv[1], StandardCharsets.UTF_8)
                );
            }
        }
        return params;
    }

    // ─── HTTP Response Helpers ───────────────────────────

    public static void respond(HttpExchange ex, int code, String html) throws IOException {
        byte[] bytes = html.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "text/html; charset=UTF-8");
        ex.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }

    public static void redirect(HttpExchange ex, String url) throws IOException {
        ex.getResponseHeaders().set("Location", url);
        ex.sendResponseHeaders(302, -1);
        ex.close();
    }

    public static void respondCss(HttpExchange ex, String css) throws IOException {
        byte[] bytes = css.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "text/css; charset=UTF-8");
        ex.getResponseHeaders().set("Cache-Control", "public, max-age=3600");
        ex.sendResponseHeaders(200, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }
}
