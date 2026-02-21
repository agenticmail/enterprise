/**
 * CommunitySkillsHandler — Browse and install skills shared by the community.
 * Routes: GET /community-skills
 */

import com.sun.net.httpserver.*;
import java.io.*;

public class CommunitySkillsHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            StringBuilder html = new StringBuilder();
            html.append(Components.pageHeader("Community Skills", "Browse and install skills shared by the community"));

            html.append(Components.cardStart("Featured Skills"));
            html.append(Components.empty("&#127978;", "No community skills available<br><small>Community-shared skills will appear here</small>"));
            html.append(Components.cardEnd());

            html.append("<div style='display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px'>");

            html.append(Components.cardStart("Popular Categories"));
            html.append(Components.empty("&#127991;&#65039;", "No categories"));
            html.append(Components.cardEnd());

            html.append(Components.cardStart("My Contributions"));
            html.append(Components.empty("&#128228;", "No contributions"));
            html.append(Components.cardEnd());

            html.append("</div>");

            String flash = SessionManager.consumeFlash(ex);
            SessionManager.respond(ex, 200, Layout.layout("/community-skills", SessionManager.getUser(ex), flash, html.toString()));

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }
}
