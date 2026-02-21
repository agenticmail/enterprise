/**
 * KnowledgeHandler — Manage and organize knowledge bases for agents.
 * Routes: GET /knowledge
 */

import com.sun.net.httpserver.*;
import java.io.*;

public class KnowledgeHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            StringBuilder html = new StringBuilder();
            html.append(Components.pageHeader("Knowledge Bases", "Manage and organize knowledge bases for your agents"));

            html.append("<div style='margin-bottom:20px'>");
            html.append("<button class='btn btn-primary'>+ Create Knowledge Base</button>");
            html.append("</div>");

            html.append(Components.cardStart("Active Knowledge Bases"));
            html.append(Components.empty("&#128218;", "No knowledge bases created<br><small>Create your first knowledge base to get started</small>"));
            html.append(Components.cardEnd());

            html.append("<div style='display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px'>");

            html.append(Components.cardStart("Recent Activity"));
            html.append(Components.empty("&#128200;", "No recent activity"));
            html.append(Components.cardEnd());

            html.append(Components.cardStart("Knowledge Stats"));
            html.append(Components.empty("&#128202;", "No statistics available"));
            html.append(Components.cardEnd());

            html.append("</div>");

            String flash = SessionManager.consumeFlash(ex);
            SessionManager.respond(ex, 200, Layout.layout("/knowledge", SessionManager.getUser(ex), flash, html.toString()));

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }
}
