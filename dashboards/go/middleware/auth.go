package middleware

import (
	"agenticmail-dashboard/services"
	"net/http"
)

// RequireAuth wraps an http.HandlerFunc and redirects to /login if there is no active session.
func RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if services.GetSession(r) == nil {
			http.Redirect(w, r, "/login", http.StatusFound)
			return
		}
		next(w, r)
	}
}
