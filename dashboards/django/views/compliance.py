"""
Compliance view: generate and list compliance reports.
"""

from django.http import HttpResponse, HttpResponseRedirect
from django.template.loader import render_to_string

from utils.api import api_request
from utils.helpers import badge, page_context


def compliance_view(request):
    """Handle compliance report listing and generation."""
    if not request.session.get('token'):
        return HttpResponseRedirect('/login')

    token = request.session['token']

    if request.method == 'POST':
        action = request.POST.get('_action')
        if action == 'generate':
            report_type = request.POST.get('report_type', 'soc2')
            result = api_request('POST', f'/engine/compliance/reports/{report_type}', token=token)
            request.session['flash'] = 'Report generated!' if 'id' in result else result.get('error', 'Failed')
        return HttpResponseRedirect('/compliance')

    data = api_request('GET', '/engine/compliance/reports?orgId=default', token=token)
    reports = data.get('reports', [])

    for r in reports:
        r['status_badge'] = badge(r.get('status', ''))

    ctx = page_context(request, 'Compliance', 'compliance')
    ctx['reports'] = reports

    html = render_to_string('compliance.html', ctx)
    return HttpResponse(html)
