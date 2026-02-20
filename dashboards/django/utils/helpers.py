"""
Shared template helpers: badges, status formatting, and page context.
"""

from django.utils.html import escape


def badge(text, badge_type=None):
    """Generate a badge HTML span. Auto-detects type from text if not provided."""
    cls_map = {
        'active': 'b-a',
        'owner': 'b-w',
        'admin': 'b-p',
        'member': 'b-r',
        'viewer': 'b-r',
        'archived': 'b-r',
        'suspended': 'b-r',
        'revoked': 'b-r',
    }
    if badge_type:
        cls = badge_type
    else:
        cls = cls_map.get(text.lower() if text else '', 'b-r')
    return f'<span class="badge {cls}">{escape(text)}</span>'


def status_badge(status):
    """Generate a badge for a status string."""
    return badge(status)


def page_context(request, title, page_name):
    """Build common template context for authenticated pages."""
    return {
        'page_title': title,
        'page_name': page_name,
        'user': request.session.get('user', {}),
        'flash_msg': request.session.pop('flash', None),
    }
