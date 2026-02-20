"""
Skills view: browse builtin skills and manage installed community skills.
"""

from django.http import HttpResponse, HttpResponseRedirect
from django.template.loader import render_to_string

from utils.api import api_request
from utils.helpers import badge, page_context


def skills_view(request):
    """Handle skill browsing, enabling, disabling, and uninstalling."""
    if not request.session.get('token'):
        return HttpResponseRedirect('/login')

    token = request.session['token']

    if request.method == 'POST':
        action = request.POST.get('_action')
        skill_id = request.POST.get('skill_id')
        if action == 'enable':
            result = api_request('POST', f'/engine/community/{skill_id}/enable', token=token)
            request.session['flash'] = 'Skill enabled!' if not result.get('error') else result.get('error', 'Failed')
        elif action == 'disable':
            result = api_request('POST', f'/engine/community/{skill_id}/disable', token=token)
            request.session['flash'] = 'Skill disabled!' if not result.get('error') else result.get('error', 'Failed')
        elif action == 'uninstall':
            result = api_request('DELETE', f'/engine/community/{skill_id}', token=token)
            request.session['flash'] = 'Skill uninstalled!' if not result.get('error') else result.get('error', 'Failed')
        return HttpResponseRedirect('/skills')

    categories_data = api_request('GET', '/engine/skills/by-category', token=token)
    installed_data = api_request('GET', '/engine/community/installed?orgId=default', token=token)

    categories = categories_data.get('categories', {})
    installed = installed_data.get('skills', [])

    for s in installed:
        if s.get('enabled'):
            s['status_badge'] = badge('enabled', 'b-a')
        else:
            s['status_badge'] = badge('disabled', 'b-r')

    ctx = page_context(request, 'Skills', 'skills')
    ctx['categories'] = categories
    ctx['installed'] = installed

    html = render_to_string('skills.html', ctx)
    return HttpResponse(html)
