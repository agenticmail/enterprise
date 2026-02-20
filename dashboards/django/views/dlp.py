"""
DLP view: manage data loss prevention rules, violations, and scanning.
"""

from django.http import HttpResponse, HttpResponseRedirect
from django.template.loader import render_to_string

from utils.api import api_request
from utils.helpers import badge, page_context


def dlp_view(request):
    """Handle DLP rules, violations, and scan actions."""
    if not request.session.get('token'):
        return HttpResponseRedirect('/login')

    token = request.session['token']

    if request.method == 'POST':
        action = request.POST.get('_action')
        if action == 'create_rule':
            body = {
                'name': request.POST['name'],
                'pattern': request.POST['pattern'],
                'severity': request.POST.get('severity', 'medium'),
            }
            result = api_request('POST', '/engine/dlp/rules', body=body, token=token)
            request.session['flash'] = 'Rule created!' if 'id' in result else result.get('error', 'Failed')
        elif action == 'delete_rule':
            rule_id = request.POST.get('rule_id')
            api_request('DELETE', f'/engine/dlp/rules/{rule_id}', token=token)
            request.session['flash'] = 'Rule deleted'
        elif action == 'scan':
            body = {'content': request.POST.get('content', '')}
            result = api_request('POST', '/engine/dlp/scan', body=body, token=token)
            request.session['flash'] = f"Scan complete: {result.get('matches', 0)} matches found" if 'matches' in result else result.get('error', 'Scan failed')
        return HttpResponseRedirect('/dlp')

    rules_data = api_request('GET', '/engine/dlp/rules?orgId=default', token=token)
    rules = rules_data.get('rules', [])

    violations_data = api_request('GET', '/engine/dlp/violations?orgId=default', token=token)
    violations = violations_data.get('violations', [])

    for r in rules:
        r['severity_badge'] = badge(r.get('severity', 'medium'))

    ctx = page_context(request, 'Data Loss Prevention', 'dlp')
    ctx['rules'] = rules
    ctx['violations'] = violations

    html = render_to_string('dlp.html', ctx)
    return HttpResponse(html)
