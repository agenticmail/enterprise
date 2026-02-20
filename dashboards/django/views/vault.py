"""
Vault view: manage secrets — add, rotate, and delete.
"""

from django.http import HttpResponse, HttpResponseRedirect
from django.template.loader import render_to_string

from utils.api import api_request
from utils.helpers import badge, page_context


def vault_view(request):
    """Handle secret listing, creation, rotation, and deletion."""
    if not request.session.get('token'):
        return HttpResponseRedirect('/login')

    token = request.session['token']

    if request.method == 'POST':
        action = request.POST.get('_action')
        if action == 'add':
            body = {
                'name': request.POST['name'],
                'value': request.POST['value'],
                'category': request.POST.get('category', 'custom'),
            }
            result = api_request('POST', '/engine/vault/secrets', body=body, token=token)
            request.session['flash'] = 'Secret added!' if 'id' in result else result.get('error', 'Failed')
        elif action == 'rotate':
            secret_id = request.POST.get('secret_id')
            result = api_request('POST', f'/engine/vault/secrets/{secret_id}/rotate', token=token)
            request.session['flash'] = 'Secret rotated!' if not result.get('error') else result.get('error', 'Failed')
        elif action == 'delete':
            secret_id = request.POST.get('secret_id')
            api_request('DELETE', f'/engine/vault/secrets/{secret_id}', token=token)
            request.session['flash'] = 'Secret deleted'
        return HttpResponseRedirect('/vault')

    data = api_request('GET', '/engine/vault/secrets?orgId=default', token=token)
    secrets = data.get('secrets', [])

    for s in secrets:
        cat = s.get('category', 'custom') or 'custom'
        s['category_badge'] = badge(cat)

    ctx = page_context(request, 'Vault', 'vault')
    ctx['secrets'] = secrets

    html = render_to_string('vault.html', ctx)
    return HttpResponse(html)
