"""
Journal view: view entries, stats, and rollback actions.
"""

from django.http import HttpResponse, HttpResponseRedirect
from django.template.loader import render_to_string

from utils.api import api_request
from utils.helpers import badge, page_context


def journal_view(request):
    """Handle journal entries, stats, and rollback."""
    if not request.session.get('token'):
        return HttpResponseRedirect('/login')

    token = request.session['token']

    if request.method == 'POST':
        action = request.POST.get('_action')
        if action == 'rollback':
            entry_id = request.POST.get('entry_id')
            result = api_request('POST', f'/engine/journal/{entry_id}/rollback', token=token)
            request.session['flash'] = 'Rollback successful!' if 'id' in result else result.get('error', 'Rollback failed')
        return HttpResponseRedirect('/journal')

    entries_data = api_request('GET', '/engine/journal?orgId=default', token=token)
    entries = entries_data.get('entries', [])

    stats_data = api_request('GET', '/engine/journal/stats/default', token=token)
    stats = stats_data.get('stats', {})

    for e in entries:
        e['status_badge'] = badge(e.get('status', ''))

    ctx = page_context(request, 'Journal', 'journal')
    ctx['entries'] = entries
    ctx['stats'] = stats

    html = render_to_string('journal.html', ctx)
    return HttpResponse(html)
