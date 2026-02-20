"""
Agents view: list, create, detail, and archive agents.
"""

import json
import re

from django.http import HttpResponse, HttpResponseRedirect
from django.template.loader import render_to_string
from django.utils.safestring import mark_safe

from utils.api import api_request
from utils.helpers import badge, page_context


def _parse_comma_list(value):
    """Parse a comma-separated string into a list, stripping whitespace."""
    if not value:
        return []
    return [item.strip() for item in value.split(',') if item.strip()]


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


def provider_models_view(request, provider_id):
    """API proxy: fetch available models for a given provider."""
    if not request.session.get('token'):
        return HttpResponse('{"error":"unauthorized"}', content_type='application/json', status=401)
    token = request.session['token']
    data = api_request('GET', f'/api/providers/{provider_id}/models', token=token)
    return HttpResponse(json.dumps(data), content_type='application/json')


def agents_view(request):
    """Handle agent listing, creation, and archival."""
    if not request.session.get('token'):
        return HttpResponseRedirect('/login')

    token = request.session['token']
    flash_msg = request.session.pop('flash', None)

    if request.method == 'POST':
        action = request.POST.get('_action')
        if action == 'create':
            body = {
                'name': request.POST['name'],
                'role': request.POST.get('role', 'assistant'),
                'provider': request.POST.get('provider', 'anthropic'),
                'model': request.POST.get('model') or None,
                'persona': {
                    'gender': request.POST.get('gender') or None,
                    'dateOfBirth': request.POST.get('date_of_birth') or None,
                    'maritalStatus': request.POST.get('marital_status') or None,
                    'culturalBackground': request.POST.get('cultural_background') or None,
                    'language': request.POST.get('language') or None,
                    'traits': {
                        'communication': request.POST.get('trait_communication', 'direct'),
                        'detail': request.POST.get('trait_detail', 'detail-oriented'),
                        'energy': request.POST.get('trait_energy', 'calm'),
                        'humor': request.POST.get('humor') or 'warm',
                        'formality': request.POST.get('formality') or 'adaptive',
                        'empathy': request.POST.get('empathy') or 'moderate',
                        'patience': request.POST.get('patience') or 'patient',
                        'creativity': request.POST.get('creativity') or 'creative',
                    },
                },
            }
            if request.POST.get('soul_id'):
                body['soul_id'] = request.POST['soul_id']
            if request.POST.get('email'):
                body['email'] = request.POST['email']
            result = api_request('POST', '/api/agents', body=body, token=token)
            request.session['flash'] = 'Agent created!' if 'id' in result else result.get('error', 'Failed')
        elif action == 'archive':
            agent_id = request.POST.get('agent_id')
            api_request('POST', f'/api/agents/{agent_id}/archive', token=token)
            request.session['flash'] = 'Agent archived'
        return HttpResponseRedirect('/agents')

    data = api_request('GET', '/api/agents', token=token)
    agents = data.get('agents', [])

    # Add badge HTML to each agent for template rendering
    for a in agents:
        a['status_badge'] = badge(a.get('status', ''))

    ctx = page_context(request, 'Agents', 'agents')
    ctx['flash_msg'] = flash_msg
    ctx['agents'] = agents

    html = render_to_string('agents.html', ctx)
    return HttpResponse(html)


