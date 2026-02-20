/**
 * Components — Reusable HTML component builders: badges, stat cards, tables, modals, pagination.
 */

import java.util.*;

public class Components {

    // ─── Badges ─────────────────────────────────────────

    public static String badge(String text) {
        return badge(text, "default");
    }

    public static String badge(String text, String variant) {
        return "<span class='badge badge-" + Helpers.esc(variant) + "'>" + Helpers.esc(text) + "</span>";
    }

    public static String statusBadge(String status) {
        if (status == null) status = "unknown";
        String v;
        switch (status.toLowerCase()) {
            case "active": case "enabled": case "running": case "success":
                v = "success"; break;
            case "archived": case "disabled": case "revoked":
                v = "danger"; break;
            case "pending": case "paused":
                v = "warning"; break;
            case "admin":
                v = "primary"; break;
            case "owner":
                v = "owner"; break;
            case "member":
                v = "member"; break;
            case "viewer":
                v = "viewer"; break;
            default:
                v = "default"; break;
        }
        return badge(status, v);
    }

    public static String roleBadge(String role) {
        if (role == null) role = "member";
        String v;
        switch (role.toLowerCase()) {
            case "owner": v = "owner"; break;
            case "admin": v = "primary"; break;
            case "viewer": v = "viewer"; break;
            default: v = "member"; break;
        }
        return badge(role, v);
    }

    // ─── Stat Card ──────────────────────────────────────

    public static String statCard(String label, Object value, boolean pink) {
        return String.format(
            "<div class='stat-card'><div class='label'>%s</div><div class='value%s'>%s</div></div>",
            Helpers.esc(label),
            pink ? " pink" : "",
            Helpers.esc(value)
        );
    }

    public static String statCard(String label, Object value) {
        return statCard(label, value, false);
    }

    // ─── Table Wrappers ─────────────────────────────────

    public static String tableStart(String... headers) {
        StringBuilder sb = new StringBuilder("<div class='table-wrap'><table><thead><tr>");
        for (String h : headers) {
            sb.append("<th>").append(Helpers.esc(h)).append("</th>");
        }
        sb.append("</tr></thead><tbody>");
        return sb.toString();
    }

    public static String tableEnd() {
        return "</tbody></table></div>";
    }

    // ─── Empty State ────────────────────────────────────

    public static String empty(String icon, String message) {
        return "<div class='empty'><span class='icon'>" + icon + "</span>" + Helpers.esc(message) + "</div>";
    }

    // ─── Modal (confirm dialogs) ────────────────────────

    public static String confirmForm(String action, String buttonText, String confirmMessage) {
        return String.format(
            "<form method='POST' action='%s' style='display:inline' onsubmit=\"return confirm('%s')\">" +
            "<button class='btn btn-sm btn-danger' type='submit'>%s</button></form>",
            Helpers.esc(action),
            Helpers.esc(confirmMessage).replace("'", "\\'"),
            Helpers.esc(buttonText)
        );
    }

    // ─── Pagination ─────────────────────────────────────

    public static String pagination(String baseUrl, int page, int limit, int totalEvents, int currentCount) {
        StringBuilder sb = new StringBuilder("<div class='pagination'>");
        if (page > 1) {
            sb.append("<a href='").append(baseUrl).append("?page=").append(page - 1).append("'>&laquo; Previous</a>");
        }
        sb.append("<span class='current'>Page ").append(page).append("</span>");
        if (currentCount >= limit) {
            sb.append("<a href='").append(baseUrl).append("?page=").append(page + 1).append("'>Next &raquo;</a>");
        }
        sb.append("<span style='color:var(--text-muted);font-size:12px;margin-left:auto'>")
          .append(totalEvents).append(" total events</span>");
        sb.append("</div>");
        return sb.toString();
    }

    // ─── Page Header ────────────────────────────────────

    public static String pageHeader(String title, String description) {
        return "<div class='page-header'><h1>" + Helpers.esc(title) + "</h1><p>" + Helpers.esc(description) + "</p></div>";
    }

    // ─── Card Wrappers ──────────────────────────────────

    public static String cardStart(String title) {
        return "<div class='card'><h3>" + Helpers.esc(title) + "</h3>";
    }

    public static String cardEnd() {
        return "</div>";
    }

    // ─── Key Banner (show-once API key) ─────────────────

    public static String keyBanner(String key) {
        return "<div class='key-banner'>Your new API key (shown only once — copy it now):<code>" +
            Helpers.esc(key) + "</code></div>";
    }
}
