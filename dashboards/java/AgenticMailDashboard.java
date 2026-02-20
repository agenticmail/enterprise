/**
 * AgenticMail Enterprise Dashboard — Java Edition (Modular)
 *
 * ZERO dependencies. Uses only JDK built-in classes (Java 11+).
 * No Spring, no Maven, no Gradle needed.
 *
 * Compile & Run:
 *   cd java/
 *   javac AgenticMailDashboard.java services/*.java templates/*.java handlers/*.java
 *   java AgenticMailDashboard
 *
 * Or with env vars:
 *   AGENTICMAIL_URL=https://your-company.agenticmail.io java AgenticMailDashboard
 *
 * File Structure:
 *   AgenticMailDashboard.java  — Entry point: server setup, register all handlers
 *   handlers/
 *     AuthHandler.java         — Login/logout
 *     DashboardHandler.java    — Stats + recent audit
 *     AgentsHandler.java       — List, create, archive
 *     UsersHandler.java        — List, create
 *     ApiKeysHandler.java      — List, create, revoke
 *     AuditHandler.java        — Paginated events
 *     SettingsHandler.java     — Read + update
 *     DlpHandler.java          — DLP rules, violations, scan
 *     GuardrailsHandler.java   — Interventions, anomaly rules, pause/resume/kill
 *     JournalHandler.java      — Journal entries, stats, rollback
 *     MessagesHandler.java     — List, send messages
 *     ComplianceHandler.java   — Reports: SOC2, GDPR, Audit
 *   services/
 *     ApiClient.java           — HTTP client + JSON parsing
 *     SessionManager.java      — ConcurrentHashMap session store
 *   templates/
 *     Layout.java              — layout(), loginPage()
 *     Components.java          — badge(), statCard(), tableStart/End, pagination()
 *     Helpers.java             — esc(), timeAgo(), intVal(), strVal()
 *   static/
 *     styles.css               — Shared design system CSS
 */

import com.sun.net.httpserver.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.concurrent.*;

public class AgenticMailDashboard {

    public static void main(String[] args) throws Exception {

        // ─── Configuration ──────────────────────────────
        String envUrl = System.getenv("AGENTICMAIL_URL");
        if (envUrl != null && !envUrl.isEmpty()) {
            ApiClient.API_URL = envUrl;
        }

        int port = 8081;
        String envPort = System.getenv("PORT");
        if (envPort != null && !envPort.isEmpty()) {
            port = Integer.parseInt(envPort);
        }

        // ─── Create Server ──────────────────────────────
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.setExecutor(Executors.newFixedThreadPool(10));

        // ─── Static Files ───────────────────────────────
        server.createContext("/static/", ex -> {
            try {
                String path = ex.getRequestURI().getPath();
                // Security: prevent directory traversal
                if (path.contains("..")) {
                    SessionManager.respond(ex, 403, "Forbidden");
                    return;
                }
                // Serve from static/ directory relative to working directory
                String filename = path.substring("/static/".length());
                Path filePath = Paths.get("static", filename);
                if (Files.exists(filePath) && !Files.isDirectory(filePath)) {
                    String css = Files.readString(filePath, StandardCharsets.UTF_8);
                    SessionManager.respondCss(ex, css);
                } else {
                    SessionManager.respond(ex, 404, "Not found");
                }
            } catch (Exception e) {
                SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
            }
        });

        // ─── Auth Routes ────────────────────────────────
        AuthHandler authHandler = new AuthHandler();
        server.createContext("/login", authHandler);
        server.createContext("/logout", authHandler);

        // ─── Protected Routes ───────────────────────────
        // Note: HttpServer matches by longest prefix, so /agents/X/archive
        // is handled inside AgentsHandler based on path parsing.
        // We register specific prefixes to avoid overlap.
        server.createContext("/agents", new AgentsHandler());
        server.createContext("/users", new UsersHandler());
        server.createContext("/api-keys", new ApiKeysHandler());
        server.createContext("/audit", new AuditHandler());
        server.createContext("/settings", new SettingsHandler());
        server.createContext("/dlp", new DlpHandler());
        server.createContext("/guardrails", new GuardrailsHandler());
        server.createContext("/journal", new JournalHandler());
        server.createContext("/messages", new MessagesHandler());
        server.createContext("/compliance", new ComplianceHandler());
        server.createContext("/vault", new VaultHandler());
        server.createContext("/skills", new SkillsHandler());

        // ─── Dashboard (root) ───────────────────────────
        server.createContext("/", ex -> {
            try {
                String path = ex.getRequestURI().getPath();
                // Only handle exact "/" — other paths are 404
                if (!path.equals("/")) {
                    SessionManager.respond(ex, 404,
                        "<!DOCTYPE html><html><body style='font-family:sans-serif;padding:40px'>" +
                        "<h1>404</h1><p>Page not found</p><a href='/'>Go to Dashboard</a></body></html>");
                    return;
                }
                new DashboardHandler().handle(ex);
            } catch (Exception e) {
                SessionManager.respond(ex, 500, "Error: " + Helpers.esc(e.getMessage()));
            }
        });

        // ─── Start ──────────────────────────────────────
        server.start();
        System.out.println();
        System.out.println("  AgenticMail Enterprise Dashboard (Java - Modular)");
        System.out.println("  API:       " + ApiClient.API_URL);
        System.out.println("  Dashboard: http://localhost:" + port);
        System.out.println();
        System.out.println("  Pages:");
        System.out.println("    /           Dashboard (stats + recent audit)");
        System.out.println("    /agents     Agents (list, create, archive)");
        System.out.println("    /users      Users (list, create)");
        System.out.println("    /api-keys   API Keys (list, create, revoke)");
        System.out.println("    /audit      Audit Log (paginated, 25/page)");
        System.out.println("    /settings   Settings (read + update)");
        System.out.println("    /messages   Messages (list, send)");
        System.out.println("    /guardrails Guardrails (interventions, rules, pause/resume/kill)");
        System.out.println("    /journal    Journal (entries, stats, rollback)");
        System.out.println("    /dlp        DLP (rules, violations, scan)");
        System.out.println("    /compliance Compliance (SOC2, GDPR, Audit reports)");
        System.out.println("    /vault      Vault (secrets management)");
        System.out.println("    /skills     Skills (builtin + community)");
        System.out.println();
    }
}
