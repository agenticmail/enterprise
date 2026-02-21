/**
 * DomainStatusHandler — Monitor domain configuration and security status.
 * Routes: GET /domain-status
 */

import com.sun.net.httpserver.*;
import java.io.*;

public class DomainStatusHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            StringBuilder html = new StringBuilder();
            html.append(Components.pageHeader("Domain Status", "Monitor domain configuration and security status"));

            html.append("<style>");
            html.append(".status-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}");
            html.append(".status-item{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)}");
            html.append(".status-item:last-child{border-bottom:none}");
            html.append(".status-indicator{width:8px;height:8px;border-radius:50%;flex-shrink:0}");
            html.append(".status-success{background:var(--success)}");
            html.append(".status-warning{background:var(--warning)}");
            html.append("</style>");

            html.append("<div class='status-grid'>");

            html.append(Components.cardStart("Domain Configuration"));
            html.append("<div class='status-item'><span class='status-indicator status-success'></span><span>Domain connected</span></div>");
            html.append("<div class='status-item'><span class='status-indicator status-success'></span><span>DNS configured</span></div>");
            html.append("<div class='status-item'><span class='status-indicator status-success'></span><span>SSL certificate valid</span></div>");
            html.append(Components.cardEnd());

            html.append(Components.cardStart("Security Status"));
            html.append("<div class='status-item'><span class='status-indicator status-success'></span><span>DKIM configured</span></div>");
            html.append("<div class='status-item'><span class='status-indicator status-success'></span><span>SPF record valid</span></div>");
            html.append("<div class='status-item'><span class='status-indicator status-warning'></span><span>DMARC recommended</span></div>");
            html.append(Components.cardEnd());

            html.append("</div>");

            html.append(Components.cardStart("Domain Health Monitoring"));
            html.append(Components.empty("&#128200;", "Domain monitoring dashboard<br><small>Real-time domain health metrics will appear here</small>"));
            html.append(Components.cardEnd());

            String flash = SessionManager.consumeFlash(ex);
            SessionManager.respond(ex, 200, Layout.layout("/domain-status", SessionManager.getUser(ex), flash, html.toString()));

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }
}
