package templates

import "fmt"

// Badge renders a colored badge for a status or role.
func Badge(status string) string {
	colors := map[string]string{
		"active": "#22c55e", "archived": "#888", "suspended": "#ef4444",
		"owner": "#f59e0b", "admin": "#e84393", "member": "#888", "viewer": "#555",
	}
	c := colors[status]
	if c == "" {
		c = "#888"
	}
	return fmt.Sprintf(`<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:%s20;color:%s">%s</span>`, c, c, Esc(status))
}

// DirectionBadge renders a colored badge for message direction.
func DirectionBadge(direction string) string {
	colors := map[string]string{
		"inbound":  "#3b82f6",
		"outbound": "#22c55e",
		"internal": "#888",
	}
	c := colors[direction]
	if c == "" {
		c = "#888"
	}
	return fmt.Sprintf(`<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:%s20;color:%s">%s</span>`, c, c, Esc(direction))
}

// ChannelBadge renders a colored badge for message channel.
func ChannelBadge(channel string) string {
	colors := map[string]string{
		"email":    "#e84393",
		"api":      "#e67700",
		"internal": "#888",
		"webhook":  "#3b82f6",
	}
	c := colors[channel]
	if c == "" {
		c = "#888"
	}
	return fmt.Sprintf(`<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:%s20;color:%s">%s</span>`, c, c, Esc(channel))
}
