"""
Jinja2 template filters for the AgenticMail Enterprise Dashboard.
"""

from datetime import datetime, timezone
from markupsafe import Markup


def badge(text, badge_type=None):
    """Render an inline badge span.

    Args:
        text: The label text inside the badge.
        badge_type: CSS modifier class suffix (e.g. 'active', 'admin', 'danger').
                    If None, defaults to the text value itself (lowercased).
    """
    cls = badge_type or text.lower() if text else 'default'
    return Markup(f'<span class="badge badge-{cls}">{text}</span>')


def status_badge(status):
    """Render a status badge. Maps known statuses to appropriate badge types."""
    mapping = {
        'active': 'active',
        'archived': 'archived',
        'revoked': 'revoked',
        'pending': 'pending',
    }
    cls = mapping.get(status, 'default')
    return Markup(f'<span class="badge badge-{cls}">{status}</span>')


def direction_badge(direction):
    """Render a colored badge for message direction."""
    mapping = {
        'inbound': 'blue',
        'outbound': 'green',
        'internal': 'gray',
    }
    cls = mapping.get((direction or '').lower(), 'default')
    label = direction or 'unknown'
    return Markup(f'<span class="badge badge-{cls}">{label}</span>')


def channel_badge(channel):
    """Render a colored badge for message channel."""
    mapping = {
        'email': 'primary',
        'api': 'warning',
        'internal': 'neutral',
        'webhook': 'info',
    }
    cls = mapping.get((channel or '').lower(), 'default')
    label = channel or 'unknown'
    return Markup(f'<span class="badge badge-{cls}">{label}</span>')


def time_ago(iso_str):
    """Convert an ISO 8601 timestamp string into a human-readable relative time.

    Returns the original string if parsing fails.
    """
    if not iso_str:
        return 'Never'
    try:
        # Handle ISO strings with or without timezone
        if iso_str.endswith('Z'):
            iso_str = iso_str[:-1] + '+00:00'
        dt = datetime.fromisoformat(iso_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        diff = now - dt
        seconds = int(diff.total_seconds())

        if seconds < 60:
            return 'just now'
        elif seconds < 3600:
            m = seconds // 60
            return f'{m}m ago'
        elif seconds < 86400:
            h = seconds // 3600
            return f'{h}h ago'
        elif seconds < 604800:
            d = seconds // 86400
            return f'{d}d ago'
        else:
            return dt.strftime('%b %d, %Y')
    except Exception:
        return iso_str
