"""
Messages view: list and send messages.
"""

from django.http import HttpResponse, HttpResponseRedirect
from django.template.loader import render_to_string
from django.utils.html import escape

from utils.api import api_request
from utils.helpers import page_context


# Badge class mappings for direction and channel
DIRECTION_BADGE_MAP = {
    'inbound': 'b-blue',
    'outbound': 'b-a',
    'internal': 'b-r',
}

CHANNEL_BADGE_MAP = {
    'email': 'b-p',
    'api': 'b-w',
    'internal': 'b-neutral',
    'webhook': 'b-info',
}


def _make_badge(value, badge_map):
    """Generate badge HTML for a given value using the provided class map."""
    cls = badge_map.get((value or '').lower(), 'b-r')
    return f'<span class="badge {cls}">{escape(value or "unknown")}</span>'


def messages_view(request):
    """Handle message listing and sending."""
    if not request.session.get('token'):
        return HttpResponseRedirect('/login')

    token = request.session['token']

    if request.method == 'POST':
        action = request.POST.get('_action')
        if action == 'send':
            body = {
                'to': request.POST['to'],
                'subject': request.POST['subject'],
                'body': request.POST.get('body', ''),
            }
            result = api_request('POST', '/engine/messages', body=body, token=token)
            request.session['flash'] = 'Message sent!' if 'id' in result else result.get('error', 'Failed')
        return HttpResponseRedirect('/messages')

    data = api_request('GET', '/engine/messages?orgId=default', token=token)
    messages = data.get('messages', [])

    # Add direction and channel badge HTML to each message
    for m in messages:
        m['direction_badge'] = _make_badge(m.get('direction', ''), DIRECTION_BADGE_MAP)
        m['channel_badge'] = _make_badge(m.get('channel', ''), CHANNEL_BADGE_MAP)

    ctx = page_context(request, 'Messages', 'messages')
    ctx['messages'] = messages

    html = render_to_string('messages.html', ctx)
    return HttpResponse(html)
