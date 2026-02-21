/**
 * SkillConnectionsHandler — Visualize and manage relationships between skills.
 * Routes: GET /skill-connections
 */

import com.sun.net.httpserver.*;
import java.io.*;

public class SkillConnectionsHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            StringBuilder html = new StringBuilder();
            html.append(Components.pageHeader("Skill Connections", "Visualize and manage relationships between skills"));

            html.append("<style>");
            html.append(".connection-type{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)}");
            html.append(".connection-type:last-child{border-bottom:none}");
            html.append(".connection-indicator{width:12px;height:12px;border-radius:3px;flex-shrink:0}");
            html.append(".connection-depends{background:#06b6d4}");
            html.append(".connection-enhances{background:var(--success)}");
            html.append(".connection-conflicts{background:var(--warning)}");
            html.append("</style>");

            html.append("<div style='margin-bottom:20px'>");
            html.append("<button class='btn btn-primary'>+ Create Connection</button> ");
            html.append("<button class='btn' style='margin-left:10px'>View Network</button>");
            html.append("</div>");

            html.append(Components.cardStart("Skill Network Overview"));
            html.append(Components.empty("&#128279;", "No skill connections configured<br><small>Create connections between skills to enable complex workflows</small>"));
            html.append(Components.cardEnd());

            html.append("<div style='display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px'>");

            html.append(Components.cardStart("Connection Types"));
            html.append("<div class='connection-type'><span class='connection-indicator connection-depends'></span><span>Dependencies</span><span class='badge badge-default' style='margin-left:auto'>0</span></div>");
            html.append("<div class='connection-type'><span class='connection-indicator connection-enhances'></span><span>Enhancements</span><span class='badge badge-default' style='margin-left:auto'>0</span></div>");
            html.append("<div class='connection-type'><span class='connection-indicator connection-conflicts'></span><span>Conflicts</span><span class='badge badge-default' style='margin-left:auto'>0</span></div>");
            html.append(Components.cardEnd());

            html.append(Components.cardStart("Recent Changes"));
            html.append(Components.empty("&#128203;", "No recent changes<br><small>Connection updates will appear here</small>"));
            html.append(Components.cardEnd());

            html.append("</div>");

            String flash = SessionManager.consumeFlash(ex);
            SessionManager.respond(ex, 200, Layout.layout("/skill-connections", SessionManager.getUser(ex), flash, html.toString()));

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }
}
