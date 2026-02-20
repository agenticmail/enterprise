"""
Users view: list and create users.
"""

from django.http import HttpResponse, HttpResponseRedirect
from django.template.loader import render_to_string

from utils.api import api_request
from utils.helpers import badge, page_context


def users_view(request):
    """Handle user listing and creation."""
    if not request.session.get('token'):
        return HttpResponseRedirect('/login')

    token = request.session['token']
    flash_msg = request.session.pop('flash', None)

    if request.method == 'POST':
        result = api_request('POST', '/api/users', body={
            'name': request.POST['name'],
            'email': request.POST['email'],
            'role': request.POST.get('role', 'member'),
            'password': request.POST['password'],
        }, token=token)
        request.session['flash'] = 'User created!' if 'id' in result else result.get('error', 'Failed')
        return HttpResponseRedirect('/users')

    data = api_request('GET', '/api/users', token=token)
    users = data.get('users', [])

    # Add badge HTML to each user for template rendering
    for u in users:
        u['role_badge'] = badge(u.get('role', ''))

    ctx = page_context(request, 'Users', 'users')
    ctx['flash_msg'] = flash_msg
    ctx['users'] = users

    html = render_to_string('users.html', ctx)
    return HttpResponse(html)
