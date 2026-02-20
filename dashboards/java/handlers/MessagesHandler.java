/**
 * MessagesHandler — List and send messages.
 * Routes: GET /messages, POST /messages (send)
 */

import com.sun.net.httpserver.*;
import java.io.*;
import java.util.*;

public class MessagesHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            String method = ex.getRequestMethod();

            // POST /messages (send)
            if ("POST".equals(method)) {
                handleSend(ex);
                return;
            }

            // GET /messages (list)
            handleList(ex);

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }

    private void handleSend(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);
        Map<String, String> form = SessionManager.parseForm(ex);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("to", form.getOrDefault("to", ""));
        body.put("subject", form.getOrDefault("subject", ""));
        body.put("body", form.getOrDefault("body", ""));

        String from = form.getOrDefault("from", "");
        if (!from.isEmpty()) {
            body.put("from", from);
        }

        var result = ApiClient.post("/engine/messages", token, ApiClient.toJsonMixed(body));
        int status = Helpers.intVal(result, "_status");

        if (status > 0 && status < 300) {
            SessionManager.setFlash(ex, "Message sent successfully", "success");
        } else {
            String err = Helpers.strVal(result, "error");
            if (err.isEmpty()) err = "Failed to send message";
            SessionManager.setFlash(ex, err, "danger");
        }

        SessionManager.redirect(ex, "/messages");
    }

    private void handleList(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);

        var data = ApiClient.get("/engine/messages", token);

        List<Map<String, Object>> messages = Helpers.listVal(data, "messages");
        if (messages.isEmpty()) {
            messages = Helpers.listVal(data, "_raw");
        }

        StringBuilder html = new StringBuilder();
        html.append(Components.pageHeader("Messages", "View and send messages through the platform"));

        // Stats row
        int inbound = 0;
        int outbound = 0;
        for (var m : messages) {
            String dir = Helpers.strVal(m, "direction");
            if ("inbound".equalsIgnoreCase(dir) || "received".equalsIgnoreCase(dir)) inbound++;
            else outbound++;
        }
        html.append("<div class='stats-row'>");
        html.append(Components.statCard("Total Messages", messages.size()));
        html.append(Components.statCard("Inbound", inbound));
        html.append(Components.statCard("Outbound", outbound));
        html.append("</div>");

        // Send message form
        html.append(Components.cardStart("Send Message"));
        html.append("<form method='POST' action='/messages'>");
        html.append("<div class='form-row'>");
        html.append("<div class='form-group'><label>To</label>");
        html.append("<input type='text' name='to' required placeholder='recipient@example.com'></div>");
        html.append("<div class='form-group'><label>From (optional)</label>");
        html.append("<input type='text' name='from' placeholder='sender@example.com'></div>");
        html.append("</div>");
        html.append("<div class='form-group'><label>Subject</label>");
        html.append("<input type='text' name='subject' required placeholder='Message subject'></div>");
        html.append("<div class='form-group'><label>Body</label>");
        html.append("<textarea name='body' rows='4' placeholder='Message body...'></textarea></div>");
        html.append("<button class='btn btn-primary' type='submit'>Send Message</button>");
        html.append("</form>");
        html.append(Components.cardEnd());

        // Messages list
        html.append(Components.cardStart("Messages (" + messages.size() + ")"));
        if (messages.isEmpty()) {
            html.append(Components.empty("&#128231;", "No messages yet. Send one above."));
        } else {
            html.append(Components.tableStart("From", "To", "Subject", "Direction", "Channel", "Status", "Time"));
            for (var m : messages) {
                String from = Helpers.strVal(m, "from");
                if (from.isEmpty()) from = Helpers.strVal(m, "sender");
                if (from.isEmpty()) from = "-";
                String to = Helpers.strVal(m, "to");
                if (to.isEmpty()) to = Helpers.strVal(m, "recipient");
                if (to.isEmpty()) to = "-";
                String subject = Helpers.strVal(m, "subject");
                if (subject.isEmpty()) subject = "(no subject)";

                String direction = Helpers.strVal(m, "direction");
                if (direction.isEmpty()) direction = "inbound";
                String dirVariant;
                switch (direction.toLowerCase()) {
                    case "inbound": dirVariant = "primary"; break;
                    case "outbound": dirVariant = "success"; break;
                    case "internal": dirVariant = "default"; break;
                    default: dirVariant = "default"; break;
                }

                String channel = Helpers.strVal(m, "channel");
                if (channel.isEmpty()) channel = "email";
                String chanVariant;
                switch (channel.toLowerCase()) {
                    case "email": chanVariant = "primary"; break;
                    case "api": chanVariant = "warning"; break;
                    case "internal": chanVariant = "default"; break;
                    case "webhook": chanVariant = "info"; break;
                    default: chanVariant = "default"; break;
                }

                String msgStatus = Helpers.strVal(m, "status");
                if (msgStatus.isEmpty()) msgStatus = "sent";
                String time = Helpers.strVal(m, "created_at");
                if (time.isEmpty()) time = Helpers.strVal(m, "timestamp");
                if (time.isEmpty()) time = Helpers.strVal(m, "sent_at");

                html.append("<tr>");
                html.append("<td>").append(Helpers.esc(from)).append("</td>");
                html.append("<td>").append(Helpers.esc(to)).append("</td>");
                html.append("<td><strong>").append(Helpers.esc(subject)).append("</strong></td>");
                html.append("<td>").append(Components.badge(direction, dirVariant)).append("</td>");
                html.append("<td>").append(Components.badge(channel, chanVariant)).append("</td>");
                html.append("<td>").append(Components.statusBadge(msgStatus)).append("</td>");
                html.append("<td style='color:var(--text-muted)'>").append(Helpers.timeAgo(time)).append("</td>");
                html.append("</tr>");
            }
            html.append(Components.tableEnd());
        }
        html.append(Components.cardEnd());

        String flash = SessionManager.consumeFlash(ex);
        SessionManager.respond(ex, 200, Layout.layout("/messages", SessionManager.getUser(ex), flash, html.toString()));
    }
}
