"""
Authentication views: login and logout.
"""

from django.http import HttpResponse, HttpResponseRedirect
from django.template.loader import render_to_string

from utils.api import api_request, API_URL


def login_view(request):
    """Handle login form display and submission."""
    error = None
    if request.method == 'POST':
        email = request.POST.get('email', '')
        password = request.POST.get('password', '')
        data = api_request('POST', '/auth/login', body={'email': email, 'password': password})
        if 'token' in data:
            request.session['token'] = data['token']
            request.session['user'] = data['user']
            return HttpResponseRedirect('/')
        error = data.get('error', 'Login failed')

    html = render_to_string('login.html', {
        'error': error,
        'api_url': API_URL,
    })
    return HttpResponse(html)


def logout_view(request):
    """Flush session and redirect to login."""
    request.session.flush()
    return HttpResponseRedirect('/login')
