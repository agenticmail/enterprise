// AgenticMail Enterprise Dashboard — Go Edition
//
// ZERO dependencies beyond the standard library. No frameworks.
//
// Setup:
//   go run .
//
// Or:
//   AGENTICMAIL_URL=https://your-company.agenticmail.io go run .

package main

import (
	"agenticmail-dashboard/handlers"
	"agenticmail-dashboard/middleware"
	"agenticmail-dashboard/services"
	"fmt"
	"log"
	"net/http"
	"os"
)

func main() {
	if url := os.Getenv("AGENTICMAIL_URL"); url != "" {
		services.APIURL = url
	}

	mux := http.NewServeMux()

	// Static files
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	// Auth routes (no auth required)
	mux.HandleFunc("/login", handlers.HandleLogin)
	mux.HandleFunc("/logout", handlers.HandleLogout)

	// Protected routes
	mux.HandleFunc("/", middleware.RequireAuth(handlers.HandleDashboard))
	mux.HandleFunc("/agents", middleware.RequireAuth(handlers.HandleAgents))
	mux.HandleFunc("/agents/", middleware.RequireAuth(handlers.HandleAgents))
	mux.HandleFunc("/users", middleware.RequireAuth(handlers.HandleUsers))
	mux.HandleFunc("/api-keys", middleware.RequireAuth(handlers.HandleAPIKeys))
	mux.HandleFunc("/messages", middleware.RequireAuth(handlers.HandleMessages))
	mux.HandleFunc("/guardrails", middleware.RequireAuth(handlers.HandleGuardrails))
	mux.HandleFunc("/journal", middleware.RequireAuth(handlers.HandleJournal))
	mux.HandleFunc("/dlp", middleware.RequireAuth(handlers.HandleDlp))
	mux.HandleFunc("/compliance", middleware.RequireAuth(handlers.HandleCompliance))
	mux.HandleFunc("/audit", middleware.RequireAuth(handlers.HandleAudit))
	mux.HandleFunc("/settings", middleware.RequireAuth(handlers.HandleSettings))
	mux.HandleFunc("/vault", middleware.RequireAuth(handlers.HandleVault))
	mux.HandleFunc("/skills", middleware.RequireAuth(handlers.HandleSkills))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("\n🏢 🎀 AgenticMail Enterprise Dashboard (Go)\n")
	fmt.Printf("   API:       %s\n", services.APIURL)
	fmt.Printf("   Dashboard: http://localhost:%s\n\n", port)

	log.Fatal(http.ListenAndServe(":"+port, mux))
}
