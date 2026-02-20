package templates

import (
	"fmt"
	"html"
)

// Esc safely escapes a value for HTML output.
func Esc(s interface{}) string {
	if s == nil {
		return ""
	}
	return html.EscapeString(fmt.Sprintf("%v", s))
}

// IntVal extracts an integer value from a map by key.
func IntVal(m map[string]interface{}, key string) int {
	if v, ok := m[key]; ok {
		switch n := v.(type) {
		case float64:
			return int(n)
		case int:
			return n
		}
	}
	return 0
}

// StrVal extracts a string value from a map by key.
func StrVal(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok && v != nil {
		return fmt.Sprintf("%v", v)
	}
	return ""
}
