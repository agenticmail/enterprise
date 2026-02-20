/**
 * ComplianceHandler — Compliance reports: SOC2, GDPR, Audit.
 * Routes: GET /compliance (list reports), POST /compliance (generate soc2, gdpr, audit)
 */

import com.sun.net.httpserver.*;
import java.io.*;
import java.util.*;

public class ComplianceHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try {
            if (!SessionManager.isAuthenticated(ex)) {
                SessionManager.redirect(ex, "/login");
                return;
            }

            String method = ex.getRequestMethod();

            // POST /compliance (generate report)
            if ("POST".equals(method)) {
                handleGenerate(ex);
                return;
            }

            // GET /compliance (list reports)
            handleList(ex);

        } catch (Exception e) {
            SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
        }
    }

    private void handleGenerate(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);
        Map<String, String> form = SessionManager.parseForm(ex);
        String reportType = form.getOrDefault("report_type", "");

        String endpoint;
        String label;
        switch (reportType) {
            case "soc2":
                endpoint = "/engine/compliance/reports/soc2";
                label = "SOC2";
                break;
            case "gdpr":
                endpoint = "/engine/compliance/reports/gdpr";
                label = "GDPR";
                break;
            case "audit":
                endpoint = "/engine/compliance/reports/audit";
                label = "Audit";
                break;
            default:
                SessionManager.setFlash(ex, "Unknown report type", "danger");
                SessionManager.redirect(ex, "/compliance");
                return;
        }

        var result = ApiClient.post(endpoint, token, "{}");
        int status = Helpers.intVal(result, "_status");

        if (status > 0 && status < 300) {
            SessionManager.setFlash(ex, label + " report generation started", "success");
        } else {
            String err = Helpers.strVal(result, "error");
            if (err.isEmpty()) err = "Failed to generate " + label + " report";
            SessionManager.setFlash(ex, err, "danger");
        }

        SessionManager.redirect(ex, "/compliance");
    }

    private void handleList(HttpExchange ex) throws IOException {
        String token = SessionManager.getToken(ex);

        var data = ApiClient.get("/engine/compliance/reports", token);

        List<Map<String, Object>> reports = Helpers.listVal(data, "reports");
        if (reports.isEmpty()) {
            reports = Helpers.listVal(data, "_raw");
        }

        StringBuilder html = new StringBuilder();
        html.append(Components.pageHeader("Compliance", "Generate and view compliance reports"));

        // Stats row
        int soc2Count = 0;
        int gdprCount = 0;
        int auditCount = 0;
        for (var r : reports) {
            String type = Helpers.strVal(r, "type");
            if ("soc2".equalsIgnoreCase(type)) soc2Count++;
            else if ("gdpr".equalsIgnoreCase(type)) gdprCount++;
            else if ("audit".equalsIgnoreCase(type)) auditCount++;
        }
        html.append("<div class='stats-row'>");
        html.append(Components.statCard("Total Reports", reports.size()));
        html.append(Components.statCard("SOC2 Reports", soc2Count));
        html.append(Components.statCard("GDPR Reports", gdprCount));
        html.append(Components.statCard("Audit Reports", auditCount));
        html.append("</div>");

        // Generate report forms
        html.append(Components.cardStart("Generate Report"));
        html.append("<div class='form-row'>");

        // SOC2
        html.append("<div class='form-group'>");
        html.append("<form method='POST' action='/compliance'>");
        html.append("<input type='hidden' name='report_type' value='soc2'>");
        html.append("<p style='margin-bottom:8px'><strong>SOC2 Compliance</strong></p>");
        html.append("<p style='color:var(--text-muted);font-size:13px;margin-bottom:12px'>Generate a SOC2 Type II compliance report.</p>");
        html.append("<button class='btn btn-primary' type='submit'>Generate SOC2</button>");
        html.append("</form>");
        html.append("</div>");

        // GDPR
        html.append("<div class='form-group'>");
        html.append("<form method='POST' action='/compliance'>");
        html.append("<input type='hidden' name='report_type' value='gdpr'>");
        html.append("<p style='margin-bottom:8px'><strong>GDPR Compliance</strong></p>");
        html.append("<p style='color:var(--text-muted);font-size:13px;margin-bottom:12px'>Generate a GDPR data protection report.</p>");
        html.append("<button class='btn btn-primary' type='submit'>Generate GDPR</button>");
        html.append("</form>");
        html.append("</div>");

        // Audit
        html.append("<div class='form-group'>");
        html.append("<form method='POST' action='/compliance'>");
        html.append("<input type='hidden' name='report_type' value='audit'>");
        html.append("<p style='margin-bottom:8px'><strong>Audit Report</strong></p>");
        html.append("<p style='color:var(--text-muted);font-size:13px;margin-bottom:12px'>Generate a comprehensive audit trail report.</p>");
        html.append("<button class='btn btn-primary' type='submit'>Generate Audit</button>");
        html.append("</form>");
        html.append("</div>");

        html.append("</div>");
        html.append(Components.cardEnd());

        // Reports list
        html.append(Components.cardStart("Reports (" + reports.size() + ")"));
        if (reports.isEmpty()) {
            html.append(Components.empty("&#128203;", "No compliance reports generated yet. Generate one above."));
        } else {
            html.append(Components.tableStart("Type", "Status", "Score", "Issues", "Generated", "Details"));
            for (var r : reports) {
                String type = Helpers.strVal(r, "type");
                if (type.isEmpty()) type = Helpers.strVal(r, "report_type");
                if (type.isEmpty()) type = "-";
                String reportStatus = Helpers.strVal(r, "status");
                if (reportStatus.isEmpty()) reportStatus = "completed";
                String score = Helpers.strVal(r, "score");
                if (score.isEmpty()) score = Helpers.strVal(r, "compliance_score");
                if (score.isEmpty()) score = "-";
                int issues = Helpers.intVal(r, "issues");
                if (issues == 0) issues = Helpers.intVal(r, "findings");
                String generated = Helpers.strVal(r, "created_at");
                if (generated.isEmpty()) generated = Helpers.strVal(r, "generated_at");
                String summary = Helpers.strVal(r, "summary");
                if (summary.isEmpty()) summary = Helpers.strVal(r, "description");
                if (summary.isEmpty()) summary = "-";

                html.append("<tr>");
                html.append("<td>").append(Components.badge(type.toUpperCase(), typeVariant(type))).append("</td>");
                html.append("<td>").append(Components.statusBadge(reportStatus)).append("</td>");
                html.append("<td><strong>").append(Helpers.esc(score)).append("</strong></td>");
                html.append("<td>").append(issues > 0 ? Components.badge(String.valueOf(issues), "danger") : Components.badge("0", "success")).append("</td>");
                html.append("<td style='color:var(--text-muted)'>").append(Helpers.timeAgo(generated)).append("</td>");
                html.append("<td style='color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'>").append(Helpers.esc(summary)).append("</td>");
                html.append("</tr>");
            }
            html.append(Components.tableEnd());
        }
        html.append(Components.cardEnd());

        String flash = SessionManager.consumeFlash(ex);
        SessionManager.respond(ex, 200, Layout.layout("/compliance", SessionManager.getUser(ex), flash, html.toString()));
    }

    private static String typeVariant(String type) {
        if (type == null) return "default";
        switch (type.toLowerCase()) {
            case "soc2": return "primary";
            case "gdpr": return "success";
            case "audit": return "warning";
            default: return "default";
        }
    }
}
