/**
 * KnowledgeContributionsHandler — Knowledge hub for community sharing.
 * Routes: GET /knowledge-contributions
 */

import com.sun.net.httpserver.*;
import java.io.*;

public class KnowledgeContributionsHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            StringBuilder html = new StringBuilder();
            html.append(Components.pageHeader("Knowledge Hub", "Share knowledge and learn from the community"));

            html.append("<div style='margin-bottom:20px'>");
            html.append("<button class='btn btn-primary'>Community</button> ");
            html.append("<button class='btn'>My Contributions</button> ");
            html.append("<button class='btn'>Bookmarks</button>");
            html.append("</div>");

            html.append(Components.cardStart("Featured Knowledge"));
            html.append(Components.empty("&#127775;", "No featured knowledge available<br><small>Community-shared knowledge will appear here</small>"));
            html.append(Components.cardEnd());

            html.append("<div style='display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-top:20px'>");

            html.append(Components.cardStart("Latest Contributions"));
            html.append(Components.empty("&#128221;", "No contributions yet<br><small>Recent knowledge contributions will appear here</small>"));
            html.append(Components.cardEnd());

            html.append(Components.cardStart("Trending Topics"));
            html.append(Components.empty("&#128293;", "No trending topics<br><small>Popular knowledge topics will appear here</small>"));
            html.append(Components.cardEnd());

            html.append("</div>");

            String flash = SessionManager.consumeFlash(ex);
            SessionManager.respond(ex, 200, Layout.layout("/knowledge-contributions", SessionManager.getUser(ex), flash, html.toString()));

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }
}
