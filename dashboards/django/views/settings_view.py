"""
Settings view: display and update organization settings.
Named settings_view to avoid conflict with django.conf.settings.
"""

from django.http import HttpResponse, HttpResponseRedirect
from django.template.loader import render_to_string

from utils.api import api_request
from utils.helpers import badge, page_context


def _default_firewall():
    """Return the default firewall config shape."""
    return {
        'ipAccess': {'enabled': False, 'mode': 'allowlist', 'allowlist': [], 'blocklist': [], 'bypassPaths': ['/health', '/ready']},
        'egress': {'enabled': False, 'mode': 'blocklist', 'allowedHosts': [], 'blockedHosts': [], 'allowedPorts': [], 'blockedPorts': []},
        'proxy': {'httpProxy': '', 'httpsProxy': '', 'noProxy': ['localhost', '127.0.0.1']},
        'trustedProxies': {'enabled': False, 'ips': []},
        'network': {
            'corsOrigins': [],
            'rateLimit': {'enabled': True, 'requestsPerMinute': 120, 'skipPaths': ['/health', '/ready']},
            'httpsEnforcement': {'enabled': False, 'excludePaths': []},
            'securityHeaders': {'hsts': True, 'hstsMaxAge': 31536000, 'xFrameOptions': 'DENY', 'xContentTypeOptions': True, 'referrerPolicy': 'strict-origin-when-cross-origin', 'permissionsPolicy': 'camera=(), microphone=(), geolocation()'},
        },
    }


def _parse_comma_int_list(value):
    """Parse a comma-separated string into a list of integers."""
    if not value:
        return []
    result = []
    for item in value.split(','):
        item = item.strip()
        if item:
            try:
                result.append(int(item))
            except ValueError:
                pass
    return result


def _default_tool_security():
    """Return the default tool security config shape."""
    return {
        'security': {
            'pathSandbox': {'enabled': True, 'allowedDirs': [], 'blockedPatterns': []},
            'ssrf': {'enabled': True, 'allowedHosts': [], 'blockedCidrs': []},
            'commandSanitizer': {'enabled': True, 'mode': 'blocklist', 'allowedCommands': [], 'blockedPatterns': []},
        },
        'middleware': {
            'audit': {'enabled': True, 'redactKeys': []},
            'rateLimit': {'enabled': True, 'overrides': {}},
            'circuitBreaker': {'enabled': True},
            'telemetry': {'enabled': True},
        },
    }


def _parse_comma_list(value):
    """Parse a comma-separated string into a list, stripping whitespace."""
    if not value:
        return []
    return [item.strip() for item in value.split(',') if item.strip()]


