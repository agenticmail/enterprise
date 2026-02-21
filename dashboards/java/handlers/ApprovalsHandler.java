/**
 * ApprovalsHandler — Review and manage pending approval requests.
 * Routes: GET /approvals
 */

import com.sun.net.httpserver.*;
import java.io.*;

public class ApprovalsHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            StringBuilder html = new StringBuilder();
            html.append(Components.pageHeader("Approvals", "Review and manage pending approval requests"));

            html.append("<div style='margin-bottom:20px'>");
            html.append("<button class='btn btn-primary'>Pending</button> ");
            html.append("<button class='btn'>Approved</button> ");
            html.append("<button class='btn'>Rejected</button>");
            html.append("</div>");

            html.append(Components.cardStart("Pending Approvals"));
            html.append(Components.empty("&#9989;", "No pending approvals<br><small>Agent approval requests will appear here</small>"));
            html.append(Components.cardEnd());

            html.append(Components.cardStart("Approval History"));
            html.append(Components.empty("&#128203;", "No approval history<br><small>Past approvals and rejections will appear here</small>"));
            html.append(Components.cardEnd());

            String flash = SessionManager.consumeFlash(ex);
            SessionManager.respond(ex, 200, Layout.layout("/approvals", SessionManager.getUser(ex), flash, html.toString()));

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }
}
