"""
Agents routes: list, create, detail, and archive AI agents.
"""

import re

from flask import Blueprint, render_template, request, session, redirect, url_for, flash
from functools import wraps
from utils.api import api_request

agents_bp = Blueprint('agents_bp', __name__)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'token' not in session:
            return redirect(url_for('auth_bp.login'))
        return f(*args, **kwargs)
    return decorated


def _resolve_agent_fields(agent):
    """Resolve display name, email, and model from agent config following priority rules."""
    config = agent.get('config') or {}
    identity = config.get('identity') or {}

    # Name: config.identity.name > config.name > config.displayName > agent.name
    display_name = (
        identity.get('name')
        or config.get('name')
        or config.get('displayName')
        or agent.get('name', '')
    )

    # Email: config.identity.email > config.email > agent.email (never show raw UUIDs)
    email = (
        identity.get('email')
        or config.get('email')
        or agent.get('email', '')
    )

    # Filter out UUID emails
    if email and re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', email, re.IGNORECASE):
        email = ''

    # Avatar initial: first letter of resolved display name
    avatar_initial = display_name[0].upper() if display_name else '?'

    # Model: if dict, use modelId or provider; otherwise use as-is
    model_raw = config.get('model', '')
    if isinstance(model_raw, dict):
        model = model_raw.get('modelId') or model_raw.get('provider') or ''
    else:
        model = model_raw

    return display_name, email, avatar_initial, model


@agents_bp.route('/agents')
@login_required
def agents():
    data = api_request('GET', '/api/agents')
    return render_template(
        'agents.html',
        active_page='agents',
        user=session.get('user', {}),
        agents=data.get('agents', []),
    )


def _parse_comma_list(value):
    """Parse a comma-separated string into a list, stripping whitespace."""
    if not value:
        return []
    return [item.strip() for item in value.split(',') if item.strip()]


@agents_bp.route('/api/providers/<provider_id>/models')
@login_required
def provider_models(provider_id):
    from flask import jsonify
    data = api_request('GET', f'/api/providers/{provider_id}/models')
    return jsonify(data)


@agents_bp.route('/agents/<id>')
@login_required
def agent_detail(id):
    data = api_request('GET', f'/api/agents/{id}')
    agent = data.get('agent') or data

    display_name, email, avatar_initial, model = _resolve_agent_fields(agent)

    config = agent.get('config') or {}
    persona = config.get('persona') or {}
    traits = persona.get('traits') or {}
    permissions = config.get('permissions') or agent.get('permissions') or {}

    # Fetch activity data (events, tool calls, journal) — each wrapped in try/except
    events = []
    try:
        ev_data = api_request('GET', f'/activity/events?agentId={id}&limit=50')
        events = ev_data.get('events', [])
    except Exception:
        pass

    tool_calls = []
    try:
        tc_data = api_request('GET', f'/activity/tool-calls?agentId={id}&limit=50')
        tool_calls = tc_data.get('toolCalls', [])
    except Exception:
        pass

    journal_entries = []
    try:
        j_data = api_request('GET', f'/journal?agentId={id}&orgId=default&limit=50')
        journal_entries = j_data.get('entries', [])
    except Exception:
        pass

    # Fetch tool security data
    tool_security = {}
    org_defaults = {}
    agent_overrides = {}
    try:
        ts_data = api_request('GET', f'/engine/agents/{id}/tool-security')
        tool_security = ts_data.get('toolSecurity') or {}
        org_defaults = ts_data.get('orgDefaults') or {}
        agent_overrides = ts_data.get('agentOverrides') or {}
    except Exception:
        pass

    return render_template(
        'agent_detail.html',
        active_page='agents',
        user=session.get('user', {}),
        agent=agent,
        display_name=display_name,
        email=email,
        avatar_initial=avatar_initial,
        model=model,
        config=config,
        persona=persona,
        traits=traits,
        permissions=permissions,
        profile=permissions,
        events=events,
        tool_calls=tool_calls,
        journal_entries=journal_entries,
        tool_security=tool_security,
        org_defaults=org_defaults,
        agent_overrides=agent_overrides,
    )


