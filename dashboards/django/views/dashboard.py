"""
Dashboard view: stats overview and recent audit events.
"""

from django.http import HttpResponse, HttpResponseRedirect
from django.template.loader import render_to_string

from utils.api import api_request
from utils.helpers import page_context


def dashboard_view(request):
    """Display dashboard with stats and recent activity."""
    if not request.session.get('token'):
        return HttpResponseRedirect('/login')

    token = request.session['token']
    stats = api_request('GET', '/api/stats', token=token)
    audit = api_request('GET', '/api/audit?limit=8', token=token)
    events = audit.get('events', [])

    ctx = page_context(request, 'Dashboard', 'dashboard')
    ctx['stats'] = stats
    ctx['events'] = events

    html = render_to_string('dashboard.html', ctx)
    return HttpResponse(html)
