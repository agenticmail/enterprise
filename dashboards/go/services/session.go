package services

import (
	"fmt"
	"net/http"
	"sync"
	"time"
)

// Session holds the authentication token and user information for a logged-in user.
type Session struct {
	Token string
	User  map[string]interface{}
}

var (
	sessions = map[string]*Session{}
	sessMu   sync.RWMutex
)

// GetSession retrieves the session for the current request from the in-memory store.
// Returns nil if no valid session cookie is found.
func GetSession(r *http.Request) *Session {
	c, err := r.Cookie("am_session")
	if err != nil {
		return nil
	}
	sessMu.RLock()
	defer sessMu.RUnlock()
	return sessions[c.Value]
}

// SetSession creates a new session in the in-memory store and sets a session cookie.
func SetSession(w http.ResponseWriter, s *Session) string {
	id := fmt.Sprintf("%d", time.Now().UnixNano())
	sessMu.Lock()
	sessions[id] = s
	sessMu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: "am_session", Value: id, Path: "/", HttpOnly: true, MaxAge: 86400})
	return id
}

// ClearSession removes the session from the in-memory store and clears the session cookie.
func ClearSession(w http.ResponseWriter, r *http.Request) {
	c, err := r.Cookie("am_session")
	if err == nil {
		sessMu.Lock()
		delete(sessions, c.Value)
		sessMu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{Name: "am_session", Value: "", Path: "/", MaxAge: -1})
}
