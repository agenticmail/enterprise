"""
AgenticMail Enterprise Dashboard — Python/Flask Edition

Setup:
    pip install flask requests
    python app.py

Or with environment variable:
    AGENTICMAIL_URL=https://your-company.agenticmail.io python app.py
"""

import os
import sys

# Ensure the project root is on sys.path so that 'utils' and 'routes' resolve
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask

from utils.api import API_URL
from utils.helpers import badge, status_badge, direction_badge, channel_badge, time_ago

from routes.auth import auth_bp
from routes.dashboard import dashboard_bp
from routes.agents import agents_bp
from routes.users import users_bp
from routes.api_keys import api_keys_bp
from routes.audit import audit_bp
from routes.settings import settings_bp
from routes.dlp import dlp_bp
from routes.guardrails import guardrails_bp
from routes.journal import journal_bp
from routes.messages import messages_bp
from routes.compliance import compliance_bp
from routes.vault import vault_bp
from routes.skills import skills_bp


def create_app():
    app = Flask(__name__)
    app.secret_key = os.urandom(32)

    # ─── Register Blueprints ──────────────────────────────
    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(agents_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(api_keys_bp)
    app.register_blueprint(audit_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(dlp_bp)
    app.register_blueprint(guardrails_bp)
    app.register_blueprint(journal_bp)
    app.register_blueprint(messages_bp)
    app.register_blueprint(compliance_bp)
    app.register_blueprint(vault_bp)
    app.register_blueprint(skills_bp)

    # ─── Jinja2 Template Filters ──────────────────────────
    app.jinja_env.filters['badge'] = badge
    app.jinja_env.filters['status_badge'] = status_badge
    app.jinja_env.filters['direction_badge'] = direction_badge
    app.jinja_env.filters['channel_badge'] = channel_badge
    app.jinja_env.filters['time_ago'] = time_ago

    return app


app = create_app()

if __name__ == '__main__':
    print(f'\n   AgenticMail Enterprise Dashboard (Python/Flask)')
    print(f'   API:       {API_URL}')
    print(f'   Dashboard: http://localhost:5000\n')
    app.run(debug=True, port=5000)
