"""
AgenticMail Enterprise Dashboard — Django Edition

Modular Django app. No project scaffolding needed.

Setup:
    pip install django requests
    python app.py

Or with environment variable:
    AGENTICMAIL_URL=https://your-company.agenticmail.io python app.py
"""

import os, sys, secrets

# ─── Ensure the django/ directory is on sys.path ─────────
# This allows `from views.xxx import ...` and `from utils.xxx import ...`
# to work when app.py is the entry point.
APP_DIR = os.path.dirname(os.path.abspath(__file__))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

TEMPLATES_DIR = os.path.join(APP_DIR, 'templates')
STATIC_DIR = os.path.join(APP_DIR, 'static')

# ─── Django Configuration ─────────────────────────────────

os.environ.setdefault('DJANGO_SETTINGS_MODULE', '__main__')

SECRET_KEY = secrets.token_hex(32)
DEBUG = True
ALLOWED_HOSTS = ['*']
ROOT_URLCONF = '__main__'
INSTALLED_APPS = ['django.contrib.sessions', 'django.contrib.contenttypes']
MIDDLEWARE = [
    'django.middleware.common.CommonMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
]
SESSION_ENGINE = 'django.contrib.sessions.backends.signed_cookies'
SESSION_COOKIE_HTTPONLY = True
TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [TEMPLATES_DIR],
    'APP_DIRS': False,
    'OPTIONS': {
        'context_processors': [],
    },
}]
STATICFILES_DIRS = [STATIC_DIR]

# ─── Django Setup ─────────────────────────────────────────

import django
from django.conf import settings as django_settings
if not django_settings.configured:
    django_settings.configure(
        SECRET_KEY=SECRET_KEY,
        DEBUG=DEBUG,
        ALLOWED_HOSTS=ALLOWED_HOSTS,
        ROOT_URLCONF=ROOT_URLCONF,
        INSTALLED_APPS=INSTALLED_APPS,
        MIDDLEWARE=MIDDLEWARE,
        SESSION_ENGINE=SESSION_ENGINE,
        SESSION_COOKIE_HTTPONLY=SESSION_COOKIE_HTTPONLY,
        TEMPLATES=TEMPLATES,
        STATICFILES_DIRS=STATICFILES_DIRS,
    )
    django.setup()

# ─── URL Patterns ─────────────────────────────────────────

from django.urls import path
from views import (
    login_view, logout_view, dashboard_view,
    agents_view, agent_detail_view, provider_models_view,
    users_view, api_keys_view,
    audit_view, settings_view,
    dlp_view, guardrails_view, journal_view,
    messages_view, compliance_view,
    vault_view, skills_view,
    # New pages
    activity_view, approvals_view, community_skills_view, domain_status_view,
    knowledge_view, knowledge_contributions_view, skill_connections_view, workforce_view,
)

urlpatterns = [
    path('login', login_view),
    path('logout', logout_view),
    path('', dashboard_view),
    path('agents', agents_view),
    path('agents/<str:agent_id>', agent_detail_view),
    path('api/providers/<str:provider_id>/models', provider_models_view),
    path('users', users_view),
    path('api-keys', api_keys_view),
    path('audit', audit_view),
    path('settings', settings_view),
    path('dlp', dlp_view),
    path('guardrails', guardrails_view),
    path('journal', journal_view),
    path('messages', messages_view),
    path('compliance', compliance_view),
    path('vault', vault_view),
    path('skills', skills_view),
    # New pages
    path('activity', activity_view),
    path('approvals', approvals_view),
    path('community-skills', community_skills_view),
    path('domain-status', domain_status_view),
    path('knowledge', knowledge_view),
    path('knowledge-contributions', knowledge_contributions_view),
    path('skill-connections', skill_connections_view),
    path('workforce', workforce_view),
]

# ─── WSGI Application ────────────────────────────────────

from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()

# ─── Run Server ───────────────────────────────────────────

if __name__ == '__main__':
    from django.core.management import execute_from_command_line
    API_URL = os.getenv('AGENTICMAIL_URL', 'http://localhost:3000')
    port = os.getenv('PORT', '5002')
    print(f'\n\U0001f3e2 AgenticMail Enterprise Dashboard (Django)')
    print(f'   API:       {API_URL}')
    print(f'   Dashboard: http://localhost:{port}\n')
    execute_from_command_line(['app.py', 'runserver', f'0.0.0.0:{port}', '--noreload'])
