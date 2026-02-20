"""
Dashboard route: main overview page with stats and recent audit activity.
"""

from flask import Blueprint, render_template, session, redirect, url_for
from functools import wraps
from utils.api import api_request

dashboard_bp = Blueprint('dashboard_bp', __name__)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'token' not in session:
            return redirect(url_for('auth_bp.login'))
        return f(*args, **kwargs)
    return decorated


@dashboard_bp.route('/')
@login_required
def dashboard():
    stats = api_request('GET', '/api/stats')
    audit = api_request('GET', '/api/audit?limit=8')
    return render_template(
        'dashboard.html',
        active_page='dashboard',
        user=session.get('user', {}),
        stats=stats,
        audit=audit.get('events', []),
    )
