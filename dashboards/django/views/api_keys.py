"""
API Keys view: list, create, and revoke API keys.
"""

from django.http import HttpResponse, HttpResponseRedirect
from django.template.loader import render_to_string

from utils.api import api_request
from utils.helpers import badge, page_context


def api_keys_view(request):
    """Handle API key listing, creation, and revocation."""
    if not request.session.get('token'):
        return HttpResponseRedirect('/login')

    token = request.session['token']
    flash_msg = request.session.pop('flash', None)

    if request.method == 'POST':
        action = request.POST.get('_action')
        if action == 'create':
            result = api_request('POST', '/api/api-keys', body={'name': request.POST['name']}, token=token)
            if 'plaintext' in result:
                request.session['flash'] = f"Key created: {result['plaintext']} — SAVE THIS NOW!"
            else:
                request.session['flash'] = result.get('error', 'Failed')
        elif action == 'revoke':
            key_id = request.POST.get('key_id')
            api_request('DELETE', f'/api/api-keys/{key_id}', token=token)
            request.session['flash'] = 'Key revoked'
        return HttpResponseRedirect('/api-keys')

    data = api_request('GET', '/api/api-keys', token=token)
    keys = data.get('keys', [])

    # Add badge HTML and status to each key for template rendering
    for k in keys:
        status = 'revoked' if k.get('revoked') else 'active'
        k['status_badge'] = badge(status)

    ctx = page_context(request, 'API Keys', 'keys')
    ctx['flash_msg'] = flash_msg
    ctx['keys'] = keys

    html = render_to_string('api_keys.html', ctx)
    return HttpResponse(html)
