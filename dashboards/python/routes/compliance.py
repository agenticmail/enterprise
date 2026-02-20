"""
Compliance routes: generate and view compliance reports.
"""

from flask import Blueprint, render_template, request, session, redirect, url_for, flash
from functools import wraps
from utils.api import api_request

compliance_bp = Blueprint('compliance_bp', __name__)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'token' not in session:
            return redirect(url_for('auth_bp.login'))
        return f(*args, **kwargs)
    return decorated


@compliance_bp.route('/compliance')
@login_required
def compliance():
    data = api_request('GET', '/engine/compliance/reports?orgId=default')
    return render_template(
        'compliance.html',
        active_page='compliance',
        user=session.get('user', {}),
        reports=data.get('reports', []),
    )


@compliance_bp.route('/compliance/generate', methods=['POST'])
@login_required
def generate_report():
    report_type = request.form['type']
    body = {
        'startDate': request.form.get('startDate', ''),
        'endDate': request.form.get('endDate', ''),
        'agentId': request.form.get('agentId', ''),
    }
    type_paths = {
        'soc2': '/engine/compliance/reports/soc2',
        'gdpr': '/engine/compliance/reports/gdpr',
        'audit': '/engine/compliance/reports/audit',
    }
    path = type_paths.get(report_type, '/engine/compliance/reports/audit')
    result = api_request('POST', path, body)
    flash('Report generated!' if not result.get('error') else result.get('error', 'Failed'))
    return redirect(url_for('compliance_bp.compliance'))
