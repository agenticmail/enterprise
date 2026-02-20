"""
Guardrails routes: manage interventions, pause/resume/kill agents, and anomaly rules.
"""

from flask import Blueprint, render_template, request, session, redirect, url_for, flash
from functools import wraps
from utils.api import api_request

guardrails_bp = Blueprint('guardrails_bp', __name__)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'token' not in session:
            return redirect(url_for('auth_bp.login'))
        return f(*args, **kwargs)
    return decorated


@guardrails_bp.route('/guardrails')
@login_required
def guardrails():
    interventions = api_request('GET', '/engine/guardrails/interventions?orgId=default')
    anomaly_rules = api_request('GET', '/engine/anomaly-rules?orgId=default')
    return render_template(
        'guardrails.html',
        active_page='guardrails',
        user=session.get('user', {}),
        interventions=interventions.get('interventions', []),
        anomaly_rules=anomaly_rules.get('rules', []),
    )


@guardrails_bp.route('/guardrails/pause', methods=['POST'])
@login_required
def pause_agent():
    body = {'agentId': request.form['agentId'], 'reason': request.form.get('reason', '')}
    result = api_request('POST', f'/engine/guardrails/pause/{request.form["agentId"]}', body)
    flash('Agent paused!' if not result.get('error') else result.get('error', 'Failed'))
    return redirect(url_for('guardrails_bp.guardrails'))


@guardrails_bp.route('/guardrails/resume/<id>', methods=['POST'])
@login_required
def resume_agent(id):
    api_request('POST', f'/engine/guardrails/resume/{id}')
    flash('Agent resumed')
    return redirect(url_for('guardrails_bp.guardrails'))


@guardrails_bp.route('/guardrails/kill/<id>', methods=['POST'])
@login_required
def kill_agent(id):
    api_request('POST', f'/engine/guardrails/kill/{id}')
    flash('Agent killed')
    return redirect(url_for('guardrails_bp.guardrails'))


@guardrails_bp.route('/anomaly-rules/create', methods=['POST'])
@login_required
def create_anomaly_rule():
    body = {
        'name': request.form['name'],
        'condition': request.form['condition'],
        'action': request.form.get('action', 'alert'),
        'threshold': request.form.get('threshold', ''),
    }
    result = api_request('POST', '/engine/anomaly-rules', body)
    flash('Anomaly rule created!' if 'id' in result else result.get('error', 'Failed'))
    return redirect(url_for('guardrails_bp.guardrails'))


@guardrails_bp.route('/anomaly-rules/<id>/delete', methods=['POST'])
@login_required
def delete_anomaly_rule(id):
    api_request('DELETE', f'/engine/anomaly-rules/{id}')
    flash('Anomaly rule deleted')
    return redirect(url_for('guardrails_bp.guardrails'))
