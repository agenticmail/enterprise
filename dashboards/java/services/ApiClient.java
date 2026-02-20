/**
 * ApiClient — HTTP client + JSON parsing for AgenticMail API.
 * Uses only JDK 11+ built-in classes. Zero external dependencies.
 */

import java.io.*;
import java.net.*;
import java.net.http.*;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.stream.Collectors;

public class ApiClient {

    static String API_URL = "http://localhost:3000";

    private static final HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build();

    // ─── HTTP Methods ───────────────────────────────────

    @SuppressWarnings("unchecked")
    public static Map<String, Object> api(String path, String method, String token, String body) {
        try {
            var builder = HttpRequest.newBuilder()
                .uri(URI.create(API_URL + path))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(10));
            if (token != null) builder.header("Authorization", "Bearer " + token);

            switch (method) {
                case "POST":
                    builder.POST(HttpRequest.BodyPublishers.ofString(body != null ? body : ""));
                    break;
                case "PATCH":
                    builder.method("PATCH", HttpRequest.BodyPublishers.ofString(body != null ? body : ""));
                    break;
                case "PUT":
                    builder.PUT(HttpRequest.BodyPublishers.ofString(body != null ? body : ""));
                    break;
                case "DELETE":
                    builder.DELETE();
                    break;
                default:
                    builder.GET();
            }

            var resp = client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            Map<String, Object> result = parseJson(resp.body());
            result.put("_status", resp.statusCode());
            return result;
        } catch (Exception e) {
            Map<String, Object> err = new HashMap<>();
            err.put("error", "API unreachable: " + e.getMessage());
            err.put("_status", 0);
            return err;
        }
    }

    public static Map<String, Object> get(String path, String token) {
        return api(path, "GET", token, null);
    }

    public static Map<String, Object> post(String path, String token, String body) {
        return api(path, "POST", token, body);
    }

    public static Map<String, Object> patch(String path, String token, String body) {
        return api(path, "PATCH", token, body);
    }

    public static Map<String, Object> put(String path, String token, String body) {
        return api(path, "PUT", token, body);
    }

    public static Map<String, Object> delete(String path, String token) {
        return api(path, "DELETE", token, null);
    }

    // ─── JSON Serialization ─────────────────────────────

    public static String toJson(Map<String, String> map) {
        return "{" + map.entrySet().stream()
            .map(e -> "\"" + escJson(e.getKey()) + "\":\"" + escJson(e.getValue()) + "\"")
            .collect(Collectors.joining(",")) + "}";
    }

    public static String toJsonMixed(Map<String, Object> map) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (var entry : map.entrySet()) {
            if (!first) sb.append(",");
            first = false;
            sb.append("\"").append(escJson(entry.getKey())).append("\":");
            Object v = entry.getValue();
            if (v == null) {
                sb.append("null");
            } else if (v instanceof Number) {
                sb.append(v);
            } else if (v instanceof Boolean) {
                sb.append(v);
            } else if (v instanceof List) {
                sb.append("[");
                boolean f2 = true;
                for (Object item : (List<?>) v) {
                    if (!f2) sb.append(",");
                    f2 = false;
                    sb.append("\"").append(escJson(item.toString())).append("\"");
                }
                sb.append("]");
            } else {
                sb.append("\"").append(escJson(v.toString())).append("\"");
            }
        }
        sb.append("}");
        return sb.toString();
    }

    private static String escJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
    }

    // ─── Minimal JSON Parser (recursive descent) ────────

    @SuppressWarnings("unchecked")
    public static Map<String, Object> parseJson(String json) {
        try {
            String trimmed = json != null ? json.trim() : "";
            if (trimmed.isEmpty()) return new HashMap<>();
            Object result = new JsonParser(trimmed).parseValue();
            if (result instanceof Map) return (Map<String, Object>) result;
            Map<String, Object> wrapper = new HashMap<>();
            wrapper.put("_raw", result);
            return wrapper;
        } catch (Exception e) {
            Map<String, Object> err = new HashMap<>();
            err.put("error", "Parse error: " + e.getMessage());
            return err;
        }
    }

    static class JsonParser {
        String s;
        int pos;

        JsonParser(String s) {
            this.s = s;
            this.pos = 0;
        }

        char peek() { skipWs(); return pos < s.length() ? s.charAt(pos) : 0; }
        char next() { skipWs(); return pos < s.length() ? s.charAt(pos++) : 0; }
        void skipWs() { while (pos < s.length() && " \t\n\r".indexOf(s.charAt(pos)) >= 0) pos++; }

        Object parseValue() {
            char c = peek();
            if (c == '{') return parseObject();
            if (c == '[') return parseArray();
            if (c == '"') return parseString();
            if (c == 't') { pos += 4; return true; }
            if (c == 'f') { pos += 5; return false; }
            if (c == 'n') { pos += 4; return null; }
            return parseNumber();
        }

        Map<String, Object> parseObject() {
            Map<String, Object> map = new LinkedHashMap<>();
            next(); // {
            while (peek() != '}') {
                String key = parseString();
                next(); // :
                map.put(key, parseValue());
                if (peek() == ',') next();
            }
            next(); // }
            return map;
        }

        List<Object> parseArray() {
            List<Object> list = new ArrayList<>();
            next(); // [
            while (peek() != ']') {
                list.add(parseValue());
                if (peek() == ',') next();
            }
            next(); // ]
            return list;
        }

        String parseString() {
            next(); // opening "
            StringBuilder sb = new StringBuilder();
            while (pos < s.length()) {
                char c = s.charAt(pos++);
                if (c == '"') break;
                if (c == '\\' && pos < s.length()) {
                    char esc = s.charAt(pos++);
                    switch (esc) {
                        case '"': case '\\': case '/': sb.append(esc); break;
                        case 'n': sb.append('\n'); break;
                        case 't': sb.append('\t'); break;
                        case 'r': sb.append('\r'); break;
                        case 'b': sb.append('\b'); break;
                        case 'f': sb.append('\f'); break;
                        case 'u':
                            sb.append((char) Integer.parseInt(s.substring(pos, pos + 4), 16));
                            pos += 4;
                            break;
                        default: sb.append(esc);
                    }
                } else {
                    sb.append(c);
                }
            }
            return sb.toString();
        }

        Number parseNumber() {
            int start = pos;
            while (pos < s.length() && "0123456789.eE+-".indexOf(s.charAt(pos)) >= 0) pos++;
            String num = s.substring(start, pos);
            if (num.contains(".") || num.contains("e") || num.contains("E"))
                return Double.parseDouble(num);
            return Long.parseLong(num);
        }
    }
}