def agent_detail_view(request, agent_id):
    """Show agent detail page, handle deploy/stop/restart actions."""
    if not request.session.get('token'):
        return HttpResponseRedirect('/login')

    token = request.session['token']
    flash_msg = request.session.pop('flash', None)

    # Handle action POSTs
    if request.method == 'POST':
        action = request.POST.get('_action')
        if action == 'deploy':
            api_request('POST', f'/api/agents/{agent_id}/deploy', token=token)
            request.session['flash'] = 'Agent deployed'
        elif action == 'stop':
            api_request('POST', f'/api/agents/{agent_id}/stop', token=token)
            request.session['flash'] = 'Agent stopped'
        elif action == 'restart':
            api_request('POST', f'/api/agents/{agent_id}/restart', token=token)
            request.session['flash'] = 'Agent restarted'
        elif action == 'rollback_journal':
            entry_id = request.POST.get('entry_id')
            result = api_request('POST', f'/journal/{entry_id}/rollback', body={}, token=token)
            if result.get('success'):
                request.session['flash'] = 'Journal entry rolled back'
            else:
                request.session['flash'] = result.get('error', 'Rollback failed')
        elif action == 'save_tool_security':
            tool_sec = {
                'security': {
                    'pathSandbox': {
                        'enabled': 'ps_enabled' in request.POST,
                        'allowedDirs': _parse_comma_list(request.POST.get('ps_allowedDirs', '')),
                        'blockedPatterns': _parse_comma_list(request.POST.get('ps_blockedPatterns', '')),
                    },
                    'ssrf': {
                        'enabled': 'ssrf_enabled' in request.POST,
                        'allowedHosts': _parse_comma_list(request.POST.get('ssrf_allowedHosts', '')),
                        'blockedCidrs': _parse_comma_list(request.POST.get('ssrf_blockedCidrs', '')),
                    },
                    'commandSanitizer': {
                        'enabled': 'cs_enabled' in request.POST,
                        'mode': request.POST.get('cs_mode', 'blocklist'),
                        'allowedCommands': _parse_comma_list(request.POST.get('cs_allowedCommands', '')),
                        'blockedPatterns': _parse_comma_list(request.POST.get('cs_blockedPatterns', '')),
                    },
                },
                'middleware': {
                    'audit': {
                        'enabled': 'audit_enabled' in request.POST,
                        'redactKeys': _parse_comma_list(request.POST.get('audit_redactKeys', '')),
                    },
                    'rateLimit': {
                        'enabled': 'rl_enabled' in request.POST,
                        'overrides': {},
                    },
                    'circuitBreaker': {
                        'enabled': 'cb_enabled' in request.POST,
                    },
                    'telemetry': {
                        'enabled': 'tel_enabled' in request.POST,
                    },
                },
            }
            result = api_request('PATCH', f'/engine/agents/{agent_id}/tool-security', body={
                'toolSecurity': tool_sec,
                'updatedBy': 'dashboard',
            }, token=token)
            if 'error' in result:
                request.session['flash'] = result.get('error', 'Failed to save tool security')
            else:
                request.session['flash'] = 'Agent tool security saved!'
        elif action == 'reset_tool_security':
            result = api_request('PATCH', f'/engine/agents/{agent_id}/tool-security', body={
                'toolSecurity': {},
                'updatedBy': 'dashboard',
            }, token=token)
            if 'error' in result:
                request.session['flash'] = result.get('error', 'Failed to reset tool security')
            else:
                request.session['flash'] = 'Tool security reset to org defaults'
        return HttpResponseRedirect(f'/agents/{agent_id}')

    data = api_request('GET', f'/api/agents/{agent_id}', token=token)
    agent = data.get('agent') or data

    display_name, email, avatar_initial, model = _resolve_agent_fields(agent)

    config = agent.get('config') or {}
    persona = config.get('persona') or {}
    traits = persona.get('traits') or {}
    permissions = config.get('permissions') or agent.get('permissions') or {}

    # Build traits list for template (handle both dict and list)
    traits_items = []
    if isinstance(traits, dict):
        traits_items = list(traits.items())
    elif isinstance(traits, list):
        traits_items = [(t, None) for t in traits]

    # Build permissions list for template
    permissions_items = []
    if isinstance(permissions, dict):
        permissions_items = list(permissions.items())

    # Personal detail rows
    personal_details = []
    if persona.get('gender'):
        personal_details.append(('Gender', persona['gender']))
    if persona.get('dateOfBirth'):
        personal_details.append(('Date of Birth', persona['dateOfBirth']))
    if persona.get('maritalStatus'):
        personal_details.append(('Marital Status', persona['maritalStatus']))
    if persona.get('culturalBackground'):
        personal_details.append(('Cultural Background', persona['culturalBackground']))
    if persona.get('language'):
        personal_details.append(('Language', persona['language']))

    status_text = agent.get('state') or agent.get('status') or 'unknown'
    role_text = agent.get('role') or config.get('role') or ''
    description = config.get('description') or agent.get('description') or persona.get('description') or ''
    created = agent.get('createdAt') or agent.get('created_at') or ''
    agent_id_val = agent.get('id') or agent.get('agentId') or agent_id

    # Fetch activity data (events, tool calls, journal) — each wrapped in try/except
    events = []
    try:
        ev_data = api_request('GET', f'/activity/events?agentId={agent_id}&limit=50', token=token)
        events = ev_data.get('events', [])
    except Exception:
        pass

    tool_calls = []
    try:
        tc_data = api_request('GET', f'/activity/tool-calls?agentId={agent_id}&limit=50', token=token)
        tool_calls = tc_data.get('toolCalls', [])
    except Exception:
        pass

    journal_entries = []
    try:
        j_data = api_request('GET', f'/journal?agentId={agent_id}&orgId=default&limit=50', token=token)
        journal_entries = j_data.get('entries', [])
    except Exception:
        pass

    # Fetch tool security data
    tool_security = {}
    org_defaults = {}
    agent_overrides = {}
    try:
        ts_data = api_request('GET', f'/engine/agents/{agent_id}/tool-security', token=token)
        tool_security = ts_data.get('toolSecurity') or {}
        org_defaults = ts_data.get('orgDefaults') or {}
        agent_overrides = ts_data.get('agentOverrides') or {}
    except Exception:
        pass

    # Pre-extract nested tool security values for Django template
    ts_sec = tool_security.get('security') or {}
    ts_mw = tool_security.get('middleware') or {}
    ts_ps = ts_sec.get('pathSandbox') or {}
    ts_ssrf = ts_sec.get('ssrf') or {}
    ts_cs = ts_sec.get('commandSanitizer') or {}
    ts_audit = ts_mw.get('audit') or {}
    ts_rl = ts_mw.get('rateLimit') or {}
    ts_cb = ts_mw.get('circuitBreaker') or {}
    ts_tel = ts_mw.get('telemetry') or {}

    has_overrides = bool(agent_overrides.get('security') or agent_overrides.get('middleware'))

    ctx = page_context(request, display_name, 'agents')
    ctx['flash_msg'] = flash_msg
    ctx['agent'] = agent
    ctx['agent_id'] = agent_id_val
    ctx['display_name'] = display_name
    ctx['email'] = email
    ctx['avatar_initial'] = avatar_initial
    ctx['model'] = model or '-'
    ctx['status_text'] = status_text
    ctx['status_badge_html'] = badge(status_text)
    ctx['role_text'] = role_text
    ctx['role_badge_html'] = badge(role_text) if role_text else ''
    ctx['description'] = description
    ctx['traits_items'] = traits_items
    ctx['permissions_items'] = permissions_items
    ctx['profile'] = permissions
    ctx['personal_details'] = personal_details
    ctx['created'] = created
    ctx['events'] = events
    ctx['tool_calls'] = tool_calls
    ctx['journal_entries'] = journal_entries
    ctx['events_json'] = mark_safe(json.dumps(events))
    ctx['tool_calls_json'] = mark_safe(json.dumps(tool_calls))
    ctx['journal_entries_json'] = mark_safe(json.dumps(journal_entries))
    ctx['ts_ps'] = ts_ps
    ctx['ts_ssrf'] = ts_ssrf
    ctx['ts_cs'] = ts_cs
    ctx['ts_audit'] = ts_audit
    ctx['ts_rl'] = ts_rl
    ctx['ts_cb'] = ts_cb
    ctx['ts_tel'] = ts_tel
    ctx['ts_has_overrides'] = has_overrides
    ctx['ts_ps_allowedDirs'] = ', '.join(ts_ps.get('allowedDirs') or [])
    ctx['ts_ps_blockedPatterns'] = ', '.join(ts_ps.get('blockedPatterns') or [])
    ctx['ts_ssrf_allowedHosts'] = ', '.join(ts_ssrf.get('allowedHosts') or [])
    ctx['ts_ssrf_blockedCidrs'] = ', '.join(ts_ssrf.get('blockedCidrs') or [])
    ctx['ts_cs_allowedCommands'] = ', '.join(ts_cs.get('allowedCommands') or [])
    ctx['ts_cs_blockedPatterns'] = ', '.join(ts_cs.get('blockedPatterns') or [])
    ctx['ts_cs_mode'] = ts_cs.get('mode') or 'blocklist'
    ctx['ts_audit_redactKeys'] = ', '.join(ts_audit.get('redactKeys') or [])

    html = render_to_string('agent_detail.html', ctx)
    return HttpResponse(html)
