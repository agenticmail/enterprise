/**
 * WorkforceHandler — Monitor agent schedules, workloads, and availability.
 * Routes: GET /workforce
 */

import com.sun.net.httpserver.*;
import java.io.*;

public class WorkforceHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            StringBuilder html = new StringBuilder();
            html.append(Components.pageHeader("Workforce", "Monitor agent schedules, workloads, and availability"));

            html.append("<style>");
            html.append(".stat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r,6px);padding:20px;text-align:center}");
            html.append(".stat-icon{font-size:24px;margin-bottom:8px}");
            html.append(".stat-value{font-size:24px;font-weight:700;color:var(--primary);margin-bottom:4px}");
            html.append(".stat-label{font-size:13px;color:var(--text-muted,var(--muted))}");
            html.append("</style>");

            html.append("<div style='display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-bottom:20px'>");
            html.append("<div class='stat-card'><div class='stat-icon'>&#129302;</div><div class='stat-value'>0</div><div class='stat-label'>Active Agents</div></div>");
            html.append("<div class='stat-card'><div class='stat-icon'>&#9203;</div><div class='stat-value'>0</div><div class='stat-label'>Pending Tasks</div></div>");
            html.append("<div class='stat-card'><div class='stat-icon'>&#128202;</div><div class='stat-value'>0%</div><div class='stat-label'>Utilization</div></div>");
            html.append("</div>");

            html.append("<div style='margin-bottom:20px'>");
            html.append("<button class='btn btn-primary'>Schedule</button> ");
            html.append("<button class='btn'>Workload</button> ");
            html.append("<button class='btn'>Analytics</button>");
            html.append("</div>");

            html.append(Components.cardStart("Agent Schedule"));
            html.append(Components.empty("&#128336;", "No scheduled tasks<br><small>Agent schedules and time allocations will appear here</small>"));
            html.append(Components.cardEnd());

            html.append("<div style='display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-top:20px'>");

            html.append(Components.cardStart("Workload Distribution"));
            html.append(Components.empty("&#9878;&#65039;", "No workload data<br><small>Agent workload distribution will appear here</small>"));
            html.append(Components.cardEnd());

            html.append(Components.cardStart("Performance Metrics"));
            html.append(Components.empty("&#128200;", "No metrics available<br><small>Performance analytics will appear here</small>"));
            html.append(Components.cardEnd());

            html.append("</div>");

            String flash = SessionManager.consumeFlash(ex);
            SessionManager.respond(ex, 200, Layout.layout("/workforce", SessionManager.getUser(ex), flash, html.toString()));

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }
}
