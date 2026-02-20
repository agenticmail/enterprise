"""
DLP routes: manage data loss prevention rules, violations, and scanning.
"""

from flask import Blueprint, render_template, request, session, redirect, url_for, flash
from functools import wraps
from utils.api import api_request

dlp_bp = Blueprint('dlp_bp', __name__)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'token' not in session:
            return redirect(url_for('auth_bp.login'))
        return f(*args, **kwargs)
    return decorated


@dlp_bp.route('/dlp')
@login_required
def dlp():
    rules = api_request('GET', '/engine/dlp/rules?orgId=default')
    violations = api_request('GET', '/engine/dlp/violations?orgId=default')
    return render_template(
        'dlp.html',
        active_page='dlp',
        user=session.get('user', {}),
        rules=rules.get('rules', []),
        violations=violations.get('violations', []),
    )


@dlp_bp.route('/dlp/rules/create', methods=['POST'])
@login_required
def create_rule():
    body = {
        'name': request.form['name'],
        'type': request.form['type'],
        'pattern': request.form['pattern'],
        'action': request.form.get('action', 'block'),
        'severity': request.form.get('severity', 'high'),
    }
    result = api_request('POST', '/engine/dlp/rules', body)
    flash('DLP rule created!' if 'id' in result else result.get('error', 'Failed'))
    return redirect(url_for('dlp_bp.dlp'))


@dlp_bp.route('/dlp/rules/<id>/delete', methods=['POST'])
@login_required
def delete_rule(id):
    api_request('DELETE', f'/engine/dlp/rules/{id}')
    flash('DLP rule deleted')
    return redirect(url_for('dlp_bp.dlp'))


@dlp_bp.route('/dlp/scan', methods=['POST'])
@login_required
def scan():
    body = {'content': request.form['content']}
    result = api_request('POST', '/engine/dlp/scan', body)
    flash(f'Scan complete — {len(result.get("violations", []))} violation(s) found')
    return redirect(url_for('dlp_bp.dlp'))
