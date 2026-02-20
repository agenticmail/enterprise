"""
Audit Log route: paginated list of audit events.
"""

from flask import Blueprint, render_template, request, session, redirect, url_for
from functools import wraps
from utils.api import api_request

audit_bp = Blueprint('audit_bp', __name__)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'token' not in session:
            return redirect(url_for('auth_bp.login'))
        return f(*args, **kwargs)
    return decorated


@audit_bp.route('/audit')
@login_required
def audit():
    page = max(0, int(request.args.get('p', 0)))
    data = api_request('GET', f'/api/audit?limit=25&offset={page * 25}')
    return render_template(
        'audit.html',
        active_page='audit',
        user=session.get('user', {}),
        events=data.get('events', []),
        total=data.get('total', 0),
        page=page,
    )
