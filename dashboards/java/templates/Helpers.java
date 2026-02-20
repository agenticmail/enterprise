/**
 * Helpers — Utility methods: HTML escaping, time formatting, safe map access.
 */

import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;

public class Helpers {

    // ─── HTML Escaping ──────────────────────────────────

    public static String esc(Object v) {
        if (v == null) return "";
        return v.toString()
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&#39;");
    }

    // ─── Safe Map Access ────────────────────────────────

    public static int intVal(Map<String, Object> m, String key) {
        if (m == null) return 0;
        Object v = m.get(key);
        if (v instanceof Number) return ((Number) v).intValue();
        if (v instanceof String) {
            try { return Integer.parseInt((String) v); }
            catch (NumberFormatException e) { return 0; }
        }
        return 0;
    }

    public static String strVal(Map<String, Object> m, String key) {
        if (m == null) return "";
        Object v = m.get(key);
        return v != null ? v.toString() : "";
    }

    @SuppressWarnings("unchecked")
    public static List<Map<String, Object>> listVal(Map<String, Object> m, String key) {
        if (m == null) return List.of();
        Object v = m.get(key);
        if (v instanceof List) return (List<Map<String, Object>>) v;
        return List.of();
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> mapVal(Map<String, Object> m, String key) {
        if (m == null) return Map.of();
        Object v = m.get(key);
        if (v instanceof Map) return (Map<String, Object>) v;
        return Map.of();
    }

    // ─── Time Formatting ────────────────────────────────

    public static String timeAgo(Object isoVal) {
        if (isoVal == null) return "N/A";
        String iso = isoVal.toString();
        if (iso.isEmpty()) return "N/A";
        try {
            Instant then;
            try {
                then = Instant.parse(iso);
            } catch (Exception e) {
                then = LocalDateTime.parse(iso, DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                    .atZone(ZoneId.systemDefault()).toInstant();
            }
            long diffSec = Duration.between(then, Instant.now()).getSeconds();
            if (diffSec < 0) diffSec = 0;
            if (diffSec < 60) return diffSec + "s ago";
            if (diffSec < 3600) return (diffSec / 60) + "m ago";
            if (diffSec < 86400) return (diffSec / 3600) + "h ago";
            return (diffSec / 86400) + "d ago";
        } catch (Exception e) {
            return iso;
        }
    }

    // ─── Query String Parsing ───────────────────────────

    public static Map<String, String> parseQuery(String query) {
        Map<String, String> params = new LinkedHashMap<>();
        if (query == null || query.isEmpty()) return params;
        for (String pair : query.split("&")) {
            String[] kv = pair.split("=", 2);
            if (kv.length == 2) {
                params.put(kv[0], kv[1]);
            } else if (kv.length == 1) {
                params.put(kv[0], "");
            }
        }
        return params;
    }

    public static int queryInt(String query, String key, int defaultVal) {
        Map<String, String> params = parseQuery(query);
        String val = params.get(key);
        if (val == null) return defaultVal;
        try { return Integer.parseInt(val); }
        catch (NumberFormatException e) { return defaultVal; }
    }
}
