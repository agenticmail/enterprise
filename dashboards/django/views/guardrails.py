"""
Guardrails view: manage agent interventions and anomaly rules.
"""

from django.http import HttpResponse, HttpResponseRedirect
from django.template.loader import render_to_string

from utils.api import api_request
from utils.helpers import badge, page_context


def guardrails_view(request):
    """Handle interventions, anomaly rules, and agent controls."""
    if not request.session.get('token'):
        return HttpResponseRedirect('/login')

    token = request.session['token']

    if request.method == 'POST':
        action = request.POST.get('_action')
        if action == 'pause':
            agent_id = request.POST.get('agent_id')
            api_request('POST', f'/engine/guardrails/pause/{agent_id}', token=token)
            request.session['flash'] = 'Agent paused'
        elif action == 'resume':
            agent_id = request.POST.get('agent_id')
            api_request('POST', f'/engine/guardrails/resume/{agent_id}', token=token)
            request.session['flash'] = 'Agent resumed'
        elif action == 'kill':
            agent_id = request.POST.get('agent_id')
            api_request('POST', f'/engine/guardrails/kill/{agent_id}', token=token)
            request.session['flash'] = 'Agent killed'
        elif action == 'create_rule':
            body = {
                'name': request.POST['name'],
                'condition': request.POST['condition'],
                'action': request.POST.get('rule_action', 'alert'),
            }
            result = api_request('POST', '/engine/anomaly-rules', body=body, token=token)
            request.session['flash'] = 'Rule created!' if 'id' in result else result.get('error', 'Failed')
        elif action == 'delete_rule':
            rule_id = request.POST.get('rule_id')
            api_request('DELETE', f'/engine/anomaly-rules/{rule_id}', token=token)
            request.session['flash'] = 'Rule deleted'
        return HttpResponseRedirect('/guardrails')

    interventions_data = api_request('GET', '/engine/guardrails/interventions?orgId=default', token=token)
    interventions = interventions_data.get('interventions', [])

    rules_data = api_request('GET', '/engine/anomaly-rules?orgId=default', token=token)
    anomaly_rules = rules_data.get('rules', [])

    for i in interventions:
        i['status_badge'] = badge(i.get('status', ''))

    ctx = page_context(request, 'Guardrails', 'guardrails')
    ctx['interventions'] = interventions
    ctx['anomaly_rules'] = anomaly_rules

    html = render_to_string('guardrails.html', ctx)
    return HttpResponse(html)
