"""
Audit log view: paginated event listing.
"""

from django.http import HttpResponse, HttpResponseRedirect
from django.template.loader import render_to_string

from utils.api import api_request
from utils.helpers import page_context


def audit_view(request):
    """Display paginated audit events."""
    if not request.session.get('token'):
        return HttpResponseRedirect('/login')

    token = request.session['token']
    page_num = max(0, int(request.GET.get('p', 0)))
    data = api_request('GET', f'/api/audit?limit=25&offset={page_num * 25}', token=token)
    events = data.get('events', [])
    total = data.get('total', 0)

    ctx = page_context(request, 'Audit Log', 'audit')
    ctx['events'] = events
    ctx['total'] = total
    # Pagination context
    ctx['page_num'] = page_num
    ctx['prev_page'] = page_num - 1
    ctx['current_page'] = page_num + 1
    ctx['next_page'] = page_num + 1
    ctx['has_next'] = (page_num + 1) * 25 < total
    ctx['base_url'] = '/audit'

    html = render_to_string('audit.html', ctx)
    return HttpResponse(html)
