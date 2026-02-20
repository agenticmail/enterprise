"""
Vault routes: manage secrets — add, rotate, and delete.
"""

from flask import Blueprint, render_template, request, session, redirect, url_for, flash
from functools import wraps
from utils.api import api_request

vault_bp = Blueprint('vault_bp', __name__)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'token' not in session:
            return redirect(url_for('auth_bp.login'))
        return f(*args, **kwargs)
    return decorated


@vault_bp.route('/vault')
@login_required
def vault():
    data = api_request('GET', '/engine/vault/secrets?orgId=default')
    return render_template(
        'vault.html',
        active_page='vault',
        user=session.get('user', {}),
        secrets=data.get('secrets', []),
    )


@vault_bp.route('/vault/add', methods=['POST'])
@login_required
def add_secret():
    body = {
        'name': request.form['name'],
        'value': request.form['value'],
        'category': request.form.get('category', 'custom'),
    }
    result = api_request('POST', '/engine/vault/secrets', body)
    flash('Secret added!' if 'id' in result else result.get('error', 'Failed'))
    return redirect(url_for('vault_bp.vault'))


@vault_bp.route('/vault/<id>/rotate', methods=['POST'])
@login_required
def rotate_secret(id):
    result = api_request('POST', f'/engine/vault/secrets/{id}/rotate')
    flash('Secret rotated!' if not result.get('error') else result.get('error', 'Failed'))
    return redirect(url_for('vault_bp.vault'))


@vault_bp.route('/vault/<id>/delete', methods=['POST'])
@login_required
def delete_secret(id):
    api_request('DELETE', f'/engine/vault/secrets/{id}')
    flash('Secret deleted')
    return redirect(url_for('vault_bp.vault'))