@agents_bp.route('/agents/<id>/tool-security', methods=['POST'])
@login_required
def save_agent_tool_security(id):
    tool_sec = {
        'security': {
            'pathSandbox': {
                'enabled': 'ps_enabled' in request.form,
                'allowedDirs': _parse_comma_list(request.form.get('ps_allowedDirs', '')),
                'blockedPatterns': _parse_comma_list(request.form.get('ps_blockedPatterns', '')),
            },
            'ssrf': {
                'enabled': 'ssrf_enabled' in request.form,
                'allowedHosts': _parse_comma_list(request.form.get('ssrf_allowedHosts', '')),
                'blockedCidrs': _parse_comma_list(request.form.get('ssrf_blockedCidrs', '')),
            },
            'commandSanitizer': {
                'enabled': 'cs_enabled' in request.form,
                'mode': request.form.get('cs_mode', 'blocklist'),
                'allowedCommands': _parse_comma_list(request.form.get('cs_allowedCommands', '')),
                'blockedPatterns': _parse_comma_list(request.form.get('cs_blockedPatterns', '')),
            },
        },
        'middleware': {
            'audit': {
                'enabled': 'audit_enabled' in request.form,
                'redactKeys': _parse_comma_list(request.form.get('audit_redactKeys', '')),
            },
            'rateLimit': {
                'enabled': 'rl_enabled' in request.form,
                'overrides': {},
            },
            'circuitBreaker': {
                'enabled': 'cb_enabled' in request.form,
            },
            'telemetry': {
                'enabled': 'tel_enabled' in request.form,
            },
        },
    }
    result = api_request('PATCH', f'/engine/agents/{id}/tool-security', {
        'toolSecurity': tool_sec,
        'updatedBy': 'dashboard',
    })
    if 'error' in result:
        flash(result.get('error', 'Failed to save tool security'))
    else:
        flash('Agent tool security saved!')
    return redirect(url_for('agents_bp.agent_detail', id=id))


@agents_bp.route('/agents/<id>/tool-security/reset', methods=['POST'])
@login_required
def reset_agent_tool_security(id):
    result = api_request('PATCH', f'/engine/agents/{id}/tool-security', {
        'toolSecurity': {},
        'updatedBy': 'dashboard',
    })
    if 'error' in result:
        flash(result.get('error', 'Failed to reset tool security'))
    else:
        flash('Tool security reset to org defaults')
    return redirect(url_for('agents_bp.agent_detail', id=id))


@agents_bp.route('/agents/<id>/deploy', methods=['POST'])
@login_required
def deploy_agent(id):
    api_request('POST', f'/api/agents/{id}/deploy')
    flash('Agent deployed')
    return redirect(url_for('agents_bp.agent_detail', id=id))


@agents_bp.route('/agents/<id>/stop', methods=['POST'])
@login_required
def stop_agent(id):
    api_request('POST', f'/api/agents/{id}/stop')
    flash('Agent stopped')
    return redirect(url_for('agents_bp.agent_detail', id=id))


@agents_bp.route('/agents/<id>/restart', methods=['POST'])
@login_required
def restart_agent(id):
    api_request('POST', f'/api/agents/{id}/restart')
    flash('Agent restarted')
    return redirect(url_for('agents_bp.agent_detail', id=id))


@agents_bp.route('/agents/create', methods=['POST'])
@login_required
def create_agent():
    body = {
        'name': request.form['name'],
        'role': request.form.get('role', 'assistant'),
        'provider': request.form.get('provider', 'anthropic'),
        'model': request.form.get('model') or None,
        'persona': {
            'gender': request.form.get('gender') or None,
            'dateOfBirth': request.form.get('date_of_birth') or None,
            'maritalStatus': request.form.get('marital_status') or None,
            'culturalBackground': request.form.get('cultural_background') or None,
            'language': request.form.get('language') or None,
            'traits': {
                'communication': request.form.get('trait_communication', 'direct'),
                'detail': request.form.get('trait_detail', 'detail-oriented'),
                'energy': request.form.get('trait_energy', 'calm'),
                'humor': request.form.get('humor') or 'warm',
                'formality': request.form.get('formality') or 'adaptive',
                'empathy': request.form.get('empathy') or 'moderate',
                'patience': request.form.get('patience') or 'patient',
                'creativity': request.form.get('creativity') or 'creative',
            },
        },
    }
    if request.form.get('soul_id'):
        body['soul_id'] = request.form['soul_id']
    if request.form.get('email'):
        body['email'] = request.form['email']
    result = api_request('POST', '/api/agents', body)
    flash('Agent created!' if 'id' in result else result.get('error', 'Failed'))
    return redirect(url_for('agents_bp.agents'))


@agents_bp.route('/agents/<id>/journal/<entry_id>/rollback', methods=['POST'])
@login_required
def rollback_journal(id, entry_id):
    result = api_request('POST', f'/journal/{entry_id}/rollback', body={})
    if result.get('success'):
        flash('Journal entry rolled back')
    else:
        flash(result.get('error', 'Rollback failed'))
    return redirect(url_for('agents_bp.agent_detail', id=id))


@agents_bp.route('/agents/<id>/archive', methods=['POST'])
@login_required
def archive_agent(id):
    api_request('POST', f'/api/agents/{id}/archive')
    flash('Agent archived')
    return redirect(url_for('agents_bp.agents'))
