package handlers

import (
	"agenticmail-dashboard/services"
	"agenticmail-dashboard/templates"
	"fmt"
	"net/http"
)

// HandleLogin serves the login page (GET) and processes login form submissions (POST).
func HandleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, templates.LoginPage())
		return
	}
	r.ParseForm()
	data, err := services.APICall("/auth/login", "POST", "", map[string]string{
		"email": r.FormValue("email"), "password": r.FormValue("password"),
	})
	if err != nil || data["token"] == nil {
		errMsg := "Login failed"
		if data != nil && data["error"] != nil {
			errMsg = fmt.Sprintf("%v", data["error"])
		}
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprintf(w, `<html><body style="background:#f8f9fa;color:#ef4444;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh"><div>%s <a href="/login" style="color:#e84393">Try again</a></div></body></html>`, templates.Esc(errMsg))
		return
	}
	user, _ := data["user"].(map[string]interface{})
	services.SetSession(w, &services.Session{Token: fmt.Sprintf("%v", data["token"]), User: user})
	http.Redirect(w, r, "/", http.StatusFound)
}

// HandleLogout clears the session and redirects to the login page.
func HandleLogout(w http.ResponseWriter, r *http.Request) {
	services.ClearSession(w, r)
	http.Redirect(w, r, "/login", http.StatusFound)
}
