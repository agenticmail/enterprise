"""
Journal routes: view action journal entries and rollback operations.
"""

from flask import Blueprint, render_template, request, session, redirect, url_for, flash
from functools import wraps
from utils.api import api_request

journal_bp = Blueprint('journal_bp', __name__)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'token' not in session:
            return redirect(url_for('auth_bp.login'))
        return f(*args, **kwargs)
    return decorated


@journal_bp.route('/journal')
@login_required
def journal():
    data = api_request('GET', '/engine/journal?orgId=default')
    stats = api_request('GET', '/engine/journal/stats/default')
    return render_template(
        'journal.html',
        active_page='journal',
        user=session.get('user', {}),
        entries=data.get('entries', []),
        stats=stats,
    )


@journal_bp.route('/journal/<id>/rollback', methods=['POST'])
@login_required
def rollback(id):
    result = api_request('POST', f'/engine/journal/{id}/rollback')
    flash('Rollback successful!' if not result.get('error') else result.get('error', 'Failed'))
    return redirect(url_for('journal_bp.journal'))
