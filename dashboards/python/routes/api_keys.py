"""
API Keys routes: list, create, and revoke API keys.
"""

from flask import Blueprint, render_template, request, session, redirect, url_for, flash
from functools import wraps
from utils.api import api_request

api_keys_bp = Blueprint('api_keys_bp', __name__)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'token' not in session:
            return redirect(url_for('auth_bp.login'))
        return f(*args, **kwargs)
    return decorated


@api_keys_bp.route('/api-keys')
@login_required
def api_keys():
    data = api_request('GET', '/api/api-keys')
    return render_template(
        'api_keys.html',
        active_page='api_keys',
        user=session.get('user', {}),
        keys=data.get('keys', []),
    )


@api_keys_bp.route('/api-keys/create', methods=['POST'])
@login_required
def create_api_key():
    result = api_request('POST', '/api/api-keys', {'name': request.form['name']})
    if 'plaintext' in result:
        flash(f"Key created: {result['plaintext']} — SAVE THIS NOW!")
    else:
        flash(result.get('error', 'Failed'))
    return redirect(url_for('api_keys_bp.api_keys'))


@api_keys_bp.route('/api-keys/<id>/revoke', methods=['POST'])
@login_required
def revoke_api_key(id):
    api_request('DELETE', f'/api/api-keys/{id}')
    flash('Key revoked')
    return redirect(url_for('api_keys_bp.api_keys'))