def settings_view(request):
    """Handle settings display and update."""
    if not request.session.get('token'):
        return HttpResponseRedirect('/login')

    token = request.session['token']
    flash_msg = request.session.pop('flash', None)

    if request.method == 'POST':
        action = request.POST.get('_action', 'general')
        if action == 'firewall':
            fw_payload = {
                'ipAccess': {
                    'enabled': 'fw_ip_enabled' in request.POST,
                    'mode': request.POST.get('fw_ip_mode', 'allowlist'),
                    'allowlist': _parse_comma_list(request.POST.get('fw_ip_allowlist', '')),
                    'blocklist': _parse_comma_list(request.POST.get('fw_ip_blocklist', '')),
                    'bypassPaths': _parse_comma_list(request.POST.get('fw_ip_bypassPaths', '')),
                },
                'egress': {
                    'enabled': 'fw_egress_enabled' in request.POST,
                    'mode': request.POST.get('fw_egress_mode', 'blocklist'),
                    'allowedHosts': _parse_comma_list(request.POST.get('fw_egress_allowedHosts', '')),
                    'blockedHosts': _parse_comma_list(request.POST.get('fw_egress_blockedHosts', '')),
                    'allowedPorts': _parse_comma_int_list(request.POST.get('fw_egress_allowedPorts', '')),
                    'blockedPorts': _parse_comma_int_list(request.POST.get('fw_egress_blockedPorts', '')),
                },
                'proxy': {
                    'httpProxy': request.POST.get('fw_proxy_http', ''),
                    'httpsProxy': request.POST.get('fw_proxy_https', ''),
                    'noProxy': _parse_comma_list(request.POST.get('fw_proxy_noProxy', '')),
                },
                'trustedProxies': {
                    'enabled': 'fw_tp_enabled' in request.POST,
                    'ips': _parse_comma_list(request.POST.get('fw_tp_ips', '')),
                },
                'network': {
                    'corsOrigins': _parse_comma_list(request.POST.get('fw_net_corsOrigins', '')),
                    'rateLimit': {
                        'enabled': 'fw_net_rl_enabled' in request.POST,
                        'requestsPerMinute': int(request.POST.get('fw_net_rl_rpm', '120') or '120'),
                        'skipPaths': _parse_comma_list(request.POST.get('fw_net_rl_skipPaths', '')),
                    },
                    'httpsEnforcement': {
                        'enabled': 'fw_net_https_enabled' in request.POST,
                        'excludePaths': _parse_comma_list(request.POST.get('fw_net_https_excludePaths', '')),
                    },
                    'securityHeaders': {
                        'hsts': 'fw_sh_hsts' in request.POST,
                        'hstsMaxAge': int(request.POST.get('fw_sh_hstsMaxAge', '31536000') or '31536000'),
                        'xFrameOptions': request.POST.get('fw_sh_xFrameOptions', 'DENY'),
                        'xContentTypeOptions': 'fw_sh_xContentTypeOptions' in request.POST,
                        'referrerPolicy': request.POST.get('fw_sh_referrerPolicy', 'strict-origin-when-cross-origin'),
                        'permissionsPolicy': request.POST.get('fw_sh_permissionsPolicy', ''),
                    },
                },
            }
            result = api_request('PUT', '/api/settings/firewall', body=fw_payload, token=token)
            request.session['flash'] = 'Network & firewall settings saved!' if 'error' not in result else result.get('error', 'Failed')
        elif action == 'model_pricing':
            # Collect existing models from hidden fields
            model_count = int(request.POST.get('mp_model_count', '0') or '0')
            models = []
            for i in range(model_count):
                provider = request.POST.get(f'mp_provider_{i}', '').strip()
                model_id = request.POST.get(f'mp_modelId_{i}', '').strip()
                if provider and model_id:
                    models.append({
                        'provider': provider,
                        'modelId': model_id,
                        'displayName': request.POST.get(f'mp_displayName_{i}', '').strip(),
                        'inputCostPerMillion': float(request.POST.get(f'mp_input_{i}', '0') or '0'),
                        'outputCostPerMillion': float(request.POST.get(f'mp_output_{i}', '0') or '0'),
                        'contextWindow': int(request.POST.get(f'mp_context_{i}', '0') or '0'),
                    })
            # Check for new model being added
            new_provider = request.POST.get('mp_new_provider', '').strip()
            new_model_id = request.POST.get('mp_new_modelId', '').strip()
            if new_provider and new_model_id:
                models.append({
                    'provider': new_provider,
                    'modelId': new_model_id,
                    'displayName': request.POST.get('mp_new_displayName', '').strip(),
                    'inputCostPerMillion': float(request.POST.get('mp_new_input', '0') or '0'),
                    'outputCostPerMillion': float(request.POST.get('mp_new_output', '0') or '0'),
                    'contextWindow': int(request.POST.get('mp_new_context', '0') or '0'),
                })
            mp_payload = {
                'models': models,
                'currency': request.POST.get('mp_currency', 'USD'),
            }
            result = api_request('PUT', '/api/settings/model-pricing', body=mp_payload, token=token)
            request.session['flash'] = 'Model pricing saved!' if 'error' not in result else result.get('error', 'Failed')
        elif action == 'tool_security':
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
            result = api_request('PUT', '/api/settings/tool-security', body=tool_sec, token=token)
            request.session['flash'] = 'Tool security saved!' if 'error' not in result else result.get('error', 'Failed')
        else:
            result = api_request('PATCH', '/api/settings', body={
                'name': request.POST.get('name', ''),
                'domain': request.POST.get('domain', ''),
                'primaryColor': request.POST.get('primaryColor', '#e84393'),
            }, token=token)
            request.session['flash'] = 'Settings saved!' if 'error' not in result else result.get('error', 'Failed')
        return HttpResponseRedirect('/settings')

    s = api_request('GET', '/api/settings', token=token)
    retention = api_request('GET', '/api/retention', token=token)

    # Fetch tool security config
    ts_data = api_request('GET', '/api/settings/tool-security', token=token)
    ts_config = ts_data.get('toolSecurityConfig') or {}
    defaults = _default_tool_security()
    tool_security = {
        'security': ts_config.get('security') or defaults['security'],
        'middleware': ts_config.get('middleware') or defaults['middleware'],
    }

    # Pre-extract nested values for Django template (no nested dict access)
    ts_sec = tool_security.get('security') or {}
    ts_mw = tool_security.get('middleware') or {}
    ts_ps = ts_sec.get('pathSandbox') or {}
    ts_ssrf = ts_sec.get('ssrf') or {}
    ts_cs = ts_sec.get('commandSanitizer') or {}
    ts_audit = ts_mw.get('audit') or {}
    ts_rl = ts_mw.get('rateLimit') or {}
    ts_cb = ts_mw.get('circuitBreaker') or {}
    ts_tel = ts_mw.get('telemetry') or {}

    # Fetch firewall config
    fw_data = api_request('GET', '/api/settings/firewall', token=token)
    fw_config = fw_data.get('firewallConfig') or {}
    fw_defaults = _default_firewall()
    fw_ipAccess = fw_config.get('ipAccess') or fw_defaults['ipAccess']
    fw_egress = fw_config.get('egress') or fw_defaults['egress']
    fw_proxy = fw_config.get('proxy') or fw_defaults['proxy']
    fw_trustedProxies = fw_config.get('trustedProxies') or fw_defaults['trustedProxies']
    fw_network = fw_config.get('network') or fw_defaults['network']
    fw_netRl = fw_network.get('rateLimit') or {}
    fw_httpsEnf = fw_network.get('httpsEnforcement') or {}
    fw_secHeaders = fw_network.get('securityHeaders') or {}

    ctx = page_context(request, 'Settings', 'settings')
    ctx['flash_msg'] = flash_msg
    ctx['s'] = s
    ctx['plan_badge'] = badge((s.get('plan', 'free')).upper())
    ctx['retention'] = retention
    ctx['retention_no_error'] = retention and 'error' not in retention
    ctx['ts_ps'] = ts_ps
    ctx['ts_ssrf'] = ts_ssrf
    ctx['ts_cs'] = ts_cs
    ctx['ts_audit'] = ts_audit
    ctx['ts_rl'] = ts_rl
    ctx['ts_cb'] = ts_cb
    ctx['ts_tel'] = ts_tel
    ctx['ts_ps_allowedDirs'] = ', '.join(ts_ps.get('allowedDirs') or [])
    ctx['ts_ps_blockedPatterns'] = ', '.join(ts_ps.get('blockedPatterns') or [])
    ctx['ts_ssrf_allowedHosts'] = ', '.join(ts_ssrf.get('allowedHosts') or [])
    ctx['ts_ssrf_blockedCidrs'] = ', '.join(ts_ssrf.get('blockedCidrs') or [])
    ctx['ts_cs_allowedCommands'] = ', '.join(ts_cs.get('allowedCommands') or [])
    ctx['ts_cs_blockedPatterns'] = ', '.join(ts_cs.get('blockedPatterns') or [])
    ctx['ts_cs_mode'] = ts_cs.get('mode') or 'blocklist'
    ctx['ts_audit_redactKeys'] = ', '.join(ts_audit.get('redactKeys') or [])

    # Firewall context
    ctx['fw_ipAccess'] = fw_ipAccess
    ctx['fw_egress'] = fw_egress
    ctx['fw_proxy'] = fw_proxy
    ctx['fw_trustedProxies'] = fw_trustedProxies
    ctx['fw_network'] = fw_network
    ctx['fw_netRl'] = fw_netRl
    ctx['fw_httpsEnf'] = fw_httpsEnf
    ctx['fw_secHeaders'] = fw_secHeaders
    ctx['fw_ip_allowlist'] = ', '.join(fw_ipAccess.get('allowlist') or [])
    ctx['fw_ip_blocklist'] = ', '.join(fw_ipAccess.get('blocklist') or [])
    ctx['fw_ip_bypassPaths'] = ', '.join(fw_ipAccess.get('bypassPaths') or [])
    ctx['fw_ip_mode'] = fw_ipAccess.get('mode') or 'allowlist'
    ctx['fw_egress_mode'] = fw_egress.get('mode') or 'blocklist'
    ctx['fw_egress_allowedHosts'] = ', '.join(fw_egress.get('allowedHosts') or [])
    ctx['fw_egress_blockedHosts'] = ', '.join(fw_egress.get('blockedHosts') or [])
    ctx['fw_egress_allowedPorts'] = ', '.join(str(p) for p in (fw_egress.get('allowedPorts') or []))
    ctx['fw_egress_blockedPorts'] = ', '.join(str(p) for p in (fw_egress.get('blockedPorts') or []))
    ctx['fw_proxy_http'] = fw_proxy.get('httpProxy') or ''
    ctx['fw_proxy_https'] = fw_proxy.get('httpsProxy') or ''
    ctx['fw_proxy_noProxy'] = ', '.join(fw_proxy.get('noProxy') or [])
    ctx['fw_tp_ips'] = ', '.join(fw_trustedProxies.get('ips') or [])
    ctx['fw_net_corsOrigins'] = ', '.join(fw_network.get('corsOrigins') or [])
    ctx['fw_net_rl_rpm'] = fw_netRl.get('requestsPerMinute') or 120
    ctx['fw_net_rl_skipPaths'] = ', '.join(fw_netRl.get('skipPaths') or [])
    ctx['fw_net_https_excludePaths'] = ', '.join(fw_httpsEnf.get('excludePaths') or [])
    ctx['fw_sh_hstsMaxAge'] = fw_secHeaders.get('hstsMaxAge') or 31536000
    ctx['fw_sh_xFrameOptions'] = fw_secHeaders.get('xFrameOptions') or 'DENY'
    ctx['fw_sh_referrerPolicy'] = fw_secHeaders.get('referrerPolicy') or 'strict-origin-when-cross-origin'
    ctx['fw_sh_permissionsPolicy'] = fw_secHeaders.get('permissionsPolicy') or ''

    # Fetch model pricing config
    mp_data = api_request('GET', '/api/settings/model-pricing', token=token)
    mp_config = mp_data.get('modelPricingConfig') or {}
    mp_models = mp_config.get('models') or []
    mp_currency = mp_config.get('currency') or 'USD'

    # Group models by provider for display
    mp_providers_dict = {}
    for m in mp_models:
        prov = m.get('provider', 'unknown')
        if prov not in mp_providers_dict:
            mp_providers_dict[prov] = []
        mp_providers_dict[prov].append(m)

    # Build list of (provider, models) tuples for Django template iteration
    mp_provider_groups = []
    for prov, prov_models in mp_providers_dict.items():
        enriched_models = []
        for m in prov_models:
            enriched_models.append({
                'idx': mp_models.index(m),
                'provider': m.get('provider', ''),
                'modelId': m.get('modelId', ''),
                'displayName': m.get('displayName', ''),
                'inputCostPerMillion': m.get('inputCostPerMillion', 0),
                'outputCostPerMillion': m.get('outputCostPerMillion', 0),
                'contextWindow': m.get('contextWindow', 0),
            })
        mp_provider_groups.append({'provider': prov, 'models': enriched_models})

    ctx['mp_models'] = mp_models
    ctx['mp_currency'] = mp_currency
    ctx['mp_model_count'] = len(mp_models)
    ctx['mp_provider_groups'] = mp_provider_groups
    ctx['mp_has_models'] = len(mp_models) > 0

    html = render_to_string('settings.html', ctx)
    return HttpResponse(html)
