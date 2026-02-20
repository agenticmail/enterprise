"""
View imports for URL routing.
"""

from views.auth import login_view, logout_view
from views.dashboard import dashboard_view
from views.agents import agents_view, agent_detail_view, provider_models_view
from views.users import users_view
from views.api_keys import api_keys_view
from views.audit import audit_view
from views.settings_view import settings_view
from views.dlp import dlp_view
from views.guardrails import guardrails_view
from views.journal import journal_view
from views.messages import messages_view
from views.compliance import compliance_view
from views.vault import vault_view
from views.skills import skills_view

__all__ = [
    'login_view',
    'logout_view',
    'dashboard_view',
    'agents_view',
    'agent_detail_view',
    'provider_models_view',
    'users_view',
    'api_keys_view',
    'audit_view',
    'settings_view',
    'dlp_view',
    'guardrails_view',
    'journal_view',
    'messages_view',
    'compliance_view',
    'vault_view',
    'skills_view',
]
